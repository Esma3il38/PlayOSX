// Settings pages for the extra features: performance overlay, power modes,
// controller tuning (remap, triggers, rumble, lightbar, mouse mode, test and
// calibration), themes and game card size.
import { api, state, setSetting } from './state.js';
import { optionsMenu, infoDialog } from './ui/dialogs.js';

const onOff = (key, label) => ({ type: 'toggle', key, label });
export const THEMES = {
  ps5: { label: 'PS5 Blue', blue: '#2f7cf6', blue2: '#0f5bd8', tint: '20, 30, 60', c: [[38, 86, 255], [126, 58, 242], [0, 170, 255], [236, 72, 153]] },
};
export const BUTTONS = ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', 'Touchpad', 'D-pad Up', 'D-pad Down', 'D-pad Left', 'D-pad Right'];
const IDENT = BUTTONS.map((_, i) => i);
const choiceOf = (key, label, options) => ({ type: 'choice', key, label, options });
const set = (patch) => Promise.all(Object.entries(patch).map(([k, v]) => setSetting(k, v)));

let power = null;
let mouse = false;
let remapGame = '*';

const profiles = () => state.settings.padProfiles || {};
const mapOf = (id) => (profiles()[id] && profiles()[id].map) || IDENT;
const saveMap = (id, map) => setSetting('padProfiles', { ...profiles(), [id]: { ...(profiles()[id] || {}), map } });
const gameName = (id) => (id === '*' ? 'All Games' : (state.games.find((g) => g.id === id) || {}).name || id);

async function pickGame(anchor) {
  const items = [{ label: 'All Games', value: '*' }, ...state.games.filter((g) => !g.hidden).slice(0, 60).map((g) => ({ label: g.name, value: g.id }))];
  const c = await optionsMenu({ title: 'Remap For', items, anchor });
  if (c) remapGame = c.value;
}

async function remapButton(i, anchor) {
  const items = [{ label: 'Default', value: i }, ...BUTTONS.map((b, k) => ({ label: b, value: k })).filter((o) => o.value !== i), { label: 'Disabled', value: -1 }];
  const c = await optionsMenu({ title: BUTTONS[i], items, anchor });
  if (!c) return;
  const m = mapOf(remapGame).slice();
  m[i] = c.value;
  await saveMap(remapGame, m);
}

function remapItems() {
  const m = mapOf(remapGame);
  const gp = !!state.settings.controllerPassthrough;
  return [
    gp ? null : { type: 'note', label: 'Remapping, trigger sensitivity, dead zone and calibration work on the virtual controller: turn on “Block Controller in Games While Menus Are Open” in System › In-Game Overlay.' },
    { type: 'action', label: 'Game', value: gameName(remapGame), run: (el) => pickGame(el) },
    ...BUTTONS.map((b, i) => ({ type: 'action', label: b, value: m[i] === i ? 'Default' : m[i] < 0 ? 'Disabled' : BUTTONS[m[i]], run: (el) => remapButton(i, el) })),
    { type: 'action', label: 'Reset This Profile', run: () => saveMap(remapGame, IDENT) },
  ].filter(Boolean);
}

async function runTest() {
  let timer = 0;
  const html = '<div id="padtest" style="font-size:1.6rem;line-height:1.7;min-width:50rem"></div>';
  const done = infoDialog({ title: 'Controller Test', html });
  const draw = () => {
    const el = document.getElementById('padtest');
    if (!el) return;
    const p = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
    if (!p) { el.textContent = 'No controller found. Press a button.'; return; }
    const a = p.axes.map((v) => v.toFixed(2));
    const btn = p.buttons.map((b, i) => `<span style="display:inline-block;margin:.2rem;padding:.2rem .7rem;border-radius:.6rem;background:${b.pressed ? '#22c55e' : 'rgba(255,255,255,.12)'}">${i}${b.value > 0 && b.value < 1 ? ' ' + b.value.toFixed(2) : ''}</span>`).join('');
    el.innerHTML = `<div>${p.id}</div><div>Left stick: ${a[0]}, ${a[1]} &nbsp; Right stick: ${a[2]}, ${a[3]}</div><div>${btn}</div>`;
  };
  timer = setInterval(draw, 50);
  await done;
  clearInterval(timer);
}

async function calibrate() {
  const sums = [0, 0, 0, 0];
  let n = 0;
  const until = Date.now() + 1500;
  while (Date.now() < until) {
    const p = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
    if (p && p.axes.length >= 4) { for (let i = 0; i < 4; i++) sums[i] += p.axes[i]; n++; }
    await new Promise((r) => setTimeout(r, 30));
  }
  if (!n) return infoDialog({ title: 'Calibration', html: 'No controller found. Leave the sticks alone and try again.' });
  const old = state.settings.padCenter || [0, 0, 0, 0];
  const next = sums.map((s, i) => Math.max(-40, Math.min(40, Math.round(old[i] + (s / n) * 128))));
  await setSetting('padCenter', next);
  return infoDialog({ title: 'Calibration', html: `Stick centre saved (${next.join(', ')}). Run the test to check.` });
}

export async function loadFeatures() {
  try { power = await api.powerGet(); } catch {}
  try { mouse = await api.padMouseGet(); } catch {}
  api.on('power:state', (p) => { if (p && p.ok !== false) power = p; });
  api.on('padmouse:state', (v) => { mouse = !!v; });
}

