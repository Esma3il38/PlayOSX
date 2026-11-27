// The performance overlay window: a transparent, click-through card with FPS,
// CPU / GPU load and temperature, and RAM. main/features.js sends the numbers.

const hud = document.getElementById('hud');
let cfg = { items: ['fps', 'cpu', 'gpu', 'ram'], position: 'tr', opacity: 85, scale: 100, compact: false };

const temp = (v) => {
  if (typeof v !== 'number') return '';
  const cls = v >= 85 ? 'hot' : v >= 75 ? 'warm' : '';
  return `<small class="${cls}">${v}°C</small>`;
};

const gb = (mb) => (mb / 1024).toFixed(1);

function render(s) {
  hud.className = `hud show ${cfg.position}${cfg.compact ? ' compact' : ''}`;
  hud.style.opacity = String(Math.max(0.2, Math.min(1, cfg.opacity / 100)));
  hud.style.transform = `scale(${Math.max(0.6, Math.min(2, cfg.scale / 100))})`;
  if (!s) {
    hud.innerHTML = '';
    return;
  }
  const rows = [];
  for (const item of cfg.items) {
    if (item === 'fps') {
      const f = s.fps;
      const cls = f == null ? 'na' : f < 30 ? 'bad' : f < 55 ? 'low' : '';
      rows.push(`<div class="row fps"><span class="k">FPS</span><span class="v ${cls}">${f == null ? '—' : f}</span></div>`);
    } else if (item === 'cpu') {
      rows.push(`<div class="row"><span class="k">CPU</span><span class="v">${s.cpu}%${temp(s.cpuTemp)}</span></div>`);
    } else if (item === 'gpu') {
      if (s.gpuLoad == null && s.gpuTemp == null) rows.push('<div class="row"><span class="k">GPU</span><span class="v">—</span></div>');
      else rows.push(`<div class="row"><span class="k">GPU</span><span class="v">${s.gpuLoad == null ? '' : s.gpuLoad + '%'}${temp(s.gpuTemp)}</span></div>`);
    } else if (item === 'ram') {
      rows.push(`<div class="row"><span class="k">RAM</span><span class="v">${gb(s.ram)}<small>/ ${gb(s.ramTotal)} GB</small></span></div>`);
    } else if (item === 'vram' && s.vram != null) {
      rows.push(`<div class="row"><span class="k">VRAM</span><span class="v">${gb(s.vram)}<small>/ ${gb(s.vramTotal)} GB</small></span></div>`);
    }
  }
  hud.innerHTML = rows.join('');
}

window.api.on('perf:stats', (p) => {
  if (p && p.settings) cfg = { ...cfg, ...p.settings };
  render(p && p.stats);
});
