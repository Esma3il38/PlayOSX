// Extra features: performance overlay (FPS / temperatures / RAM), Windows power
// plans, controller tuning (button remap per game, trigger curve, rumble, lightbar,
// controller-as-mouse) and calibration. Wired into main.js through init().
//
// Nothing here touches a game: the performance overlay is its own transparent
// window, FPS comes from Intel PresentMon (main/native/PresentMon.exe, fetched by
// scripts/fetch-presentmon.js) and the pad tuning is applied inside the helper to
// the frames of the virtual controller (needs "Block Controller in Games" on).

const { BrowserWindow, screen, globalShortcut } = require('electron');
const { execFile, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const win32 = process.platform === 'win32';

/* ------------------------------------------------------------------ */
/* Power plans                                                         */
/* ------------------------------------------------------------------ */

const PLAN_GUID = {
  saver: 'a1841308-3541-4dd2-8f59-6a9d4a3d78c6',
  balanced: '381b4222-f694-41f0-9685-ff5bb260df2e',
  performance: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  ultimate: 'e9a42b02-d5df-448d-aa00-03f14749eb61',
};

function run(cmd, args, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout, encoding: 'utf8' }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || (err && err.message) || '') });
    });
  });
}

function planKeyOf(guid) {
  const g = String(guid || '').toLowerCase();
  return Object.keys(PLAN_GUID).find((k) => PLAN_GUID[k] === g) || null;
}

async function getPowerPlan() {
  if (!win32) return { supported: false };
  const r = await run('powercfg', ['/getactivescheme']);
  const m = r.out.match(/([0-9a-f]{8}-[0-9a-f-]{27})\s*\(([^)]*)\)/i);
  if (!m) return { supported: true, guid: null, mode: null, name: '' };
  const guid = m[1].toLowerCase();
  const key = planKeyOf(guid);
  // A duplicated "High performance" plan has its own guid; recognise it by name.
  const byName = /high performance|ultimate/i.test(m[2]) ? 'performance' : /power saver/i.test(m[2]) ? 'saver' : /balanced/i.test(m[2]) ? 'balanced' : null;
  return { supported: true, guid, mode: key === 'ultimate' ? 'performance' : key || byName, name: m[2] };
}

async function setPowerPlan(mode) {
  if (!win32) return { ok: false, error: 'Windows only' };
  const guid = PLAN_GUID[mode];
  if (!guid) return { ok: false, error: 'Unknown mode' };
  let r = await run('powercfg', ['/setactive', guid]);
  if (!r.ok) {
    // Some PCs (Modern Standby laptops) don't list every plan: create it from the template.
    const dup = await run('powercfg', ['-duplicatescheme', guid]);
    const m = dup.out.match(/([0-9a-f]{8}-[0-9a-f-]{27})/i);
    if (m) r = await run('powercfg', ['/setactive', m[1]]);
    if (!r.ok && mode === 'performance') {
      const ult = await run('powercfg', ['-duplicatescheme', PLAN_GUID.ultimate]);
      const u = ult.out.match(/([0-9a-f]{8}-[0-9a-f-]{27})/i);
      if (u) r = await run('powercfg', ['/setactive', u[1]]);
    }
  }
  return r.ok ? { ok: true, ...(await getPowerPlan()) } : { ok: false, error: r.err.trim() || 'powercfg failed' };
}

/* ------------------------------------------------------------------ */
/* Performance monitor                                                 */
/* ------------------------------------------------------------------ */

