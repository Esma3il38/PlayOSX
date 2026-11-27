// Display test: full-screen patterns for judging colors, banding, dead or stuck
// pixels, black and white levels and how much of the picture a TV crops.
// Left/right (or the mouse wheel) changes the pattern, Back closes it.

import { h } from '../util.js';
import { sfx } from '../sound.js';
import { t } from '../i18n.js';
import { mountOverlay } from './overlay.js';

const gray = (v) => `rgb(${v},${v},${v})`;

/** n vertical bands side by side. */
function bands(colors) {
  const w = 100 / colors.length;
  return colors.map((c, i) => `${c} ${i * w}% ${(i + 1) * w}%`).join(', ');
}

const SOLID = (name, color) => ({ name, style: `background:${color}` });

const PATTERNS = [
  {
    name: 'Color Bars',
    // The classic seven bars on top, a blue/black/white strip and a gray ramp under them.
    style: `background:
      linear-gradient(to bottom, transparent 0 72%, #000 72% 100%),
      linear-gradient(to right, ${bands(['#fff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000'])})`,
    html: `<div class="dt-ramp" style="background:linear-gradient(to right,#000,#fff)"></div>`,
  },
  {
    name: 'Gray Steps',
    // 16 flat steps: every step should be told apart, the darkest ones too.
    style: `background:linear-gradient(to right, ${bands(Array.from({ length: 16 }, (_, i) => gray(Math.round((i * 255) / 15))))})`,
  },
  {
    name: 'Smooth Gradients',
    // Visible stripes in these mean banding.
    style: 'background:linear-gradient(to bottom, transparent 0 0)',
    html: ['#fff', '#f33', '#3f3', '#38f']
      .map((c) => `<div class="dt-grad" style="background:linear-gradient(to right,#000,${c})"></div>`)
      .join(''),
  },
  SOLID('Black', '#000'),
  SOLID('White', '#fff'),
  SOLID('Red', '#f00'),
  SOLID('Green', '#0f0'),
  SOLID('Blue', '#00f'),
  {
    name: 'Fine Checkerboard',
    // One pixel squares: a screen that is not at its own resolution shows it as gray mush.
    style: `background-color:#fff;background-image:conic-gradient(#000 25%, #fff 0 50%, #000 0 75%, #fff 0);background-size:2px 2px`,
  },
  {
    name: 'Black Level',
    // Squares from nearly black up: the first ones should just be visible, not all gone.
    style: 'background:#000',
    html: `<div class="dt-levels">${[2, 4, 6, 8, 10, 12, 16, 20].map((v) => `<i style="background:${gray(v)}"><b>${v}</b></i>`).join('')}</div>`,
  },
  {
    name: 'White Level',
    style: 'background:#fff',
    html: `<div class="dt-levels">${[255, 252, 249, 246, 243, 240, 235, 230].map((v) => `<i style="background:${gray(v)}"><b style="color:#000">${v}</b></i>`).join('')}</div>`,
  },
  {
    name: 'Screen Edges',
    // Frames at 0, 2.5, 5, 7.5 and 10 % of each side: the outermost one you can still see is where the picture ends.
    style: 'background:#111',
    html: [0, 2.5, 5, 7.5, 10]
      .map((p) => `<div class="dt-frame" style="inset:${p}%"><span>${p}%</span></div>`)
      .join(''),
  },
];

export function showDisplayTest() {
  let index = 0;
  const screen = h('div', { class: 'dt-screen' });
  const label = h('div', { class: 'dt-label' });
  const root = h('div', { class: 'overlay display-test' }, screen, label);
  let labelTimer = 0;

  function render() {
    const p = PATTERNS[index];
    screen.setAttribute('style', p.style);
    screen.innerHTML = p.html || '';
    label.textContent = `${t(p.name)}   ${index + 1} / ${PATTERNS.length}`;
    label.classList.add('show');
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => label.classList.remove('show'), 2600);
  }

  function step(d) {
    index = (index + d + PATTERNS.length) % PATTERNS.length;
    sfx.move();
    render();
  }

  return new Promise((resolve) => {
    const ctl = mountOverlay(
      root,
      (action) => {
        if (action === 'left' || action === 'up') step(-1);
        else if (action === 'right' || action === 'down' || action === 'confirm') step(1);
        else if (action === 'back') close();
        return true;
      },
      { dimApp: false, closeDelay: 0 }
    );
    root.addEventListener('wheel', (e) => step(e.deltaY > 0 ? 1 : -1), { passive: true });
    root.addEventListener('click', () => step(1));
    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      close();
    });
    sfx.open();
    render();
    function close() {
      clearTimeout(labelTimer);
      sfx.back();
      ctl.close();
      resolve();
    }
  });
}
