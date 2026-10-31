/**
 * Persistência dos projetos do utilizador (IndexedDB, com localStorage como reserva).
 *
 * Um projeto é: { id, name, w, h, bgColor, layers, activeLayerId, thumb, updatedAt }
 *  - layers: array de camadas { id, name, paths, visible, opacity, locked }
 *  - paths (legado): migrado para uma camada única ao abrir
 *  - thumb: dataURL pequeno para a miniatura na galeria
 *
 * As leituras são síncronas, a partir de uma cópia em memória carregada no
 * arranque (loadProjects). As escritas atualizam a memória e gravam no disco.
 *
 * Rascunho: cópia automática do desenho aberto, gravada a cada alteração, para
 * recuperar o trabalho se a aba fechar sem salvar.
 */

import { t } from './i18n.js';

const DB_NAME = 'retrobit';
const LEGACY_KEY = 'retrobit-projects'; // onde as versões ≤ 1.4 guardavam tudo
const DRAFT_ID = 'current';

let db = null; // null → IndexedDB indisponível, usa o localStorage
const projects = new Map();
let draft = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('projects', { keyPath: 'id' });
      req.result.createObjectStore('drafts', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Corre `fn(store)` numa transação; resolve com o resultado do pedido quando ela termina. */
function run(storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

function readLegacy() {
  try {
    const arr = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Reserva sem IndexedDB: grava a lista inteira (lança erro se o storage encher). */
function writeLegacy() {
  localStorage.setItem(LEGACY_KEY, JSON.stringify([...projects.values()]));
}

/** Leva os projetos do localStorage (versões antigas) para o IndexedDB. */
async function migrateLegacy() {
  const fresh = readLegacy().filter((p) => p?.id && !projects.has(p.id));
  if (fresh.length) {
    await run('projects', 'readwrite', (s) => { fresh.forEach((p) => s.put(p)); });
    fresh.forEach((p) => projects.set(p.id, p));
  }
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* sem storage */ }
}

/** Carrega tudo para memória. Chamar (e esperar) uma vez, antes de usar o resto. */
export async function loadProjects() {
  try {
    db = await openDB();
    const [list, saved] = await Promise.all([
      run('projects', 'readonly', (s) => s.getAll()),
      run('drafts', 'readonly', (s) => s.get(DRAFT_ID)),
    ]);
    list.forEach((p) => projects.set(p.id, p));
    draft = saved || null;
    await migrateLegacy();
  } catch (e) {
    console.warn('RetroBit: IndexedDB indisponível, usando localStorage', e);
    db = null;
    readLegacy().forEach((p) => projects.set(p.id, p));
  }
}

function putRecord(record) {
  return db ? run('projects', 'readwrite', (s) => s.put(record)) : writeLegacy();
}

function removeRecord(id) {
  return db ? run('projects', 'readwrite', (s) => s.delete(id)) : writeLegacy();
}

/** Escrita que não precisa de resposta (renomear, apagar, rascunho). */
function inBackground(write) {
  Promise.resolve().then(write).catch((e) => console.warn('RetroBit: falha ao gravar', e));
}

/** Lista os projetos, mais recentes primeiro. */
export function listProjects() {
  return [...projects.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getProject(id) {
  return projects.get(id) || null;
}

/** Cria ou atualiza um projeto (por id). Resolve com o projeto salvo, ou null se falhar. */
export async function saveProject(project) {
  const record = { ...project, updatedAt: Date.now() };
  const prev = projects.get(record.id);
  projects.set(record.id, record);
  try {
    await putRecord(record);
    return record;
  } catch (e) {
    // Disco cheio ou storage indisponível → desfaz a cópia em memória.
    console.warn('RetroBit: não foi possível salvar', e);
    if (prev) projects.set(record.id, prev);
    else projects.delete(record.id);
    return null;
  }
}

export function deleteProject(id) {
  projects.delete(id);
  inBackground(() => removeRecord(id));
}

/** Renomeia um projeto (por id). Devolve o projeto atualizado ou null. */
export function renameProject(id, name) {
  const p = projects.get(id);
  if (!p) return null;
  const clean = String(name).trim().slice(0, 40);
  if (!clean) return p;
  const record = { ...p, name: clean, updatedAt: Date.now() };
  projects.set(id, record);
  inBackground(() => putRecord(record));
  return record;
}

export function makeProjectId() {
  return 'p_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/** Nome incremental "Projeto N" que não colide com os existentes. */
export function nextProjectName() {
  const names = new Set([...projects.values()].map((p) => p.name));
  let n = projects.size + 1;
  while (names.has(t('Projeto {n}', { n }))) n++;
  return t('Projeto {n}', { n });
}

/* ── Rascunho (recuperação automática) ──────────────────── */

export function getDraft() {
  return draft;
}

/** Guarda o desenho aberto como rascunho. Sem IndexedDB fica só em memória (o localStorage é pequeno demais). */
export function saveDraft(doc) {
  draft = { ...doc, id: DRAFT_ID, savedAt: Date.now() };
  const record = draft;
  if (db) inBackground(() => run('drafts', 'readwrite', (s) => s.put(record)));
}

export function clearDraft() {
  draft = null;
  if (db) inBackground(() => run('drafts', 'readwrite', (s) => s.delete(DRAFT_ID)));
}