const SENSOR_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
while ($true) {
  $o = @{ cpuTemp = $null; gpuTemp = $null; src = '' }
  foreach ($ns in 'root/LibreHardwareMonitor', 'root/OpenHardwareMonitor') {
    $s = Get-CimInstance -Namespace $ns -ClassName Sensor | Where-Object { $_.SensorType -eq 'Temperature' }
    if ($s) {
      $c = $s | Where-Object { $_.Identifier -match 'cpu' } | Sort-Object { if ($_.Name -match 'Package|Tctl|Average') { 0 } else { 1 } } | Select-Object -First 1
      $g = $s | Where-Object { $_.Identifier -match 'gpu' } | Select-Object -First 1
      if ($c) { $o.cpuTemp = [math]::Round($c.Value) }
      if ($g) { $o.gpuTemp = [math]::Round($g.Value) }
      $o.src = 'hwmon'
      break
    }
  }
  if ($o.cpuTemp -eq $null) {
    $z = (Get-Counter '\\Thermal Zone Information(*)\\Temperature').CounterSamples | ForEach-Object { $_.CookedValue - 273.15 } | Where-Object { $_ -gt 10 -and $_ -lt 125 }
    if ($z) { $o.cpuTemp = [math]::Round(($z | Measure-Object -Maximum).Maximum); $o.src = 'acpi' }
  }
  if ($o.cpuTemp -eq $null) {
    $t = Get-CimInstance -Namespace root/WMI -ClassName MSAcpi_ThermalZoneTemperature
    if ($t) { $v = ($t | ForEach-Object { $_.CurrentTemperature / 10 - 273.15 } | Measure-Object -Maximum).Maximum; if ($v -gt 10 -and $v -lt 125) { $o.cpuTemp = [math]::Round($v); $o.src = 'wmi' } }
  }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  Start-Sleep -Seconds 2
}
`;

class PerfMonitor {
  constructor({ onStats }) {
    this.onStats = onStats;
    this.timer = null;
    this.sensors = null;
    this.sensorProc = null;
    this.pm = null;
    this.pmPid = 0;
    this.frames = [];
    this.fpsState = 'off'; // off | ok | missing | admin | error
    this.lastCpu = null;
    this.gpu = { temp: null, load: null, vram: null, vramTotal: null, name: '' };
    this.gpuAt = 0;
    this.cpuTemp = null;
    this.cpuTempSrc = '';
    this.last = null;
    this.gamePid = 0;
    this.holdUntil = 0;
  }

  get running() {
    return !!this.timer;
  }

  start(pid = 0) {
    this.gamePid = pid || 0;
    if (!this.timer) {
      this.lastCpu = os.cpus();
      this.timer = setInterval(() => this.tick(), 1000);
      this.startSensors();
    }
    this.startPresentMon();
    this.tick();
  }

  /** Keep sampling for a few seconds (Settings preview) without a game. */
  preview(ms = 8000) {
    this.holdUntil = Date.now() + ms;
    if (!this.timer) this.start(0);
    return this.last;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopSensors();
    this.stopPresentMon();
    this.frames = [];
    this.gamePid = 0;
  }

  startSensors() {
    if (!win32 || this.sensorProc) return;
    try {
      const enc = Buffer.from(SENSOR_SCRIPT, 'utf16le').toString('base64');
      const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      let buf = '';
      p.stdout.on('data', (d) => {
        buf += d.toString('utf8');
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          try {
            const j = JSON.parse(line);
            this.cpuTemp = typeof j.cpuTemp === 'number' ? j.cpuTemp : null;
            this.cpuTempSrc = j.src || '';
            if (typeof j.gpuTemp === 'number') this.gpu.temp = j.gpuTemp;
          } catch {}
        }
      });
      p.on('exit', () => {
        if (this.sensorProc === p) this.sensorProc = null;
      });
      p.on('error', () => {
        if (this.sensorProc === p) this.sensorProc = null;
      });
      this.sensorProc = p;
    } catch {}
  }

  stopSensors() {
    if (this.sensorProc) {
      try {
        this.sensorProc.kill();
      } catch {}
    }
    this.sensorProc = null;
  }

  presentMonPath() {
    const dir = path.join(__dirname, 'native');
    const unpacked = dir.replace('app.asar', 'app.asar.unpacked');
    for (const d of [unpacked, dir]) {
      const f = path.join(d, 'PresentMon.exe');
      if (fs.existsSync(f)) return f;
    }
    return null;
  }

  startPresentMon() {
    if (!win32) return;
    if (!this.gamePid) {
      this.stopPresentMon();
      this.fpsState = 'off';
      return;
    }
    if (this.pm && this.pmPid === this.gamePid) return;
    this.stopPresentMon();
    const exe = this.presentMonPath();
    if (!exe) {
      this.fpsState = 'missing';
      return;
    }
    const attempts = [
      ['--process_id', String(this.gamePid), '--output_stdout', '--stop_existing_session', '--no_console_stats', '--terminate_on_proc_exit'],
      ['-process_id', String(this.gamePid), '-output_stdout', '-stop_existing_session', '-no_top'],
    ];
    const launch = (n) => {
      const p = spawn(exe, attempts[n], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.pm = p;
      this.pmPid = this.gamePid;
      this.fpsState = 'ok';
      let buf = '';
      let col = -1;
      let gotData = false;
      let errText = '';
      p.stdout.on('data', (d) => {
        buf += d.toString('utf8');
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          const cells = line.split(',');
          if (col < 0) {
            const k = cells.findIndex((c) => /^msbetweenpresents$/i.test(c.trim()));
            if (k >= 0) col = k;
            continue;
          }
          const ms = parseFloat(cells[col]);
          if (ms > 0 && ms < 2000) {
            gotData = true;
            this.frames.push(Date.now());
          }
        }
      });
      p.stderr.on('data', (d) => {
        errText += d.toString('utf8');
      });
      p.on('exit', () => {
        if (this.pm !== p) return;
        this.pm = null;
        if (gotData) return;
        if (/access|administrator|privilege|elevat|performance log users/i.test(errText)) this.fpsState = 'admin';
        else if (n + 1 < attempts.length) launch(n + 1);
        else this.fpsState = 'error';
      });
      p.on('error', () => {
        if (this.pm === p) this.pm = null;
        this.fpsState = 'error';
      });
    };
    launch(0);
  }

  stopPresentMon() {
    if (this.pm) {
      const p = this.pm;
      this.pm = null;
      try {
        p.kill();
      } catch {}
    }
    this.pmPid = 0;
  }

  cpuLoad() {
    const now = os.cpus();
    const prev = this.lastCpu || now;
    this.lastCpu = now;
    let idle = 0;
    let total = 0;
    for (let i = 0; i < now.length; i++) {
      const a = prev[i] ? prev[i].times : now[i].times;
      const b = now[i].times;
      const di = b.idle - a.idle;
      const dt = b.user - a.user + (b.nice - a.nice) + (b.sys - a.sys) + (b.irq - a.irq) + di;
      idle += di;
      total += dt;
    }
    return total > 0 ? Math.round((1 - idle / total) * 100) : 0;
  }

  readNvidia() {
    if (!win32 || Date.now() - this.gpuAt < 1900) return;
    this.gpuAt = Date.now();
    execFile('nvidia-smi', ['--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 1500 }, (err, out) => {
      if (err) return;
      const c = String(out).split('\n')[0].split(',').map((x) => x.trim());
      if (c.length < 5) return;
      this.gpu = { name: c[0], temp: Number(c[1]), load: Number(c[2]), vram: Number(c[3]), vramTotal: Number(c[4]) };
    });
  }

  tick() {
    if (this.holdUntil && !this.gamePid && Date.now() > this.holdUntil) {
      this.stop();
      return;
    }
    this.readNvidia();
    const cut = Date.now() - 1000;
    while (this.frames.length && this.frames[0] < cut) this.frames.shift();
    const total = os.totalmem();
    const used = total - os.freemem();
    const stats = {
      fps: this.fpsState === 'ok' && this.frames.length ? this.frames.length : null,
      fpsState: this.fpsState,
      cpu: this.cpuLoad(),
      cpuTemp: this.cpuTemp,
      cpuTempSrc: this.cpuTempSrc,
      gpuTemp: Number.isFinite(this.gpu.temp) ? this.gpu.temp : null,
      gpuLoad: Number.isFinite(this.gpu.load) ? this.gpu.load : null,
      vram: Number.isFinite(this.gpu.vram) ? this.gpu.vram : null,
      vramTotal: Number.isFinite(this.gpu.vramTotal) ? this.gpu.vramTotal : null,
      ram: Math.round(used / 1048576),
      ramTotal: Math.round(total / 1048576),
      ramPct: Math.round((used / total) * 100),
      time: Date.now(),
    };
    this.last = stats;
    this.onStats(stats);
  }
}

/* ------------------------------------------------------------------ */
/* Everything wired together                                           */
/* ------------------------------------------------------------------ */

const HUD_ITEMS = ['fps', 'cpu', 'gpu', 'ram'];

function init({ settings, system, send, monitor, ipcMain, library }) {
  let hud = null;
  let runningList = [];
  let hudWanted = false;
  let mouseOn = false;

  const S = () => settings.data;

  /* ---------------- performance overlay ---------------- */

  const perf = new PerfMonitor({
    onStats: (stats) => {
      if (hud && !hud.isDestroyed()) hud.webContents.send('perf:stats', { stats, settings: hudSettings() });
      for (const w of BrowserWindow.getAllWindows()) {
        if (w !== hud && !w.isDestroyed()) w.webContents.send('perf:stats', { stats });
      }
    },
  });

  function hudSettings() {
    const s = S();
    return {
      items: Array.isArray(s.perfItems) && s.perfItems.length ? s.perfItems : HUD_ITEMS,
      position: s.perfPosition || 'tr',
      opacity: Number.isFinite(s.perfOpacity) ? s.perfOpacity : 85,
      scale: Number.isFinite(s.perfScale) ? s.perfScale : 100,
      compact: s.perfCompact === true,
    };
  }

  function placeHud() {
    if (!hud || hud.isDestroyed()) return;
    const d = screen.getPrimaryDisplay();
    const b = d.bounds;
    hud.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
  }

  function createHud() {
    if (hud && !hud.isDestroyed()) return hud;
    hud = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      title: 'PlayOSX Performance',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        enableWebSQL: false,
        backgroundThrottling: false,
      },
    });
    hud.setAlwaysOnTop(true, 'screen-saver');
    hud.setIgnoreMouseEvents(true, { forward: false });
    hud.setMenu(null);
    hud.loadURL('app://ui/perfhud.html');
    hud.webContents.on('will-navigate', (e) => e.preventDefault());
    hud.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    hud.on('closed', () => {
      hud = null;
    });
    placeHud();
    return hud;
  }

  function currentGame() {
    let best = null;
    for (const item of runningList) {
      const e = typeof item === 'string' ? { id: item, since: 0, pid: 0 } : item;
      if (!best || (e.since || 0) >= (best.since || 0)) best = e;
    }
    if (!best) return null;
    let pid = best.pid || 0;
    if (!pid && monitor && monitor.get) {
      const g = monitor.get(best.id);
      pid = g && g.pid ? g.pid : 0;
    }
    return { id: best.id, pid };
  }

  function applyHud() {
    const cur = currentGame();
    const want = !!S().perfOverlay && !!cur;
    if (want) {
      hudWanted = true;
      const w = createHud();
      placeHud();
      if (!w.isVisible()) w.showInactive();
      perf.start(cur.pid);
    } else {
      hudWanted = false;
      if (hud && !hud.isDestroyed()) hud.hide();
      if (!perf.holdUntil || Date.now() > perf.holdUntil) perf.stop();
    }
  }

  /* ---------------- controller tuning ---------------- */

  const IDENT = Array.from({ length: 17 }, (_, i) => i);

  function profileFor(gameId) {
    const s = S();
    const per = (s.padProfiles && ((gameId && s.padProfiles[gameId]) || s.padProfiles['*'])) || null;
    const sens = per && Number.isFinite(per.sens) ? per.sens : Number.isFinite(s.padTriggerSens) ? s.padTriggerSens : 50;
    return {
      map: per && Array.isArray(per.map) && per.map.length === 17 ? per.map : IDENT,
      sens,
      dead: per && Number.isFinite(per.dead) ? per.dead : Number.isFinite(s.padStickDead) ? s.padStickDead : 0,
      rumble: per && Number.isFinite(per.rumble) ? per.rumble : Number.isFinite(s.padRumble) ? s.padRumble : 100,
      center: Array.isArray(s.padCenter) && s.padCenter.length === 4 ? s.padCenter : [0, 0, 0, 0],
    };
  }

  /** Trigger sensitivity 0..100 (50 = as the controller is): dead zone below 50, shorter pull above. */
  function triggerRange(sens) {
    const low = Math.round(Math.max(0, 50 - sens) * 0.4 * 2.55);
    const high = Math.round(255 * (1 - Math.max(0, sens - 50) * 0.008));
    return { low, high };
  }

  async function applyPad(gameId = null) {
    const p = profileFor(gameId);
    const { low, high } = triggerRange(p.sens);
    try {
      await system.request('padTune', { map: p.map.join(','), low, high, dead: p.dead, center: p.center.join(','), rumble: p.rumble }, 3000);
    } catch {}
    return p;
  }

  function hex(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
    const n = m ? parseInt(m[1], 16) : 0x2f7cf6;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  async function applyLight() {
    if (!S().padLightOn) return false;
    const c = hex(S().padLightColor);
    const k = Math.max(0.1, Math.min(1, (Number.isFinite(S().padLightBright) ? S().padLightBright : 100) / 100));
    try {
      return await system.request('padLight', { r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k), light: true, small: 0, large: 0 }, 3000);
    } catch {
      return false;
    }
  }

  async function applyMouse() {
    const on = mouseOn;
    try {
      await system.request('padMouse', { value: on, speed: Number.isFinite(S().padMouseSpeed) ? S().padMouseSpeed : 900 }, 3000);
    } catch {}
    send('padmouse:state', on);
  }

  function setMouse(on) {
    mouseOn = !!on;
    applyMouse();
    send('notify', { title: mouseOn ? 'Mouse Mode On' : 'Mouse Mode Off', body: mouseOn ? 'Left stick moves the pointer, right stick scrolls. Cross clicks, Circle right-clicks.' : 'The controller works normally again.', icon: 'gamepad', kind: 'controller' });
  }

  function registerMouseHotkey() {
    try {
      globalShortcut.unregister('Control+Alt+M');
    } catch {}
    if (S().padMouseHotkey === false) return;
    try {
      globalShortcut.register('Control+Alt+M', () => setMouse(!mouseOn));
    } catch {}
  }

  /* ---------------- hooks called by main.js ---------------- */

  function onRunning(list) {
    runningList = list || [];
    const cur = currentGame();
    applyHud();
    applyPad(cur ? cur.id : null);
    if (S().powerGame && S().powerGame !== 'off') {
      if (cur) setPowerPlan(S().powerGame).then((r) => r.ok && send('power:state', r));
      else setPowerPlan(S().powerMode || 'balanced').then((r) => r.ok && send('power:state', r));
    }
  }

  function onSettings(patch) {
    const keys = Object.keys(patch || {});
    if (keys.some((k) => k.startsWith('perf'))) {
      applyHud();
      if (hud && !hud.isDestroyed()) hud.webContents.send('perf:stats', { stats: perf.last, settings: hudSettings() });
    }
    if (keys.some((k) => k.startsWith('pad') && !k.startsWith('padRate') && !k.startsWith('padLight') && !k.startsWith('padMouse'))) {
      const cur = currentGame();
      applyPad(cur ? cur.id : null);
    }
    if (keys.some((k) => k.startsWith('padLight'))) applyLight();
    if (keys.includes('padMouseHotkey')) registerMouseHotkey();
    if (keys.includes('padMouseSpeed') && mouseOn) applyMouse();
    if ('powerMode' in patch) setPowerPlan(S().powerMode || 'balanced').then((r) => send('power:state', r));
  }

  function start() {
    registerMouseHotkey();
    applyPad(null);
    // Reapply the colour when a controller (re)connects.
    let lastCount = 0;
    setInterval(() => {
      if (!S().padLightOn) return;
      system.request('dualsenseInfo', {}, 2000).then((pads) => {
        const n = Array.isArray(pads) ? pads.length : 0;
        if (n !== lastCount) {
          lastCount = n;
          if (n) setTimeout(applyLight, 1500);
        }
      }).catch(() => {});
    }, 5000).unref();
    if (S().powerMode && S().powerApplyOnStart) setPowerPlan(S().powerMode);
  }

  function stop() {
    perf.stop();
    try {
      globalShortcut.unregister('Control+Alt+M');
    } catch {}
    if (mouseOn) system.request('padMouse', { value: false }, 1000).catch(() => {});
    if (hud && !hud.isDestroyed()) hud.destroy();
  }

  /* ---------------- IPC ---------------- */

  ipcMain.handle('perf:snapshot', () => perf.preview() || null);
  ipcMain.handle('perf:info', () => ({ presentMon: !!perf.presentMonPath(), fpsState: perf.fpsState, hwmon: perf.cpuTempSrc }));
  ipcMain.handle('power:get', () => getPowerPlan());
  ipcMain.handle('power:set', async (_e, mode) => {
    const r = await setPowerPlan(mode);
    if (r.ok) settings.data.powerMode = mode, settings.saveNow();
    return r;
  });
  ipcMain.handle('pad:tuneApply', (_e, gameId) => applyPad(gameId || null).then(() => true));
  ipcMain.handle('pad:light', async (_e, color, brightness) => {
    const c = hex(color);
    const k = Math.max(0.1, Math.min(1, (Number.isFinite(brightness) ? brightness : 100) / 100));
    return system.request('padLight', { r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k), light: true, small: 0, large: 0 }, 3000).catch(() => 0);
  });
  ipcMain.handle('pad:rumbleTest', async (_e, strength) => {
    const v = Math.round(Math.max(0, Math.min(1.5, (Number.isFinite(strength) ? strength : 100) / 100)) * 200);
    const c = hex(S().padLightColor);
    const base = { r: c.r, g: c.g, b: c.b, light: !!S().padLightOn };
    const n = await system.request('padLight', { ...base, small: Math.min(255, v), large: Math.min(255, v) }, 3000).catch(() => 0);
    setTimeout(() => system.request('padLight', { ...base, small: 0, large: 0 }, 3000).catch(() => {}), 450);
    return n;
  });
  ipcMain.handle('padmouse:get', () => mouseOn);
  ipcMain.handle('padmouse:set', (_e, on) => {
    setMouse(on);
    return mouseOn;
  });
  ipcMain.handle('pad:profile', (_e, gameId) => profileFor(gameId || null));

  return { start, stop, onRunning, onSettings, getPowerPlan, setPowerPlan, applyPad };
}

module.exports = { init, getPowerPlan, setPowerPlan };
