/**
 * Celular em pé: sugere virar para a horizontal (a tela de desenho fica maior
 * e todas as canetas ficam à vista). É só uma sugestão — o modo em pé continua
 * a funcionar, e "Continuar em pé" não volta a perguntar.
 *
 * No Android dá para entrar em tela cheia já deitado (Screen Orientation API);
 * o iPhone não deixa um site travar a orientação, por isso lá o botão some.
 */
import { t } from './i18n.js';
import { icon } from './icons.js';
import { playOpen, playClose } from './audio.js';

const KEY = 'retrobit-rotate-ok';
const PHONE_PORTRAIT = '(orientation: portrait) and (max-width: 599px) and (pointer: coarse)';

function dismissed() {
  try { return Boolean(localStorage.getItem(KEY)); } catch { return false; }
}
function remember() {
  try { localStorage.setItem(KEY, '1'); } catch { /* sem storage */ }
}

const canGoFullLandscape = () => Boolean(document.fullscreenEnabled && screen.orientation?.lock);

/** Tela cheia + horizontal (Android). Falhar não é grave: fica como está. */
async function fullLandscape() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation.lock('landscape');
  } catch { /* o navegador não deixou */ }
}

/**
 * Mostra a sugestão se for um celular em pé (e ainda não a dispensaram).
 * Resolve quando a janela fecha — ou logo, se não houver nada a mostrar.
 */
export function maybeShowRotateHint() {
  const mq = matchMedia(PHONE_PORTRAIT);
  if (!mq.matches || dismissed()) return Promise.resolve();

  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'modal-backdrop rotate-hint';
    root.innerHTML = `
      <div class="win rotate-win" role="dialog" aria-modal="true" aria-labelledby="rotate-title">
        <div class="win__bar"><span>${t('dica')}</span></div>
        <div class="rotate-win__body">
          <div class="rotate-phone" aria-hidden="true">${icon('phone')}</div>
          <p class="del-win__msg"><span id="rotate-title">${t('Vire o celular de lado')}</span><br>
            <span class="del-win__sub">${t('Na horizontal a tela de desenho fica maior e todas as canetas ficam à vista.')}</span></p>
          <div class="del-win__foot">
            <button type="button" class="ui-btn rotate-stay">${t('Continuar em pé')}</button>
            ${canGoFullLandscape() ? `<button type="button" class="ui-btn ui-btn--go rotate-full">${t('Tela cheia deitada')}</button>` : ''}
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    playOpen();

    const close = () => {
      mq.removeEventListener('change', onChange);
      root.remove();
      playClose();
      resolve();
    };
    // Girou o celular: a sugestão cumpriu-se.
    const onChange = () => { if (!mq.matches) { remember(); close(); } };
    mq.addEventListener('change', onChange);

    root.querySelector('.rotate-stay').addEventListener('click', () => { remember(); close(); });
    root.querySelector('.rotate-full')?.addEventListener('click', async () => {
      remember();
      await fullLandscape();
      close();
    });
  });
}
