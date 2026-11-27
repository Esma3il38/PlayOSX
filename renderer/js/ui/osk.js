// Controller-friendly on-screen keyboard.

import { h } from '../util.js';
import { icon } from '../icons.js';
import { sfx } from '../sound.js';
import { glyph } from './glyphs.js';
import { t } from '../i18n.js';

const BOTTOM = (lang) => [
  { k: 'shift', w: 1.3, label: icon('shift') },
  { k: 'lang', w: 1.3, label: lang === 'en' ? '\u0639\u0631\u0628\u064a' : 'EN' },
  ...(lang === 'ar' ? ['\u062c', '\u062f', '\u0630'] : [':']),
  { k: 'space', w: lang === 'ar' ? 3 : 4, label: t('Space') },
  { k: 'back', w: 1.3, label: icon('backspace') },
  { k: 'done', w: 1.4, label: t('Done') },
];
const LAYOUTS = {
  en: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "'"],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-'],
  ],
  ar: [
    ['\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669', '\u0660'],
    ['\u0636', '\u0635', '\u062b', '\u0642', '\u0641', '\u063a', '\u0639', '\u0647', '\u062e', '\u062d'],
    ['\u0634', '\u0633', '\u064a', '\u0628', '\u0644', '\u0627', '\u062a', '\u0646', '\u0645', '\u0643'],
    ['\u0626', '\u0621', '\u0624', '\u0631', '\u0649', '\u0629', '\u0648', '\u0632', '\u0638', '\u0637'],
  ],
};
let LANG = 'en';

/**
 * @param {{ onChar(c:string):void, onBackspace():void, onDone():void }} cb
 */
export function createOSK(cb) {
  let shift = false;
  let row = 1;
  let col = 0;
  const keyEls = [];

  const el = h('div', { class: 'osk' });
  function build() {
    keyEls.length = 0;
    el.replaceChildren();
    [...LAYOUTS[LANG], BOTTOM(LANG)].forEach((r, ri) => {
      const rowEl = h('div', { class: 'osk-row' });
      keyEls[ri] = [];
      r.forEach((k, ci) => {
        const def = typeof k === 'string' ? { k, w: 1 } : k;
        const keyEl = h('button', {
          class: `osk-key k-${def.k.length > 1 ? def.k : 'char'}`,
          style: { flex: `${def.w} 1 0` },
          html: def.label || def.k,
          dataset: { k: def.k },
          onmouseenter: () => setFocus(ri, ci),
          onclick: () => press(def.k),
        });
        if (def.k === 'done') keyEl.classList.add('primary');
        rowEl.append(keyEl);
        keyEls[ri].push(keyEl);
      });
      el.append(rowEl);
    });
    el.append(h('div', { class: 'osk-hints', html: `<span>${glyph('x')} ${t('Delete')}</span><span>${glyph('y')} ${t('Space')}</span><span>${glyph('options')} ${t('Done')}</span>` }));
  }
  build();

  function setFocus(r, c) {
    keyEls[row][col]?.classList.remove('focused');
    row = r;
    col = c;
    keyEls[row][col].classList.add('focused');
  }

  function centerOf(r, c) {
    const e = keyEls[r][c];
    return e.offsetLeft + e.offsetWidth / 2;
  }

  function moveVert(d) {
    const nr = row + d;
    if (nr < 0 || nr >= keyEls.length) return false;
    const x = centerOf(row, col);
    let best = 0;
    let bestD = Infinity;
    keyEls[nr].forEach((_, ci) => {
      const dd = Math.abs(centerOf(nr, ci) - x);
      if (dd < bestD) {
        bestD = dd;
        best = ci;
      }
    });
    setFocus(nr, best);
    return true;
  }

  function refreshCase() {
    keyEls.flat().forEach((k) => {
      if (k.classList.contains('k-char')) k.textContent = shift ? k.dataset.k.toUpperCase() : k.dataset.k;
    });
    el.querySelector('.k-shift')?.classList.toggle('on', shift);
  }

  function press(k) {
    if (k === 'lang') {
      LANG = LANG === 'en' ? 'ar' : 'en';
      shift = false;
      build();
      setFocus(keyEls.length - 1, 1);
      sfx.toggle();
    } else if (k === 'shift') {
      shift = !shift;
      refreshCase();
      sfx.toggle();
    } else if (k === 'space') {
      cb.onChar(' ');
      sfx.type();
    } else if (k === 'back') {
      cb.onBackspace();
      sfx.type();
    } else if (k === 'done') {
      cb.onDone();
    } else {
      cb.onChar(shift ? k.toUpperCase() : k);
      sfx.type();
      if (shift) {
        shift = false;
        refreshCase();
      }
    }
  }

  setFocus(1, 0);

  return {
    el,
    handle(action) {
      switch (action) {
        case 'left':
          if (col > 0) setFocus(row, col - 1);
          else return false;
          sfx.move();
          return true;
        case 'right':
          if (col < keyEls[row].length - 1) setFocus(row, col + 1);
          else return false;
          sfx.move();
          return true;
        case 'up':
          if (!moveVert(-1)) return false;
          sfx.move();
          return true;
        case 'down':
          if (!moveVert(1)) return false;
          sfx.move();
          return true;
        case 'confirm':
          press(keyEls[row][col].dataset.k);
          return true;
        case 'x':
          press('back');
          return true;
        case 'y':
          press('space');
          return true;
        case 'l2':
          press('shift');
          return true;
        case 'options':
        case 'r2':
          press('done');
          return true;
      }
      return false;
    },
    focusRow(r) {
      setFocus(Math.max(0, Math.min(keyEls.length - 1, r)), 0);
    },
    blur() {
      keyEls[row][col]?.classList.remove('focused');
    },
    refocus() {
      keyEls[row][col]?.classList.add('focused');
    },
  };
}
