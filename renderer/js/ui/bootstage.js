// The dark "stage" behind the welcome screen: a spotlight from the upper left,
// a hazy floor, and warm bokeh particles drifting along a diagonal band (the
// PS5 user-select backdrop). It sits between the hero art and the views, so
// fading it out reveals the home screen's hero underneath.

import { h } from '../util.js';

const PALETTES = {
  // Startup / idle screen: warm gold bokeh
  gold: [[255, 168, 72], [255, 196, 118], [255, 232, 196]],
  // Settings: the console's cool room with pink, teal and blue-white bokeh
  pastel: [[236, 120, 146], [64, 204, 172], [150, 176, 232], [240, 244, 255]],
};

function sprite(rgb, soft) {
  const size = 96;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const [r, gg, b] = rgb;
  if (soft) {
    // Out-of-focus disc: an even body that softens towards the edge.
    // Real bokeh: an even disc with a slightly brighter rim.
    g.addColorStop(0, `rgba(${r},${gg},${b},0.55)`);
    g.addColorStop(0.62, `rgba(${r},${gg},${b},0.68)`);
    g.addColorStop(0.86, `rgba(${r},${gg},${b},0.95)`);
    g.addColorStop(0.95, `rgba(${r},${gg},${b},0.3)`);
    g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  } else {
    // In-focus speck: bright core with a small glow.
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, `rgba(${r},${gg},${b},0.95)`);
    g.addColorStop(0.42, `rgba(${r},${gg},${b},0.22)`);
    g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  }
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

export class BootStage {
  /** opts: palette 'gold' | 'pastel'; canvasOnly (just the particles); rush (fast opening stream) */
  constructor(opts = {}) {
    this.opts = opts;
    this.canvas = h('canvas', { class: 'bs-particles' });
    this.el = opts.canvasOnly
      ? h('div', { class: 'ambient-stage' }, this.canvas)
      : h(
          'div',
          { class: 'boot-stage' },
          h('div', { class: 'bs-base' }),
          h('div', { class: 'bs-beam' }, h('div', { class: 'bs-shafts' })),
          h('div', { class: 'bs-source' }),
          h('div', { class: 'bs-floor' }),
          this.canvas,
          h('div', { class: 'bs-black' })
        );
    this.ctx = this.canvas.getContext('2d');
    const COLORS = PALETTES[opts.palette] || PALETTES.gold;
    this.ncol = COLORS.length;
    this.sprites = { soft: COLORS.map((c) => sprite(c, true)), sharp: COLORS.map((c) => sprite(c, false)) };
    this.parts = [];
    this.t0 = opts.rush === false ? -1e9 : performance.now();
    this.raf = 0;
    this.last = 0;
    this.onResize = () => this.resize();
  }

  mount() {
    const app = document.getElementById('app');
    app.insertBefore(this.el, document.getElementById('views'));
    return this.begin();
  }

  /** Mount inside any container (settings background, idle screen). */
  mountIn(parent) {
    parent.append(this.el);
    return this.begin();
  }

  begin() {
    window.addEventListener('resize', this.onResize);
    this.start();
    // Fade in from black.
    requestAnimationFrame(() => this.el.classList.add('lit'));
    return this;
  }

