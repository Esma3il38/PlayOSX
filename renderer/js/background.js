// Background: the same animated "stage" as the login screen (spotlight from the
// upper left, light shafts, hazy floor and warm bokeh particles), mounted behind
// the hero art. Whenever hero artwork covers it (or a view opts out) the particle
// loop is stopped and the CSS animations are paused (see css/bg-stage.css), so
// nothing keeps redrawing behind the game art and the glass panels.

import { BootStage } from './ui/bootstage.js';

const canvas = document.getElementById('bg-canvas');
let stage = null;
let want = false;

function paintBlack() {
  if (!canvas) return;
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 2, 2);
  }
}

function ensure() {
  if (stage) return stage;
  const app = document.getElementById('app');
  const hero = document.getElementById('hero-bg');
  if (!app || !hero) return null;
  stage = new BootStage({ palette: 'gold', rush: false });
  stage.el.classList.add('bg-stage');
  app.insertBefore(stage.el, hero); // behind the hero art, above the black canvas
  stage.begin();
  return stage;
}

export const background = {
  init() { paintBlack(); },
  setMode() {},
  setColors() {},
  setVisible(on) {
    on = !!on;
    if (on === want && stage) return;
    want = on;
    if (on) {
      const s = ensure();
      if (s) s.start();
    } else if (stage) {
      stage.stop();
    }
  },
};
