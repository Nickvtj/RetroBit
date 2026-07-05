/**
 * Persistência dos projetos do utilizador (localStorage).
 *
 * Um projeto é: { id, name, w, h, bgColor, paths, thumb, updatedAt }
 *  - paths: os traços serializados (mesma forma de state.paths)
 *  - thumb: dataURL pequeno para a miniatura na galeria
 */

const KEY = 'retrobit-projects';

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    // localStorage cheio ou indisponível — falha silenciosa.
    console.warn('RetroBit: não foi possível guardar', e);
  }
}

/** Lista os projetos, mais recentes primeiro. */
export function listProjects() {
  return readAll().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getProject(id) {
  return readAll().find((p) => p.id === id) || null;
}

/** Cria ou atualiza um projeto (por id). Devolve o projeto guardado. */
export function saveProject(project) {
  const list = readAll();
  const now = Date.now();
  const idx = list.findIndex((p) => p.id === project.id);
  const record = { ...project, updatedAt: now };
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  writeAll(list);
  return record;
}

export function deleteProject(id) {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function makeProjectId() {
  return 'p_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/** Nome incremental "Projeto N" que não colide com os existentes. */
export function nextProjectName() {
  const names = new Set(readAll().map((p) => p.name));
  let n = readAll().length + 1;
  while (names.has(`Projeto ${n}`)) n++;
  return `Projeto ${n}`;
}