export function applyLook() {
  const s = state.settings;
  const th = THEMES.ps5;
  const r = document.documentElement;
  r.style.setProperty('--blue', th.blue);
  r.style.setProperty('--blue-2', th.blue2);
  r.style.setProperty('--tint', th.tint);
  const size = s.cardSize || 'medium';
  const dense = s.cardDensity === 'compact';
  const spec = { large: [3, 0], medium: [5, 0], small: [7, 0] }[size] || [5, 29.6];
  r.style.setProperty('--lib-cols', String(spec[0]));
  r.style.setProperty('--lib-tile', `${spec[1]}rem`);
  r.style.setProperty('--lib-gap', dense ? '1.2rem' : '2.5rem');
  r.classList.add('ui-glass');
  r.classList.remove('ui-sharp');
  return th;
}

const modes = [{ value: 'saver', label: 'Power Saver' }, { value: 'balanced', label: 'Balanced' }, { value: 'performance', label: 'Performance' }];

export function extraCategories() {
  return [
    {
      id: 'performance',
      label: 'Performance',
      icon: 'fSystem',
      desc: 'Overlay, FPS, temperatures and power mode',
      sections: [
        {
          label: 'Performance Overlay',
          onEnter: () => api.perfSnapshot().catch(() => {}),
          items: () => [
            onOff('perfOverlay', 'Show During Games'),
            choiceOf('perfPosition', 'Position', [{ value: 'tl', label: 'Top Left' }, { value: 'tr', label: 'Top Right' }, { value: 'bl', label: 'Bottom Left' }, { value: 'br', label: 'Bottom Right' }]),
            { type: 'range', label: 'Opacity', key: 'perfOpacity', min: 30, max: 100, step: 5, unit: '%' },
            { type: 'range', label: 'Size', key: 'perfScale', min: 70, max: 160, step: 10, unit: '%' },
            onOff('perfCompact', 'Compact Layout'),
            { type: 'note', label: 'FPS needs PresentMon (fetched on npm start) and the launcher run as administrator. Temperatures: NVIDIA GPUs and the Windows thermal sensor work out of the box; for exact CPU / AMD GPU temperatures run LibreHardwareMonitor. It shows over borderless games, not exclusive full screen.' },
            { type: 'choice', label: 'Windows Power Plan', get: () => (power && power.mode) || 'balanced', set: async (v) => { const r = await api.powerSet(v); if (r && r.ok) power = r; }, options: modes },
            choiceOf('powerGame', 'While a Game Runs', [{ value: 'off', label: 'Leave As Is' }, ...modes]),
            { type: 'note', label: 'Uses Windows power plans (powercfg). With “While a Game Runs” set, the plan switches when a game starts and goes back to the chosen plan when it closes.' },
          
          ],
        },
      ],
    },
    {
      id: 'controllertools',
      label: 'Controller Tools',
      icon: 'fAccessories',
      desc: 'Remap, triggers, rumble, light, mouse, test',
      sections: [
        {
          label: 'Feel',
          items: () => [
            { type: 'range', label: 'Trigger Sensitivity', key: 'padTriggerSens', min: 0, max: 100, step: 5, unit: '' },
            { type: 'range', label: 'Stick Dead Zone', key: 'padStickDead', min: 0, max: 30, step: 1, unit: '%' },
            { type: 'range', label: 'Rumble Strength', key: 'padRumble', min: 0, max: 150, step: 10, unit: '%' },
            { type: 'action', label: 'Test Rumble', run: () => api.padRumbleTest(state.settings.padRumble ?? 100) },
          ],
        },
        {
          label: 'Light Bar',
          items: () => [
            onOff('padLightOn', 'Custom Light Color'),
            choiceOf('padLightColor', 'Color', [{ value: '#2f7cf6', label: 'Blue' }, { value: '#ef4444', label: 'Red' }, { value: '#22c55e', label: 'Green' }, { value: '#a855f7', label: 'Purple' }, { value: '#f97316', label: 'Orange' }, { value: '#ec4899', label: 'Pink' }, { value: '#ffffff', label: 'White' }]),
            { type: 'range', label: 'Brightness', key: 'padLightBright', min: 10, max: 100, step: 10, unit: '%' },
          ],
        },
        { label: 'Button Remapping', items: remapItems },
        {
          label: 'Mouse Mode',
          items: () => [
            { type: 'toggle', label: 'Controller as Mouse', get: () => mouse, set: async (v) => { mouse = await api.padMouseSet(v); } },
            { type: 'range', label: 'Pointer Speed', key: 'padMouseSpeed', min: 300, max: 2000, step: 100, unit: '' },
            onOff('padMouseHotkey', 'Shortcut Ctrl+Alt+M'),
            { type: 'note', label: 'Left stick moves the pointer, right stick scrolls, Cross = click, Circle = right click, R3 = middle click. Needs the virtual controller (Block Controller in Games) to be on.' },
          ],
        },
        {
          label: 'Test and Calibration',
          items: () => [
            { type: 'action', label: 'Test Buttons and Sticks', run: () => runTest() },
            { type: 'action', label: 'Calibrate Stick Centre', run: () => calibrate() },
            { type: 'action', label: 'Reset Calibration', run: () => setSetting('padCenter', [0, 0, 0, 0]) },
          ],
        },
      ],
    },
  
  ];
}
