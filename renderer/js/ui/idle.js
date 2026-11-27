// Idle screen (PS5 "Press the PS button" scene): animated gold bokeh, a spotlight
// and the PS mark. Starts after `idleSeconds` (Settings > Screen and Video > Idle Screen)
// without input; any key, click, mouse move or controller input dismisses it.

import { h } from '../util.js';
import { state } from '../state.js';
import { t } from '../i18n.js';
import { BootStage } from './bootstage.js';

const PS = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z"/></svg>';

let root = null;
let stage = null;
let last = Date.now();
let shownAt = 0;

function show() {
  if (root) return;
  root = h('div', { class: 'idle-screen' });
  stage = new BootStage({ palette: 'gold', rush: false }).mountIn(root);
  root.append(
    h('div', { class: 'idle-text', text: t('Press the PS button on your controller.') }),
    h('div', { class: 'idle-logo', html: PS })
  );
  document.body.append(root);
  shownAt = Date.now();
  requestAnimationFrame(() => root.classList.add('in'));
}

function hide() {
  if (!root) return;
  const r = root;
  const s = stage;
  root = null;
  stage = null;
  last = Date.now();
  r.classList.remove('in');
  r.classList.add('out');
  setTimeout(() => {
    s.destroy();
    r.remove();
  }, 450);
}

function activity(e) {
  if (root) {
    if (Date.now() - shownAt < 500) return;
    if (e && e.stopPropagation && e.type !== 'pointermove' && e.type !== 'mousemove') {
      e.stopPropagation();
      e.preventDefault();
    }
    hide();
    return;
  }
  last = Date.now();
}

export function initIdle() {
  for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel']) window.addEventListener(ev, activity, true);
  try {
    window.api.on('pad:action', () => activity());
  } catch {}
  let prev = '';
  setInterval(() => {
    // Controller: any button press or stick push counts.
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    let sig = '';
    for (const p of pads) if (p) sig += p.buttons.map((b) => (b.pressed ? 1 : 0)).join('') + p.axes.map((a) => (Math.abs(a) > 0.5 ? 1 : 0)).join('');
    if (sig !== prev) {
      if (sig.includes('1')) activity();
      prev = sig;
    }
    const secs = Number(state.settings.idleSeconds ?? 300);
    if (!secs || document.body.classList.contains('booting') || !document.hasFocus()) {
      if (!document.hasFocus()) last = Date.now();
      return;
    }
    if (!root && Date.now() - last >= secs * 1000) show();
  }, 500);
}