  start() {
    if (this.running) return this;
    this.running = true;
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.draw(dt, now / 1000);
    };
    this.raf = requestAnimationFrame(loop);
    return this;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    return this;
  }

  resize() {
    const dpr = 1;
    const r = this.el.getBoundingClientRect();
    this.W = Math.max(2, Math.round(r.width * dpr));
    this.H = Math.max(2, Math.round(r.height * dpr));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.unit = this.H / 1080; // sizes below are in 1080p pixels
    const area = (this.W * this.H) / (1920 * 1080 * dpr * dpr);
    const n = Math.round(170 * Math.max(0.6, Math.min(1.1, area)));
    this.parts = Array.from({ length: n }, () => this.spawn(true));
  }

  /**
   * A particle somewhere along the band that runs from the lower left up to
   * the right, denser towards the right. Particles live for a while, fade
   * out and come back somewhere else, so the band keeps its shape.
   */
  spawn(first) {
    const { W, H, unit } = this;
    const layer = Math.random();
    // 0 = far specks, 1 = mid, 2 = near bokeh
    const depth = layer < 0.56 ? 0 : layer < 0.84 ? 1 : 2;
    const size0 = depth === 0 ? 3 : depth === 1 ? 9 : 30;
    // First fill: spread over the band. Later: enter from the left edge, one behind another.
    const x = first ? W * (depth === 2 ? Math.random() : Math.pow(Math.random(), 0.62)) : -size0 * unit * (1 + Math.random() * 6);
    const t = Math.max(0, x / W);
    const center = H * (0.9 - 0.42 * t);
    const spread = H * (0.045 + 0.085 * t) * (depth === 2 ? 1.7 : 1);
    let y = center + gauss() * spread * 1.7;
    // A few strays outside the band.
    if (Math.random() < 0.06) y = H * (0.3 + Math.random() * 0.7);
    // A few bright sparkles among the far specks.
    const sparkle = depth === 0 && Math.random() < 0.05;
    const size = sparkle ? 6 + Math.random() * 4 : depth === 0 ? 2 + Math.random() * 4 : depth === 1 ? 5 + Math.random() * 9 : 16 + Math.random() * 34;
    const slope = (0.42 * H) / W;
    const part = {
      x,
      y,
      depth,
      soft: depth === 2 || (depth === 1 && Math.random() < 0.6),
      color: sparkle ? this.ncol - 1 : Math.floor(Math.random() * (this.ncol - 1)),
      size: size * unit,
      vx: (depth === 0 ? 16 : depth === 1 ? 28 : 46) * unit * (0.7 + Math.random() * 0.6),
      vy: 0,
      alpha: depth === 0 ? 0.45 + Math.random() * 0.55 : depth === 1 ? 0.28 + Math.random() * 0.45 : 0.1 + Math.random() * 0.2,
      tw: 0.4 + Math.random() * 1.6,
      ph: Math.random() * Math.PI * 2,
      age: first ? Math.random() * 8 : 0,
      ttl: 9999,
    };
    part.vy = -part.vx * slope * (0.9 + Math.random() * 0.2);
    return part;
  }

  draw(dt, t) {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    // Opening rush: for the first seconds the particles run along the band one behind
    // another (near ones faster, with trails), then ease down to the calm drift.
    const e = (performance.now() - this.t0) / 1000;
    let rush = Math.max(0, 1 - e / 6);
    rush = rush * rush * (3 - 2 * rush);
    for (let i = 0; i < this.parts.length; i++) {
      let p = this.parts[i];
      const boost = 1 + rush * (2.2 + p.depth * 2.6);
      p.x += p.vx * boost * dt;
      p.y += p.vy * boost * dt + Math.sin(t * 0.5 + p.ph) * 0.15 * this.unit;
      p.age += dt;
      if (p.age > p.ttl || p.x - p.size > W || p.y + p.size < 0) {
        p = this.parts[i] = this.spawn(false);
      }
      // Fade in over 1.5 s, out over the last 1.5 s.
      const life = Math.min(1, p.age / 1.5, (p.ttl - p.age) / 1.5);
      const twinkle = 0.65 + 0.35 * Math.sin(t * p.tw + p.ph);
      const a = p.alpha * twinkle * life;
      if (a < 0.01) continue;
      const img = (p.soft ? this.sprites.soft : this.sprites.sharp)[p.color];
      const s = p.soft ? p.size : p.size * 2.2;
      // The stream flows along the band; each one bobs gently on its own phase.
      const px = p.x;
      const py = p.y + Math.sin(t * 0.6 + p.ph) * (3 + p.depth * 4) * this.unit;
      const edge = Math.max(0, Math.min(1, (W - p.x) / (W * 0.1)));
      ctx.globalAlpha = a * edge;
      ctx.drawImage(img, px - s / 2, py - s / 2, s, s);
      if (rush > 0.15) {
        // Short trail behind each one while the stream rushes in.
        for (let k = 1; k <= 3; k++) {
          ctx.globalAlpha = a * edge * (1 - k * 0.25) * Math.min(1, rush * 1.4);
          ctx.drawImage(img, px - k * p.vx * 0.05 - s * 0.35, py + k * Math.abs(p.vy) * 0.05 - s * 0.35, s * 0.7, s * 0.7);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Fade the particles out (the spotlight stays). */
  dimParticles() {
    this.el.classList.add('no-particles');
  }

  /** Fade the whole stage away, then remove it. */
  async leave(ms = 700) {
    this.el.style.setProperty('--leave', `${ms}ms`);
    this.el.classList.add('leave');
    await new Promise((r) => setTimeout(r, ms + 50));
    this.destroy();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.el.remove();
  }
}
