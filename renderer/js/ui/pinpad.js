// Numeric PIN pad: dots, a 3x4 keypad, controller / mouse / keyboard input.
import { t } from '../i18n.js';
// Resolves with the digits, or null if cancelled. With `verify`, a wrong PIN
// shows an error and clears the dots instead of resolving.

import { h } from '../util.js';
import { icon } from '../icons.js';
import { sfx } from '../sound.js';
import { glyph } from './glyphs.js';
import { avatarHtml } from './avatar.js';
import { mountOverlay } from './overlay.js';

const LABELS = { del: 'Delete', done: 'Done', cancel: 'Cancel' };

export function pinPad({ title, profile = null, cancellable = true, verify = null, length = 6 } = {}) {
  return new Promise((resolve) => {
    const max = length || 12;
    const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['del', '0', 'done']];
    if (cancellable) rows.push(['cancel']);
    let digits = '';
    let busy = false;
    let row = 0;
    let col = 0;
    const els = [];

    const dots = h('div', { class: 'pp-dots' });
    const msg = h('div', { class: 'pp-msg' });
    const grid = h('div', { class: 'pp-grid' });
    rows.forEach((r, ri) => {
      els[ri] = r.map((k, ci) => {
        const el = h('button', {
          class: `pp-key${LABELS[k] ? ' small' : ''}${k === 'cancel' ? ' wide' : ''}${k === 'done' ? ' done' : ''}`,
          text: LABELS[k] || k,
          onmouseenter: () => setFocus(ri, ci),
          onclick: () => press(k),
        });
        grid.append(el);
        return el;
      });
    });

    const root = h(
      'div',
      { class: 'overlay dialog-overlay' },
      h(
        'div',
        { class: 'dialog pin-dialog' },
        h('div', { class: 'pp-user', html: profile ? avatarHtml('pp-av', profile) : `<span class="pp-lock">${icon('lock')}</span>` }),
        profile ? h('div', { class: 'pp-name', text: profile.name }) : null,
        h('div', { class: 'pp-title', text: t(title || '') }),
        dots,
        msg,
        grid,
        h('div', { class: 'pp-hints', html: `<span>${glyph('confirm')} ${t('تحديد')}</span><span>${glyph('x')} ${t('حذف')}</span>${cancellable ? `<span>${glyph('back')} ${t('إلغاء')}</span>` : ''}` })
      )
    );

    function paint() {
      dots.innerHTML = length
        ? Array.from({ length }, (_, i) => `<span class="pp-dot${i < digits.length ? ' on' : ''}"></span>`).join('')
        : '<span class="pp-bul">' + '\u2022'.repeat(digits.length) + '</span>';
    }

    function setFocus(r, c) {
      els[row][col]?.classList.remove('focused');
      row = r;
      col = Math.min(c, els[r].length - 1);
      els[row][col].classList.add('focused');
    }

    async function submit() {
      if (busy) return;
      if (length ? digits.length < length : digits.length < 4) return sfx.bump();
      busy = true;
      if (verify && !(await verify(digits))) {
        msg.textContent = '\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0633\u0631\u064a \u063a\u064a\u0631 \u0635\u062d\u064a\u062d';
        root.classList.add('shake');
        sfx.bump();
        setTimeout(() => root.classList.remove('shake'), 500);
        digits = '';
        paint();
        busy = false;
        return;
      }
      close(digits);
    }

    function press(k) {
      if (ctl.closed) return;
      if (k === 'del') {
        if (busy) return;
        digits = digits.slice(0, -1);
        msg.textContent = '';
        sfx.type();
        paint();
      } else if (k === 'done') submit();
      else if (k === 'cancel') {
        if (cancellable) {
          sfx.back();
          close(null);
        }
      } else if (!busy && digits.length < max) {
        digits += k;
        msg.textContent = '';
        sfx.type();
        paint();
        if (length && digits.length === length) submit();
      }
    }

    const onKey = (e) => {
      if (ctl.closed) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') press('done');
      else if (e.key === 'Escape' && cancellable) press('cancel');
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);

    function close(v) {
      window.removeEventListener('keydown', onKey, true);
      ctl.close();
      resolve(v);
    }

    const ctl = mountOverlay(
      root,
      (action) => {
        if (action === 'left' && col > 0) setFocus(row, col - 1), sfx.move();
        else if (action === 'right' && col < els[row].length - 1) setFocus(row, col + 1), sfx.move();
        else if (action === 'up' && row > 0) setFocus(row - 1, row === rows.length - 1 && cancellable ? 1 : col), sfx.move();
        else if (action === 'down' && row < rows.length - 1) setFocus(row + 1, col), sfx.move();
        else if (action === 'confirm') press(rows[row][col]);
        else if (action === 'x') press('del');
        else if (action === 'back') press('cancel');
        return true;
      },
      { dimApp: true }
    );
    sfx.open();
    paint();
    setFocus(0, 0);
  });
}
