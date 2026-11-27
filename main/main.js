const { app, BrowserWindow, ipcMain, protocol, net, shell, Menu, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const { Readable } = require('stream');
const { JsonStore } = require('./store');
const { Library } = require('./library');
const { launchGame } = require('./launcher');
const { searchSteam } = require('./metadata');
const sgdb = require('./sgdb');
const { SGDB_KEY } = require('./secrets');
const { ThemeMusic, sanitizeChoice: themeChoice } = require('./thememusic');
const { YtDlp } = require('./ytdlp');
const { SystemBridge } = require('./system');
const { NightSchedule } = require('./nightschedule');
const { DiscordBridge } = require('./discord');
const { SteamFriends } = require('./steamfriends');
const { Updater } = require('./updater');
const { OverlayManager } = require('./overlay');
const { GameMonitor } = require('./gamemonitor');
const { SoundPacks } = require('./soundpacks');
const { ObsBridge } = require('./obs');
const { SteamDownloads } = require('./steamdownloads');
const { Storage } = require('./storage');
const files = require('./files');
const { gpuPreference } = require('./gpu');
const { deviceInfo } = require('./deviceinfo');
const emulators = require('./emulators');
const featuresModule = require('./features');
const pro = require('./pro');
const { enrichSessions } = require('./displaynames.js');

const DEFAULT_SETTINGS = {
  // Library
  folders: [],
  // Emulators, by platform: { switch: { exe, fullscreen } } (main/emulators.js)
  emulators: {},
  scanSteam: true,
  scanEpic: true,
  scanXbox: true,
  scanUbisoft: true,
  preferDirect: false,
  rescanOnStartup: true,
  // Steam updates start as soon as one is out, instead of on Steam's own schedule
  steamAutoUpdate: false,
  // Steam games the account owns but hasn't installed show in the library (to download)
  steamOwned: true,
  artSource: 'sgdb',
  tileStyle: 'auto',
  // Home
  homeCount: 12,
  homeSort: 'recent',
  background: 'animated',
  heroMotion: true,
  showClock: true,
  clock24: false,
  // Sound
  uiSounds: true,
  uiVolume: 60,
  ambient: false,
  ambientVolume: 35,
  themeMusic: null, // null: on when yt-dlp is installed (see YtDlp)
  themeMusicVolume: 50,
  themeMusicNewGames: true,
  // Screen
  hardwareAcceleration: true,
  fullscreen: true,
  uiScale: 100,
  reduceMotion: false,
  // Safe area: how much of each edge the interface keeps clear, in percent (TVs that crop the picture)
  safeArea: 0,
  // Game colors (see Display in main/native/display.cs); percent, 100 = normal, brightness -15..15, vibrance 0..100 (NVIDIA)
  colorsOn: false,
  colorGamma: 100,
  colorContrast: 100,
  colorBrightness: 0,
  colorVibrance: 0,
  // Night Light by itself: off | sun (sunset to sunrise) | custom (nightFrom to nightTo)
  nightSchedule: 'off',
  nightFrom: '21:00',
  nightTo: '07:00',
  nightLat: '',
  nightLon: '',
  // Controllers
  prompts: 'auto',
  vibration: true,
  // System
  autoUpdateCheck: true,
  launchAtStartup: false,
  onLaunch: 'minimize',
  overlay: true,
  overlayHotkey: true,
  pauseGames: true,
  qmHidden: [],
  restoreOnExit: true,
  welcomeScreen: true,
  // Controller passthrough: games get a virtual DualSense (needs HidHide + usbip-win2)
  controllerPassthrough: false,
  // What the DualSense is shown to games as: dualsense | dualshock4 | xbox360
  passthroughEmulation: 'dualsense',
  // Polling rate games get from the virtual pad, in Hz (0 = the controller's own)
  padRateUsb: 0,
  padRateBt: 0,
  // Performance overlay (main/features.js): FPS, CPU / GPU temperature and load, RAM while a game runs
  // Idle screen: seconds without input before it appears (0 = never)
  idleSeconds: 300,
  perfOverlay: false,
  perfItems: ['fps', 'cpu', 'gpu', 'ram'],
  perfPosition: 'tr',
  perfOpacity: 85,
  perfScale: 100,
  perfCompact: false,
  // Windows power plan: saver | balanced | performance. powerGame: plan used while a game runs (off = leave it)
  powerMode: 'balanced',
  powerGame: 'off',
  powerApplyOnStart: false,
  // Controller tuning (applied to the virtual pad, needs controllerPassthrough)
  padTriggerSens: 50, // 0..100, 50 = as the controller is
  padStickDead: 0, // percent
  padRumble: 100, // percent
  padCenter: [0, 0, 0, 0], // stick centre offsets from calibration
  padProfiles: {}, // per game: { map: [17 targets], sens, dead, rumble }
  padLightOn: false,
  padLightColor: '#2f7cf6',
  padLightBright: 100,
  padMouseSpeed: 900,
  padMouseHotkey: true, // Ctrl+Alt+M toggles controller-as-mouse
  // Look: theme, background style, interface style, game card size and density
  theme: 'ps5',
  bgStyle: 'auto',
  uiStyle: 'classic',
  cardSize: 'medium', // large | medium | small
  cardDensity: 'comfortable', // comfortable | compact
  // Interface typeface: system (Segoe UI) | sst (PlayStation's SST, from renderer/fonts/sst)
  font: 'ps',
  // Sound themes (deckthemes.com audio packs): installed pack ids, or null for the built-in sounds
  soundPack: null,
  defaultPacksDone: false,
  musicPack: null,
  // Notifications
  notifPopups: true,
  notifPreview: true,
  notifDuration: 'default',
  notif_discord: 'always',
  notif_party: 'always',
  notif_controller: 'always',
  notif_game: 'always',
  notif_library: 'notInGame',
  notif_system: 'always',
  notif_capture: 'always',
  notif_downloads: 'always',
  // Captures (recording through OBS Studio, see main/obs.js)
  captureEnabled: false,
  captureDir: '', // '' = Videos\PlayOSX
  captureClipLength: 60, // seconds kept for "Save Recent Gameplay"
  captureResolution: 1080, // output height; 0 = same as the screen
  captureFps: 60,
  captureEncoder: 'auto', // auto | nvenc | amd | qsv | x264
  captureQuality: 'high', // standard (bitrate) | high | best
  captureBitrate: 20000, // kbps, for "standard"
  captureFormat: 'mp4', // mp4 | mkv
  captureShotFormat: 'png', // png | jpg
  captureMic: false,
  captureGameAudioOnly: true,
  captureCreateButton: true, // DualSense Create button opens the capture menu
  language: 'auto',
  // Pro features
  tbClock: true, tbDate: false, tbBattery: true, tbWifi: true,
  homeWidget: true, homeShowDate: true, homeShowWeather: true, weatherCity: 'Cairo',
  pins: {}, autoLockMin: 0, lockOnStart: true,
  genreMap: {}, genreAuto: false, qmOrder: [], activityLog: [],
  ytList: [], musicVol: 60, musicAuto: false,
  // Profile
  shellMode: false,
  autoClickPlay: true,
  guideOpensLauncher: true,
  profileName: 'Player',
  avatar: 0,
  avatarImage: null,
  profiles: [],
  profileId: null,
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
};

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Smoother rendering: rasterize on the GPU and skip the driver blocklist.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
// (zero-copy is left off: on some GPUs it makes the GPU process fail with "GPU state invalid".)
// The launcher's own sound (game theme music, clips) isn't media for Windows:
// no entry in its media controls, media keys stay with the player apps, and
// the "another app is playing media" check doesn't see the launcher itself.
const LEAN = !process.argv.includes('--no-tweaks'); // --no-tweaks: run with Electron's stock flags (for troubleshooting)
// Lean Chromium: only switches that turn off background services, telemetry and
// updates (nothing that touches rendering, caching or the JS engine: an earlier
// set that did made artwork and screenshots stop showing).
app.commandLine.appendSwitch('disable-features', LEAN
  ? 'HardwareMediaKeyHandling,MediaSessionService,Translate,TranslateUI,AutofillServerCommunication,MediaRouter'
  : 'HardwareMediaKeyHandling,MediaSessionService');
if (LEAN) {
  for (const sw of [
    'disable-background-networking', 'disable-component-update', 'disable-sync', 'disable-default-apps',
    'disable-domain-reliability', 'disable-breakpad', 'disable-client-side-phishing-detection',
    'no-pings', 'metrics-recording-only', 'no-default-browser-check',
  ]) app.commandLine.appendSwitch(sw);
}

/**
 * The launcher used to be called "ClaudeLauncher" and kept its data in
 * %APPDATA%\ClaudeLauncher. Move that folder to the new name once, before
 * Chromium opens anything in it (the whole folder moves, so the encrypted
 * Discord sign-in still decrypts).
 */
function migrateDataDir() {
  try {
    const dir = app.getPath('userData');
    const old = path.join(app.getPath('appData'), 'ClaudeLauncher');
    if (path.resolve(old) === path.resolve(dir) || !fs.existsSync(path.join(old, 'settings.json'))) return;
    if (fs.existsSync(path.join(dir, 'settings.json')) || fs.existsSync(path.join(dir, 'library.json'))) return;
    if (!fs.existsSync(dir)) {
      try {
        fs.renameSync(old, dir);
        return;
      } catch {}
    }
    // The folder is in use (or the new one exists already): move/copy what matters.
    fs.mkdirSync(dir, { recursive: true });
    for (const name of ['settings.json', 'library.json', 'discord.json', 'steamfriends.json', 'Local State', 'artwork', 'avatars']) {
      const from = path.join(old, name);
      const to = path.join(dir, name);
      if (!fs.existsSync(from) || fs.existsSync(to)) continue;
      try {
        fs.renameSync(from, to);
      } catch {
        try {
          fs.cpSync(from, to, { recursive: true });
        } catch {}
      }
    }
  } catch (err) {
    console.error('Could not move the old data folder:', err);
  }
}
migrateDataDir();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function start() {
  const dataDir = app.getPath('userData');
  const artDir = path.join(dataDir, 'artwork');
  const avatarDir = path.join(dataDir, 'avatars');
  const packs = new SoundPacks(path.join(dataDir, 'soundpacks'));
  // Every user has their own data (settings, games, theme music). The first
  // (root) user keeps the original files in the data folder; the others live in
  // <userData>/profiles/<id>/ and start completely empty.
  const metaFile = path.join(dataDir, 'profiles-meta.json');
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) || {}; } catch {}
  if (!meta.rootId) {
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')) || {}; } catch {}
    meta.rootId = raw.profileId || 'p1';
    meta.activeId = meta.rootId;
    try { fs.writeFileSync(metaFile, JSON.stringify(meta)); } catch {}
  }
  if (!meta.activeId) meta.activeId = meta.rootId;
  const profileDir = (id) => (id === meta.rootId ? dataDir : path.join(dataDir, 'profiles', String(id).replace(/[^\w-]/g, '_')));
  const saveMeta = () => { try { fs.writeFileSync(metaFile, JSON.stringify(meta)); } catch {} };
  const settings = new JsonStore(path.join(profileDir(meta.activeId), 'settings.json'), DEFAULT_SETTINGS);
  if (meta.activeId !== meta.rootId) settings.data.profileId = meta.activeId;
  settings.data.adminId = meta.rootId; // the administrator: the only user who can delete users
  // Electron requires this before app readiness and before any windows exist.
  // Enabling again uses Electron's default GPU acceleration on the next launch.
  if (settings.data.hardwareAcceleration === false) app.disableHardwareAcceleration();
  const libStore = new JsonStore(path.join(profileDir(meta.activeId), 'library.json'), { games: [], excluded: [] });

  /** @type {BrowserWindow | null} */
  let win = null;
  let overlay = null;
  // Most state goes to both the launcher and the in-game overlay window.
  const MAIN_ONLY = new Set(['window:state', 'notify', 'scan:progress', 'navigate', 'discord:message']);
  const send = (channel, payload) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    if (!MAIN_ONLY.has(channel) && overlay) overlay.send(channel, payload);
  };
  // Library changes also tell game theme music about newly installed games (set up below).
  let onLibraryChanged = null;
  const librarySend = (channel, payload) => {
    send(channel, payload);
    if (channel === 'library:changed' && onLibraryChanged) onLibraryChanged(payload);
  };
  const library = new Library({ store: libStore, settings, artDir, send: librarySend });
  const system = new SystemBridge();
  const nightSchedule = new NightSchedule({ getSettings: () => settings.data, system });

  /** Game colors from the settings: on, or back to normal. */
  function applyColors() {
    const s = settings.data;
    if (!s.colorsOn) {
      system.resetColors().catch(() => {});
      return;
    }
    system
      .setColors({
        device: '',
        gamma: (Number(s.colorGamma) || 100) / 100,
        contrast: (Number(s.colorContrast) || 100) / 100,
        brightness: (Number(s.colorBrightness) || 0) / 100,
        vibrance: Number(s.colorVibrance) || 0,
      })
      .catch(() => {});
  }
  const discord = new DiscordBridge({ file: path.join(dataDir, 'discord.json'), send });
  const steamFriends = new SteamFriends({ file: path.join(dataDir, 'steamfriends.json'), send, system });
  const updater = new Updater({ send, settings });
  const ytdlp = new YtDlp({ dataDir, settings, send });
  const themeMusic = new ThemeMusic({ dataDir: profileDir(meta.activeId), ytdlp, send });
  // yt-dlp ships with the app, so game theme music is on by default. If this
  // build has no bundled copy, it is downloaded quietly in the background.
  if (settings.data.themeMusic == null) {
    settings.data.themeMusic = true;
    settings.saveSoon();
  }
  if (!ytdlp.installed()) ytdlp.install().catch(() => {});
  // A newer yt-dlp every couple of days, quietly (YouTube changes break old ones).
  const ytdlpUpdate = () => settings.data.themeMusic && ytdlp.updateIfDue();
  setTimeout(ytdlpUpdate, 60 * 1000);
  setInterval(ytdlpUpdate, 6 * 60 * 60 * 1000);
  // A game that appears installed (a scan found it, a download finished) gets
  // its theme right away (Settings › Sound › Get Theme Music for New Games).
  const themeGame = (g) => g.installed !== false && g.category !== 'media';
  const knownGames = new Set(library.games.filter(themeGame).map((g) => g.id));
  onLibraryChanged = (games) => {
    const fresh = (games || []).filter((g) => themeGame(g) && !knownGames.has(g.id));
    fresh.forEach((g) => knownGames.add(g.id));
    if (fresh.length && settings.data.themeMusic === true && settings.data.themeMusicNewGames !== false && ytdlp.installed()) themeMusic.fetchNew(fresh);
  };
  const obs = new ObsBridge({ dataDir, settings, send, system, defaultDir: () => path.join(app.getPath('videos'), 'PlayOSX') });
  overlay = new OverlayManager({
    system,
    onVisibility: (visible) => {
      updatePassthroughMute();
      updateSleep();
      return visible ? schedulePause() : updatePause();
    },
    onBeforeShow: () => setSleep(false),
    onIdle: () => updateSleep(),
  });

  /* ---- In game: the launcher steps aside --------------------------
     While a game is in front (launcher minimized or behind it, no menu or
     notification over the game) the launcher's renderer, GPU and service
     processes run in Windows' efficiency mode at a lower priority, all of
     its memory is trimmed, and both pages drop their audio output and
     polling. It all comes back the moment the launcher, a menu or a
     notification needs it (setSleep(false) runs before anything shows). */
  let asleep = false;
  let sleepTimer = null;
  const launcherInFront = () => !!(win && win.isVisible() && !win.isMinimized() && win.isFocused());
  function updateSleep() {
    clearTimeout(sleepTimer);
    const idle = monitor.list().length > 0 && !launcherInFront() && !overlay.visible && !overlay.toastShown;
    if (!idle) return setSleep(false);
    // Give the game a moment to take over (and the launcher to minimize) first.
    sleepTimer = setTimeout(() => setSleep(true), 5000);
  }
  function setSleep(on) {
    if (!on) clearTimeout(sleepTimer);
    if (on === asleep) return;
    asleep = on;
    const metrics = app.getAppMetrics();
    const helpers = metrics.filter((m) => m.type !== 'Browser').map((m) => m.pid);
    system.request('procQos', { pids: helpers, eco: on, lower: on, trim: on }).catch(() => {});
    // The main process keeps its priority (it reacts to the PS button); only its memory is trimmed.
    if (on) system.request('procQos', { pids: [process.pid], eco: false, trim: true }).catch(() => {});
    send('app:sleep', on);
  }

  /* ---- Pausing the game while a menu is in front ------------------
     Windows has no safe way to stop a game from reading the controller, so
     while the quick menu (or the home screen) is in front of a running game we
     suspend the game process — but only for games without anti-cheat files.
     The helper resumes everything if the launcher ever goes away. */
  let pausedPid = null;
  let pauseTimer = null;
  let closingPid = null; // a game being closed is never paused again
  function schedulePause() {
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(updatePause, 120);
  }
  async function updatePause() {
    const cur = monitor.list().sort((a, b) => b.since - a.since)[0];
    const launcherFront = !!(win && win.isVisible() && !win.isMinimized() && win.isFocused());
    const age = cur ? Date.now() - cur.since : 0;
    const settled = cur && age > 15000; // never pause a game that is still starting
    if (cur && !settled) pauseTimer = setTimeout(updatePause, 15000 - age + 200);
    let want = null;
    const curGame = cur && library.find(cur.id);
    const realPad = !!(curGame && curGame.controllerMode === 'real' && settings.data.controllerPassthrough);
    // The capture menu never pauses the game (clips must keep recording).
    const menuOpen = overlay.visible && overlay.mode !== 'capture';
    if ((settings.data.pauseGames !== false || realPad) && cur && settled && cur.pid !== closingPid && !monitor.hasAntiCheat(cur.id) && (menuOpen || launcherFront)) {
      const g = curGame;
      const mode = realPad ? 'always' : (g && g.pauseMode) || 'auto';
      if (mode === 'always') want = cur.pid;
      else if (mode === 'auto') {
        // Connected to a server? Pausing would disconnect it, so let it run.
        const conns = cur.pid === pausedPid ? 0 : await system.request('netConns', { pid: cur.pid }, 3000).catch(() => 1);
        if (!conns) want = cur.pid;
      }
    }
    // wait: the helper first waits for all controller buttons to be released,
    // so the game never wakes up with a button stuck down.
    if (pausedPid && pausedPid !== want) {
      await system.request('resume', { pid: pausedPid, wait: true }, 5000).catch(() => {});
      pausedPid = null;
    }
    if (want && want !== pausedPid) {
      const ok = await system.request('suspend', { pid: want, wait: true }, 5000).catch(() => false);
      if (ok) pausedPid = want;
    }
  }
  async function resumeNow() {
    clearTimeout(pauseTimer);
    if (pausedPid) {
      await system.request('resume', { pid: pausedPid, wait: true }, 5000).catch(() => {});
      pausedPid = null;
    }
  }

  /* ---- Shell mode: the launcher replaces the Windows desktop ----------
     Launcher runs at high priority for its first 20 s (fast start). Explorer
     is started only when the launcher is minimized or closed. */
  const WINLOGON = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon';
  const regRun = (args) => new Promise((res) => execFile('reg', args, { windowsHide: true }, (err) => res(!err)));
  if (process.platform === 'win32') {
    try { require('os').setPriority(0, require('os').constants.priority.PRIORITY_HIGH); } catch {}
    setTimeout(() => { try { require('os').setPriority(0, require('os').constants.priority.PRIORITY_NORMAL); } catch {} }, 20000);
  }
  let explorerSpawnedAt = 0;
  let shellExplorerUp = false; // the desktop was started by the launcher in this session
  const explorerRunning = () => {
    try {
      const out = require('child_process').execFileSync('tasklist', ['/FI', 'IMAGENAME eq explorer.exe', '/NH'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
      return /explorer\.exe/i.test(out || '');
    } catch {
      return true; // can't tell: don't risk opening an extra window
    }
  };
  /** Settings (Launcher Instead of the Desktop) made this launcher the Windows shell: no desktop starts by itself. */
  const launcherIsShell = () => {
    try {
      const out = require('child_process').execFileSync('reg', ['query', WINLOGON, '/v', 'Shell'], { windowsHide: true, encoding: 'utf8', timeout: 4000 });
      return out.toLowerCase().includes(path.basename(process.execPath).toLowerCase());
    } catch {
      return !!settings.data.shellMode;
    }
  };
  /**
   * Bring the Windows desktop back when the launcher is minimized or closed.
   * With the launcher as the shell no desktop exists, and an explorer.exe that is
   * still around (a folder window, a file dialog) only opens a window instead of
   * the desktop and taskbar: such leftovers are closed first, then explorer
   * starts as the shell. Done through a detached cmd, so it still runs while
   * the launcher is quitting. (`force` is kept for the callers; it no longer matters.)
   */
  function ensureExplorer() {
    if (process.platform !== 'win32') return;
    if (Date.now() - explorerSpawnedAt < 15000) return; // just started it (before-quit can fire twice)
    const running = explorerRunning();
    const asShell = launcherIsShell();
    if (running && (!asShell || shellExplorerUp)) return; // the desktop is already there
    explorerSpawnedAt = Date.now();
    shellExplorerUp = true;
    const cp = require('child_process');
    try {
      const cmd = running
        ? 'taskkill /f /im explorer.exe >nul 2>&1 & ping -n 2 127.0.0.1 >nul & start "" explorer.exe'
        : 'start "" explorer.exe';
      cp.spawn('cmd.exe', ['/c', cmd], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
    } catch {
      try { cp.spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).unref(); } catch {}
    }
  }
  const applyShell = async (on) => {
    if (process.platform !== 'win32') return false;
    if (on) {
      await regRun(['add', WINLOGON, '/v', 'Shell', '/t', 'REG_SZ', '/d', `"${process.execPath}"`, '/f']);
      // No startup delay for the programs that start with Windows.
      await regRun(['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize', '/v', 'StartupDelayInMSec', '/t', 'REG_DWORD', '/d', '0', '/f']);
      // Needs admin; harmless when it fails.
      await regRun(['add', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', '/v', 'DelayedDesktopSwitchTimeout', '/t', 'REG_DWORD', '/d', '0', '/f']);
    } else {
      await regRun(['delete', WINLOGON, '/v', 'Shell', '/f']);
    }
    settings.data.shellMode = !!on;
    settings.saveNow();
    send('settings:changed', settings.data);
    return !!on;
  };
  ipcMain.handle('shell:set', (_e, on) => applyShell(on));
  ipcMain.on('shell:apply', (_e, on) => applyShell(on));

  /** Bring the launcher to the front, optionally navigating somewhere. */
  async function showLauncher(nav) {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    const ok = await system.focusWindow(overlay.hwndOf(win));
    if (!ok) win.focus();
    if (nav) send('navigate', nav);
  }

  let features = null;
  const monitor = new GameMonitor({
    library,
    system,
    onChange: (list) => {
      send('game:running', list);
      if (features) features.onRunning(list);
      schedulePause();
      updateSleep();
      if (settings.data.controllerPassthrough) applyPassthrough(false);
      // Recording follows the game: OBS's replay buffer runs while one is open.
      obs.onRunning(list, (id) => library.find(id)).catch(() => {});
    },
    onEnded: (id, minutes) => {
      // It quit while still starting: stop keeping the launcher on top for it. The
      // watch itself goes on for a moment, in case a launcher process handed over.
      if (launchWatchId === id) {
        launchEndedAt = Date.now();
        setCover(false);
      }
      const g = library.find(id);
      if (g && minutes > 0) {
        g.playtime = (g.playtime || 0) + minutes;
        library.save();
      }
      send('game:exited', { id, minutes, shortLived: minutes < 1 });
      const wasInLauncher = !!(win && win.isVisible() && !win.isMinimized() && win.isFocused()) && !overlay.visible;
      if (overlay.visible) overlay.hideNow({ restoreFocus: false });
      if (settings.data.restoreOnExit && !wasInLauncher) showLauncher({ view: 'home' });
    },
  });

  features = featuresModule.init({ settings, system, send, monitor, ipcMain, library });

  // Steam downloads: games needing an update, and update progress (main/steamdownloads.js).
  // While Steam is asked to update a game it shows its window: the launcher stays in front of it.
  let dlCover = false;
  const downloads = new SteamDownloads({
    library,
    system,
    monitor,
    settings,
    send,
    hooks: {
      cover: (on) => {
        if (!win || win.isDestroyed()) return;
        if (on) {
          dlCover = launcherInFront();
          if (dlCover) win.setAlwaysOnTop(true, 'screen-saver');
        } else if (dlCover) {
          dlCover = false;
          if (!coverOn) win.setAlwaysOnTop(false);
          system.focusWindow(overlay.hwndOf(win)).catch(() => {});
        }
      },
      // Steam's install dialog is answered: back to the launcher (if it was the one in use).
      focus: () => {
        if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && !monitor.list().length) system.focusWindow(overlay.hwndOf(win)).catch(() => {});
      },
      // A game finished installing: the library picks it up as installed.
      installed: () => library.scan({ silent: true }).catch(() => {}),
    },
  });

  // Guide / PS button (from the helper) and the keyboard shortcut.
  let lastGuide = 0;
  function onGuide() {
    const now = Date.now();
    if (now - lastGuide < 250) return;
    lastGuide = now;
    if (overlay.visible) {
      overlay.requestClose();
      return;
    }
    const launcherActive = win && win.isVisible() && !win.isMinimized() && win.isFocused();
    if (launcherActive) {
      win.webContents.send('pad:action', 'guide');
      return;
    }
    if (settings.data.overlay === false) {
      showLauncher();
      return;
    }
    // Game running: the launcher comes up, the game waits (paused) and the bar shows.
    if (settings.data.guideOpensLauncher !== false && monitor.list().length) {
      showLauncher().then(() => setTimeout(() => overlay.show({ running: monitor.list() }), 150));
      return;
    }
    overlay.show({ running: monitor.list() });
  }
  system.on('guide', onGuide);

  /* ---- Captures: the Create button opens the capture menu ----------
     A bar over the game (Save Recent Gameplay, Take Screenshot, Start
     Recording…). Unlike the quick menu it never pauses the game. */
  let lastShare = 0;
  function onShare() {
    const now = Date.now();
    if (now - lastShare < 300) return;
    lastShare = now;
    if (!settings.data.captureEnabled) return;
    if (overlay.visible) {
      if (overlay.mode === 'capture') overlay.requestClose();
      return;
    }
    if (!monitor.list().length) return; // only games are captured
    overlay.show({ mode: 'capture', running: monitor.list(), capture: obs.publicState() });
  }
  system.on('share', () => {
    if (settings.data.captureCreateButton !== false) onShare();
  });
  // While recording is on, the Create button belongs to the capture menu
  // (the virtual controller of controller passthrough doesn't pass it on).
  const applyCaptureButton = () => {
    // Remembered so a restarted helper gets it again.
    system.captureButton = !!settings.data.captureEnabled && settings.data.captureCreateButton !== false;
    return system.request('captureButton', { value: system.captureButton }).catch(() => {});
  };
  system.on('pad', (e) => {
    if (!e.action) return;
    if (padKeysHwnd) {
      const k = PAD_KEYS[e.action];
      if (k && keyProc) try { keyProc.stdin.write(`k ${k[0]} ${k[1]}\n`); } catch {}
      return;
    }
    if (overlay.visible) overlay.send('pad:action', { action: e.action, repeat: !!e.repeat, kind: e.kind });
    // With controller passthrough the launcher reads the real controller
    // through the helper too (the virtual one is muted while it is in front).
    else if ((passthrough.enabled || passthrough.fallback || passthrough.starting) && win && win.isFocused() && !win.isMinimized()) win.webContents.send('pad:action', { action: e.action, repeat: !!e.repeat, kind: e.kind });
  });

  /* ---- Controller passthrough (HidHide + libVIIPER) ----------------
     Games get a virtual DualSense that the launcher feeds from the real one
     (the helper makes it with libVIIPER, see main/native/syshelper.cs).
     Whenever the launcher or the quick menu is in front it is muted, so the
     game can't react to the menu's button presses. */
  // fallback: passthrough just went off and the launcher window doesn't see
  // the controller again yet, so it keeps getting it through the helper.
  // starting: it is being switched on at startup; the launcher window reads the
  // controller through the helper meanwhile (it doesn't read it itself then).
  const passthrough = { enabled: false, state: null, fallback: false, starting: false };
  system.on('passthrough', (e) => {
    passthrough.state = e.state;
    send('passthrough:state', e.state);
  });

  /* DualSense info for Settings › Accessories and the quick menu's battery:
     the helper reads it from the controllers it already listens to. */
  let dualsense = [];
  system.on('dualsense', (e) => {
    dualsense = e.pads || [];
    send('dualsense:state', dualsense);
  });
  // refresh: read firmware and MAC from the controllers again.
  ipcMain.handle('dualsense:info', async (_e, refresh) => {
    if (!refresh && dualsense.length) return dualsense;
    dualsense = (await system.request('dualsenseInfo', { refresh: !!refresh }, 5000).catch(() => null)) || dualsense;
    return dualsense;
  });
  /** A running game set to use the real controller (DualSense features): passthrough is off meanwhile. */
  function realControllerGame() {
    for (const r of monitor.list()) {
      const g = library.find(r.id);
      if (g && g.controllerMode === 'real') return g;
    }
    return null;
  }
  /* What the virtual controller is: the running game's own choice (Options ›
     Emulated Controller), else Settings › Controllers. A game being started
     counts already, so its controller is in place before it looks for one. */
  let launchingPad = null; // { id, until }
  function emulationFor() {
    const own = (g) => (g && ['dualsense', 'dualshock4', 'xbox360'].includes(g.padEmulation) ? g.padEmulation : null);
    for (const r of monitor.list().sort((a, b) => b.since - a.since)) {
      const g = library.find(r.id);
      if (g) return own(g) || settings.data.passthroughEmulation || 'dualsense';
    }
    if (launchingPad && Date.now() < launchingPad.until) {
      const g = library.find(launchingPad.id);
      if (own(g)) return own(g);
    }
    return settings.data.passthroughEmulation || 'dualsense';
  }
  let appliedEmulation = null;
  function applyEmulation() {
    const mode = emulationFor();
    if (system.passthroughArgs) system.passthroughArgs = { ...system.passthroughArgs, mode };
    if (!passthrough.enabled || mode === appliedEmulation) return;
    appliedEmulation = mode;
    system.request('passthroughConfig', { mode }).catch(() => {});
  }

  let passthroughWant = null;
  async function applyPassthrough(force = true) {
    const real = settings.data.controllerPassthrough ? realControllerGame() : null;
    const want = !!settings.data.controllerPassthrough && !real;
    if (!force && want === passthroughWant) {
      applyEmulation();
      return passthrough.state;
    }
    passthroughWant = want;
    const args = { value: want, mode: emulationFor(), rateUsb: Number(settings.data.padRateUsb) || 0, rateBt: Number(settings.data.padRateBt) || 0 };
    appliedEmulation = args.mode;
    system.passthroughArgs = want ? args : null;
    let st = await system.request('passthrough', args, 15000).catch((err) => ({ enabled: false, error: err.message }));
    if (real) st = { ...st, realGame: real.name };
    passthrough.enabled = !!(st && st.enabled);
    passthrough.state = st;
    passthrough.starting = false;
    system.keepPadForward(passthrough.enabled || passthrough.fallback);
    send('passthrough:state', st);
    lastMute = null;
    updatePassthroughMute();
    return st;
  }
  let lastMute = null;
  function updatePassthroughMute() {
    if (!passthrough.enabled) return;
    const muted = !!(overlay.visible || (win && win.isFocused() && !win.isMinimized()));
    if (muted === lastMute) return;
    lastMute = muted;
    system.request('passthroughMute', { value: muted }).catch(() => {});
  }

  function applyHotkey() {
    globalShortcut.unregisterAll();
    if (settings.data.overlayHotkey !== false) {
      try {
        globalShortcut.register('Control+Alt+Home', onGuide);
        globalShortcut.register('Control+Alt+End', onShare);
      } catch {}
    }
  }

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  function createWindow() {
    const s = settings.data;
    win = new BrowserWindow({
      width: 1600,
      height: 900,
      minWidth: 960,
      minHeight: 540,
      show: false,
      backgroundColor: '#000000',
      title: 'PlayOSX',
      icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
      fullscreen: !!s.fullscreen && !process.argv.includes('--windowed'),
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#05070d', symbolColor: '#e8ecf5', height: 34 },
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        enableWebSQL: false,
        v8CacheOptions: 'bypassHeatCheck', // cache compiled JS right away: faster, lighter start-ups
        backgroundThrottling: true,
      },
    });
    Menu.setApplicationMenu(null);
    win.loadURL('app://ui/index.html');
    win.once('ready-to-show', () => win.show());

    const pushState = () => win && send('window:state', { fullscreen: win.isFullScreen(), focused: win.isFocused() });
    // isFullScreen() can lag the event on Windows, so re-check shortly after.
    const pushSoon = () => {
      pushState();
      setTimeout(pushState, 250);
      setTimeout(pushState, 800);
    };
    win.on('enter-full-screen', pushSoon);
    win.on('leave-full-screen', pushSoon);
    win.on('resize', pushSoon);
    win.on('blur', () => {
      setTimeout(updatePassthroughMute, 0);
      pushState();
      schedulePause();
      updateSleep();
    });
    win.on('minimize', () => { updateSleep(); if (!monitor.list().length) ensureExplorer(); });
    win.on('restore', updateSleep);
    let lastPlaytimeRefresh = 0;
    win.on('focus', () => {
      setSleep(false);
      updatePassthroughMute();
      pushState();
      schedulePause();
      if (Date.now() - lastPlaytimeRefresh > 30000) {
        lastPlaytimeRefresh = Date.now();
        library.refreshSteamPlaytime().catch(() => {});
      }
    });

    win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F11') {
        const fs = !win.isFullScreen();
        win.setFullScreen(fs);
        send('window:state', { fullscreen: fs, focused: win.isFocused() });
        e.preventDefault();
      } else if (input.key === 'F12' && process.argv.includes('--dev')) {
        win.webContents.toggleDevTools();
      } else if (input.key.toLowerCase() === 'r' && input.control && process.argv.includes('--dev')) {
        win.webContents.reload();
        e.preventDefault();
      }
    });
    // Never navigate away from the app (dev reloads stay on app://ui).
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith('app://ui/')) e.preventDefault();
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => {
      win = null;
      // The overlay window keeps the app alive otherwise.
      overlay.destroy();
      app.quit();
    });
  }

  app.whenReady().then(() => {
    const rendererDir = path.join(__dirname, '..', 'renderer');
    // app://ui/... -> renderer files, app://art/... -> cached artwork,
    // app://avatar/... -> profile pictures
    // app://captures/... -> clips and screenshots, app://capthumbs/... -> their thumbnails
    const roots = { ui: rendererDir, art: artDir, avatar: avatarDir, sounds: packs.dir };
    const rootOf = (host) => (host === 'captures' ? obs.dir : host === 'capthumbs' ? obs.thumbDir : roots[host]);
    protocol.handle('app', async (req) => {
      const u = new URL(req.url);
      const base = rootOf(u.hostname) || null;
      if (!base) return new Response('not found', { status: 404 });
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.normalize(path.join(base, rel));
      // Inside the root (also when the root is a drive like D:\).
      const inside = path.relative(base, file);
      if (!inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) return new Response('forbidden', { status: 403 });
      try {
        const headers = {
          'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'access-control-allow-origin': '*',
          'cache-control': u.hostname === 'ui' || u.hostname === 'captures' ? 'no-cache' : 'max-age=31536000',
          'accept-ranges': 'bytes',
        };
        // Byte ranges are answered here (a file:// fetch sends the whole file
        // for them): without a 206, a video counts as not seekable until it has
        // loaded completely, and jumping in a long clip snaps back to the start.
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
        if (range) {
          const { size } = await fs.promises.stat(file);
          let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2] || 0));
          let end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` } });
          headers['content-range'] = `bytes ${start}-${end}/${size}`;
          headers['content-length'] = String(end - start + 1);
          return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status: 206, headers });
        }
        const res = await net.fetch(pathToFileURL(file).toString());
        if (res.headers.get('content-length')) headers['content-length'] = res.headers.get('content-length');
        return new Response(res.body, { status: res.status, headers });
      } catch (err) {
        // Artwork that can't be read shows up here (check the console / launch with --dev).
        if (u.hostname === 'art') console.warn('[art] not served:', file, err && err.code);
        return new Response('not found', { status: 404 });
      }
    });

    createWindow();
    // PlayOSX's own default sounds: the PS5 Sounds theme and the PlayStation 5 Home Menu music.
    // They are used until the player picks others (once, on first run; retried if offline).
    (async () => {
      if (settings.data.defaultPacksDone) return;
      const sound = await packs.ensureDefault({ kind: 'Audio', name: 'PS5 Sounds', author: 'theamanproject' });
      const music = await packs.ensureDefault({ kind: 'Music', name: 'PlayStation 5 Home Menu', author: 'kobacat' });
      if (sound && !settings.data.soundPack) settings.data.soundPack = sound;
      if (music && !settings.data.musicPack) settings.data.musicPack = music;
      if (sound && music) settings.data.defaultPacksDone = true;
      settings.saveSoon();
      send('settings:changed', settings.data);
    })().catch(() => {});
    system.start();
    if (features) features.start();
    // Right away, so the controller's one restart (see the helper's Hide) falls
    // in the boot screen. Always: when it is off this also undoes hiding left
    // over from a crash.
    if (settings.data.controllerPassthrough) {
      passthrough.starting = true;
      system.keepPadForward(true);
    }
    applyPassthrough();
    discord.start();
    setTimeout(() => steamFriends.start(), 4000);
    updater.start();
    overlay.create();
    monitor.start();
    setTimeout(() => downloads.start().catch((err) => console.warn('[downloads]', err)), 2500);
    applyHotkey();
    applyCaptureButton();
    obs.onSettings().catch(() => {});
    nightSchedule.restart();
    setTimeout(applyColors, 1500);
    // A new resolution or another monitor can reset the gamma ramp: put the colors back.
    let colorTimer = null;
    const reapplyColors = () => {
      clearTimeout(colorTimer);
      colorTimer = setTimeout(applyColors, 1200);
    };
    screen.on('display-added', reapplyColors);
    screen.on('display-removed', reapplyColors);
    screen.on('display-metrics-changed', reapplyColors);

    if (settings.data.rescanOnStartup || libStore.data.games.length === 0) {
      setTimeout(() => library.scan({ silent: true }).then(() => library.refreshSteamPlaytime()).catch(console.error), 1800);
    } else {
      const pending = library.games.filter((g) => g.metaStatus === 'pending');
      if (pending.length) setTimeout(() => library.fetchMetadata(pending), 1800);
    }
  });

  app.on('will-quit', () => {
    if (features) features.stop();
    globalShortcut.unregisterAll();
  });

  let obsClosed = false;
  app.on('before-quit', () => ensureExplorer({ force: true }));
  app.on('before-quit', (e) => {
    if (pausedPid) system.request('resume', { pid: pausedPid }).catch(() => {});
    // Close OBS cleanly first (it was started by the launcher, in the tray).
    if (!obsClosed && obs.ws) {
      e.preventDefault();
      obsClosed = true;
      obs.shutdown().finally(() => app.quit());
    }
  });

  app.on('window-all-closed', () => {
    monitor.stop();
    downloads.stop();
    nightSchedule.stop();
    system.stop();
    discord.close();
    steamFriends.stop();
    updater.stop();
    settings.saveNow();
    libStore.saveNow();
    app.quit();
  });

  /* ---------------------------------------------------------------- */
  /* IPC                                                              */
  /* ---------------------------------------------------------------- */

  ipcMain.handle('state:get', () => ({
    window: win ? { fullscreen: win.isFullScreen(), focused: win.isFocused() } : null,
    settings: settings.data,
    games: library.games,
    running: monitor.list(),
    info: {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: `${process.platform} ${process.getSystemVersion()}`,
      dataDir,
      steam: library.steamInfo,
      epic: library.epicFound,
      xbox: library.xboxFound,
      ubisoft: library.ubisoftFound,
      excluded: libStore.data.excluded.length,
    },
  }));

  // Switch the active user: save the current one's data, then load the other's
  // (a user who has never been used starts with defaults and no games).
  ipcMain.handle('profile:switch', async (_e, id, ident) => {
    const list = (ident && ident.profiles) || settings.data.profiles || [];
    if (!id || id === meta.activeId) return { settings: settings.data, games: library.games };
    settings.data.profiles = list;
    const pins = settings.data.pins || {}; // passwords belong to the user list, not to one user's settings
    settings.saveNow();
    libStore.saveNow();
    themeMusic.store.saveNow();
    meta.activeId = id;
    saveMeta();
    const dir = profileDir(id);
    settings.file = path.join(dir, 'settings.json');
    settings.data = settings.load();
    Object.assign(settings.data, { profiles: list, profileId: id, adminId: meta.rootId, pins }, ident && ident.fields ? ident.fields : {});
    settings.saveNow();
    libStore.file = path.join(dir, 'library.json');
    libStore.data = libStore.load();
    library.reload();
    themeMusic.switchDir(dir);
    knownGames.clear();
    library.games.filter(themeGame).forEach((g) => knownGames.add(g.id));
    send('settings:changed', settings.data);
    send('library:changed', library.games);
    return { settings: settings.data, games: library.games };
  });
  // Drop the data of users that were deleted.
  const pruneProfiles = (list) => {
    try {
      const keep = new Set((list || []).map((p) => String(p.id).replace(/[^\w-]/g, '_')));
      const base = path.join(dataDir, 'profiles');
      for (const n of fs.existsSync(base) ? fs.readdirSync(base) : []) if (!keep.has(n) && n !== String(meta.activeId).replace(/[^\w-]/g, '_')) fs.rmSync(path.join(base, n), { recursive: true, force: true });
    } catch {}
  };

  ipcMain.handle('device:info', () => deviceInfo(dataDir));
  ipcMain.handle('gpu:getPreference', () => gpuPreference());
  ipcMain.handle('gpu:setPreference', (_e, preference) => gpuPreference(preference));

  pro.register(ipcMain, { settings, library });
  ipcMain.handle('settings:set', async (e, patch) => {
    const s = settings.data;
    const prev = { ...s };
    if (patch) delete patch.adminId;
    // Only the administrator can delete users (or hand out the admin role).
    if (patch && Array.isArray(patch.profiles) && meta.activeId !== meta.rootId && patch.profiles.length < (s.profiles || []).length) delete patch.profiles;
    Object.assign(s, patch);
    settings.saveNow();
    if (patch && Array.isArray(patch.profiles)) pruneProfiles(patch.profiles);
    // Keep the other window (launcher <-> overlay) in sync.
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.webContents !== e.sender && !w.isDestroyed()) w.webContents.send('settings:changed', s);
    }
    if (patch && 'shellMode' in patch && !!patch.shellMode !== !!prev.shellMode) {
      settings.data.shellMode = !!prev.shellMode;
      ipcMain.emit('shell:apply', null, !!patch.shellMode);
    }
    if (features) features.onSettings(patch);
    if ('overlayHotkey' in patch) applyHotkey();
    if ('pauseGames' in patch) schedulePause();
    if (Object.keys(patch).some((k) => k.startsWith('capture'))) {
      obs.onSettings().catch(() => {});
      applyCaptureButton();
    }
    if (Object.keys(patch).some((k) => k.startsWith('color'))) applyColors();
    if (Object.keys(patch).some((k) => k.startsWith('night'))) nightSchedule.restart();
    if ('controllerPassthrough' in patch) applyPassthrough();
    else if ('passthroughEmulation' in patch) applyEmulation();
    if ('padRateUsb' in patch || 'padRateBt' in patch) {
      const rate = { usb: Number(s.padRateUsb) || 0, bt: Number(s.padRateBt) || 0 };
      if (system.passthroughArgs) Object.assign(system.passthroughArgs, { rateUsb: rate.usb, rateBt: rate.bt });
      system.request('passthroughRate', rate).catch(() => {});
    }

    if ('fullscreen' in patch && win) {
      win.setFullScreen(!!patch.fullscreen);
      send('window:state', { fullscreen: !!patch.fullscreen, focused: win.isFocused() });
    }
    if ('launchAtStartup' in patch) {
      try {
        const opts = { openAtLogin: !!patch.launchAtStartup };
        // When running from source, start Electron with this app's folder.
        if (!app.isPackaged) Object.assign(opts, { path: process.execPath, args: [path.resolve(app.getAppPath())] });
        app.setLoginItemSettings(opts);
      } catch {}
    }
    const rescanKeys = ['scanSteam', 'scanEpic', 'scanXbox', 'scanUbisoft', 'steamOwned'];
    if (rescanKeys.some((k) => k in patch && patch[k] !== prev[k])) library.scan({ silent: true });
    return s;
  });

  ipcMain.handle('info:get', () => ({
    steam: library.steamInfo,
    epic: library.epicFound,
    xbox: library.xboxFound,
    ubisoft: library.ubisoftFound,
    excluded: libStore.data.excluded.length,
  }));

  ipcMain.handle('library:scan', () => library.scan({ silent: false }));
  ipcMain.handle('library:refreshAll', () => library.fetchMetadata(library.games.slice(), { force: true }));

  // Paths come from the launcher's own file browser (renderer/js/ui/filebrowser.js).
  ipcMain.handle('library:addFolder', async (_e, picked) => {
    if ((await files.kind(picked)) !== 'dir') return null;
    const folder = path.resolve(picked);
    const s = settings.data;
    if (!s.folders.includes(folder)) s.folders.push(folder);
    settings.saveNow();
    send('settings:changed', s);
    library.scan({ silent: false });
    return folder;
  });

  ipcMain.handle('library:removeFolder', async (_e, folder) => {
    const s = settings.data;
    s.folders = s.folders.filter((f) => f !== folder);
    settings.saveNow();
    send('settings:changed', s);
    await library.scan({ silent: true });
    return s.folders;
  });

  ipcMain.handle('library:import', (_e, paths) => library.importPaths(Array.isArray(paths) ? paths : []));
  ipcMain.handle('library:addFiles', (_e, paths) => library.importPaths((Array.isArray(paths) ? paths : []).filter((p) => /\.(lnk|url|exe|bat|cmd)$/i.test(String(p)))));
  ipcMain.handle('library:restoreExcluded', async () => {
    const n = library.restoreExcluded();
    await library.scan({ silent: true });
    return n;
  });
  ipcMain.handle('library:reset', () => library.reset());

  ipcMain.handle('game:update', (_e, id, patch) => {
    const r = library.update(id, patch || {});
    // Switching a running game to / from the real controller (or its kind of
    // virtual controller) applies right away.
    if (patch && 'controllerMode' in patch && settings.data.controllerPassthrough) applyPassthrough(false);
    else if (patch && 'padEmulation' in patch) applyEmulation();
    return r;
  });
  ipcMain.handle('game:remove', (_e, id) => library.remove(id));
  ipcMain.handle('game:refreshArt', (_e, id) => {
    const g = library.find(id);
    return g ? library.fetchMetadata([g], { force: true }) : null;
  });
  ipcMain.handle('game:setMatch', (_e, id, appid) => library.setMatch(id, appid));
  // Game theme music (main/thememusic.js, from YouTube with yt-dlp): what
  // plays for a game, its audio, and videos to choose from in Options › Theme Music.
  ipcMain.handle('theme:find', async (_e, id) => {
    const tr = await themeMusic.find(library.find(id)).catch(() => null);
    return tr && { key: tr.key, source: tr.source, title: tr.title, channel: tr.channel };
  });
  // A request that a newer one replaced (skipping songs, moving between games) ends as "Stopped.": not an error, no audio.
  const unlessStopped = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      if (/^Stopped\.?$/.test(String((err && err.message) || ''))) return null;
      throw err;
    }
  };
  ipcMain.handle('theme:audio', (_e, id) => unlessStopped(async () => themeMusic.audio(await themeMusic.find(library.find(id)))));
  ipcMain.handle('theme:candidates', (_e, term, isGame) => themeMusic.candidates(String(term || '').slice(0, 200), !!isGame));
  ipcMain.handle('theme:trackAudio', (_e, track) => unlessStopped(async () => {
    const c = themeChoice({ ...track, mode: 'track' });
    return c ? await themeMusic.audio(c, { preview: true }) : null;
  }));
  ipcMain.handle('theme:cacheSize', () => themeMusic.cacheSize());
  ipcMain.handle('theme:clearCache', () => themeMusic.clearCache());
  // Every installed game's theme, ahead of time (Settings › Sound › Game Theme Music).
  ipcMain.handle('theme:fetchAll', () => themeMusic.fetchAll(library.games.filter((g) => g.installed !== false && g.category !== 'media')));
  ipcMain.handle('theme:fetchState', () => ({ ...themeMusic.fetch }));
  ipcMain.handle('theme:stopFetch', () => themeMusic.stopFetch());
  ipcMain.handle('ytdlp:state', () => ytdlp.state());
  ipcMain.handle('ytdlp:install', async () => {
    await ytdlp.install();
    return ytdlp.state();
  });
  ipcMain.handle('ytdlp:remove', async () => {
    await ytdlp.remove();
    return ytdlp.state();
  });
  ipcMain.handle('sgdb:search', (_e, term) => sgdb.search(SGDB_KEY, term));
  ipcMain.handle('sgdb:list', (_e, gameId, kind, page) => sgdb.list(SGDB_KEY, gameId, kind, page));
  ipcMain.handle('sgdb:apply', (_e, id, kind, artworkId) => library.setSteamGridDBArt(id, kind, artworkId));
  const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
  ipcMain.handle('game:customArt', async (_e, id, kind, file) => {
    if (!IMAGE.test(String(file)) || (await files.kind(file)) !== 'file') return null;
    return library.setCustomArt(id, kind, file);
  });
  // Profile pictures are copied into the data folder under a new name, so
  // replacing one never shows a stale cached image.
  ipcMain.handle('profile:pickImage', async (_e, src) => {
    if (!IMAGE.test(String(src)) || (await files.kind(src)) !== 'file') return null;
    const name = `${Date.now().toString(36)}${path.extname(src).toLowerCase()}`;
    await fs.promises.mkdir(avatarDir, { recursive: true });
    await fs.promises.copyFile(src, path.join(avatarDir, name));
    return `app://avatar/${name}`;
  });
  ipcMain.handle('profile:removeImage', async (_e, url) => {
    const m = /^app:\/\/avatar\/([\w.-]+)$/.exec(String(url || ''));
    if (m) await fs.promises.rm(path.join(avatarDir, m[1]), { force: true }).catch(() => {});
  });
  // Where a game is on disk, for the file browser: its folder, with its file picked out.
  ipcMain.handle('game:location', (_e, id) => {
    const g = library.find(id);
    if (!g) return null;
    if (g.source === 'steam' && g.installDir && fs.existsSync(g.installDir)) return { dir: g.installDir, file: null };
    const target = g.path || g.exe || g.installDir;
    if (target && fs.existsSync(target)) return fs.statSync(target).isDirectory() ? { dir: target, file: null } : { dir: path.dirname(target), file: path.basename(target) };
    if (g.installDir && fs.existsSync(g.installDir)) return { dir: g.installDir, file: null };
    return null;
  });

  /* ---- The launcher's file browser (main/files.js) ---------------- */
  ipcMain.handle('fs:list', (_e, dir, opts) => files.list(dir, opts || {}));
  ipcMain.handle('fs:places', async () => files.places(await storage.drives().catch(() => [])));
  ipcMain.handle('fs:icon', (_e, file) => files.iconOf(String(file || '')));
  ipcMain.handle('fs:mkdir', (_e, dir, name) => files.mkdir(dir, name));
  ipcMain.handle('fs:kind', (_e, p) => files.kind(p));
  // The way out to Windows: the item in File Explorer, or a file opened with its program.
  ipcMain.handle('fs:showInExplorer', async (_e, p) => {
    const k = await files.kind(p);
    if (k === 'file') shell.showItemInFolder(path.resolve(p));
    else if (k === 'dir') await shell.openPath(path.resolve(p));
  });
  ipcMain.handle('fs:open', async (_e, p) => ((await files.kind(p)) === 'file' ? shell.openPath(path.resolve(p)) : 'not a file'));

  /* ---- Emulators (main/emulators.js) ------------------------------ */
  async function emulatorInfo() {
    const conf = (settings.data.emulators || {}).switch;
    if (!conf || !conf.exe) return { switch: null };
    const info = await emulators.detectSwitch(conf.exe);
    const count = library.games.filter((g) => g.source === 'emulator' && g.platform === 'switch').length;
    return { switch: { ...info, fullscreen: conf.fullscreen !== false, count, players: conf.players || [] } };
  }
  ipcMain.handle('emulators:info', () => emulatorInfo());
  // The controllers connected now, for the players' choices.
  ipcMain.handle('emulators:pads', async () => emulators.describePads(await system.request('gamepads', {}, 4000).catch(() => [])));

  /**
   * Right before a Switch game starts: the players get the controllers chosen
   * in Settings › Library › Emulators, as the emulator will see them (with
   * controller passthrough, the launcher's virtual pads). Returns a note for
   * players whose controller isn't there.
   */
  async function applySwitchPlayers(g) {
    const conf = (settings.data.emulators || {}).switch;
    const wanted = (conf && conf.players) || [];
    if (!wanted.some(Boolean)) return null;
    const info = await emulators.detectSwitch(conf.exe);
    if (!info.userDir) return null;
    // Running already: it would write its own settings back over these when it closes.
    const running = await new Promise((res) => execFile('tasklist', ['/FI', `IMAGENAME eq ${path.basename(conf.exe)}`, '/NH'], { windowsHide: true }, (err, out) => res(!err && out.toLowerCase().includes(path.basename(conf.exe).toLowerCase()))));
    if (running) return 'The emulator was already open, so its players weren’t changed.';
    const pads = emulators.describePads(await system.request('gamepads', {}, 4000).catch(() => []));
    const pass = settings.data.controllerPassthrough && passthrough.enabled && g.controllerMode !== 'real' ? { emulation: emulationFor() } : null;
    const players = {};
    const ports = new Map();
    const missing = [];
    wanted.forEach((w, n) => {
      if (!w) return;
      if (w === 'off') {
        players[n] = 'off';
        return;
      }
      const pad = pads.find((p) => p.id === w.id);
      if (!pad) return missing.push(n + 1);
      const guid = emulators.edenGuid(pad, pass);
      const port = ports.get(guid) || 0;
      ports.set(guid, port + 1);
      players[n] = { guid, port };
    });
    await emulators.writeSwitchPlayers(info.userDir, players);
    return missing.length ? 'A player’s controller isn’t connected, so the emulator’s own setting is used for that player.' : null;
  }
  // Set (or change) an emulator: checked first, then its games are scanned in.
  ipcMain.handle('emulators:set', async (_e, platform, conf) => {
    if (platform !== 'switch' || !conf) return emulatorInfo();
    const cur = (settings.data.emulators || {}).switch || {};
    const next = {
      ...cur,
      exe: conf.exe !== undefined ? String(conf.exe || '') : cur.exe,
      fullscreen: conf.fullscreen !== undefined ? !!conf.fullscreen : cur.fullscreen !== false,
    };
    // Players 1-8: null (as the emulator has it), 'off' or { id, name } of a controller.
    if (Array.isArray(conf.players)) {
      next.players = Array.from({ length: 8 }, (_, i) => {
        const p = conf.players[i];
        return p === 'off' ? 'off' : p && p.id ? { id: String(p.id), name: String(p.name || '') } : null;
      });
    }
    if (conf.players !== undefined && conf.exe === undefined && conf.fullscreen === undefined) {
      settings.data.emulators = { ...(settings.data.emulators || {}), switch: next };
      settings.saveNow();
      send('settings:changed', settings.data);
      return emulatorInfo();
    }
    if (conf.exe !== undefined) {
      const info = await emulators.detectSwitch(next.exe);
      if (!info.userDir) return { switch: { ...info, count: 0 }, rejected: true };
    }
    settings.data.emulators = { ...(settings.data.emulators || {}), switch: next };
    settings.saveNow();
    send('settings:changed', settings.data);
    await library.scan({ silent: conf.exe === undefined });
    return emulatorInfo();
  });
  ipcMain.handle('emulators:remove', async (_e, platform) => {
    const all = { ...(settings.data.emulators || {}) };
    delete all[platform];
    settings.data.emulators = all;
    settings.saveNow();
    send('settings:changed', settings.data);
    await library.scan({ silent: true });
    return emulatorInfo();
  });

  ipcMain.handle('game:launch', async (_e, id) => {
    const g = library.find(id);
    if (!g) throw new Error('Game not found');
    // Already running: bring it back instead of starting a second copy.
    if (monitor.get(id)) return continueGame(id);
    monitor.noteLaunch(id);
    try { pro.log(settings, 'launch', g.name, g.id); } catch {}
    launchingPad = { id, until: Date.now() + 90000 };
    applyEmulation();
    if (g.source === 'emulator' && g.platform === 'switch') {
      const note = await applySwitchPlayers(g).catch((err) => (console.warn('[switch players]', err), 'The emulator’s players couldn’t be set up.'));
      if (note) send('notify', { title: g.name, body: note, icon: 'gamepad', kind: 'game' });
    }
    setTimeout(applyEmulation, 91000); // it never showed up: back to the usual controller
    g.lastPlayed = Date.now();
    g.launchCount = (g.launchCount || 0) + 1;
    library.save();
    const s = settings.data;
    // Play time, "running" state and returning to the launcher are handled by
    // the game monitor, which also sees games started through Steam / Epic.
    const result = await launchGame(g, () => monitor.poke(300), { system, preferDirect: !!s.preferDirect });
    library.save(); // a direct start may have remembered the game's executable
    monitor.poke(300);
    whenGameShows(id, () => {
      send('game:started', { id });
      if (!win) return;
      if (s.onLaunch === 'minimize') win.minimize();
      else if (s.onLaunch === 'close') app.quit();
    });
    return result;
  });

  /* Minimizing (or quitting) waits until the game is actually on screen, so
     the launcher never drops to the desktop while a game is still loading.
     Multiplayer games often show a small anti-cheat window first (Easy
     Anti-Cheat, EA Javelin, BattlEye); those don't count. A game window
     counts once it covers a good part of its screen, or has been up at a
     normal size for a while. Meanwhile the launcher's Starting… screen stays
     on top, so the anti-cheat splash opens behind it and is never seen. */
  const BOOTSTRAP = /easyanticheat|^eac|eac_|_eac|start_protected_game|eaanticheat|anticheat|battleye|_be$|^be(service|_)|gamelaunchhelper|crashreport|splash/i;
  let launchWatch = 0;
  let launchWatchId = null; // the game being watched
  let launchEndedAt = 0; // it exited while still starting (a crash, or a launcher process handing over)
  let coverOn = false;
  // The launcher never sits "always on top" over a starting game any more: that
  // is what hid GTA V / Tomb Raider behind it (sound, but no picture).
  function setCover(on) {
    coverOn = false;
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);
  }
  function stopWatch() {
    padKeysOff();
    launchWatch++;
    launchWatchId = null;
    setCover(false);
  }
  ipcMain.handle('game:launchCancel', () => stopWatch());

  /* A game's start window with a Play button (Tomb Raider...): press it through
     Windows UI Automation. Does nothing if the window has no such button. */
  /* ---- Controller as the keyboard for a game's start window ----------
     Tomb Raider's start menu only reads keyboard / mouse. While it is up, the
     controller drives it: D-pad = arrow keys, confirm = Enter. */
  let padKeysHwnd = 0;
  let keyProc = null;
  const PAD_KEYS = { up: [0x26, 0x48], down: [0x28, 0x50], left: [0x25, 0x4b], right: [0x27, 0x4d], confirm: [0x0d, 0x1c] };
  function keyInjector() {
    if (keyProc && !keyProc.killed) return keyProc;
    const ps = `
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class KB{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern void keybd_event(byte vk,byte sc,int fl,int ex);}'
while(($l=[Console]::In.ReadLine()) -ne $null){
  $p=$l.Split(' ')
  if($p[0] -eq 'fg'){ [KB]::keybd_event(0x12,0,0,0); [KB]::keybd_event(0x12,0,2,0); [KB]::SetForegroundWindow([IntPtr][int64]$p[1]) | Out-Null }
  elseif($p[0] -eq 'k'){ [KB]::keybd_event([byte][int]$p[1],[byte][int]$p[2],0,0); Start-Sleep -Milliseconds 45; [KB]::keybd_event([byte][int]$p[1],[byte][int]$p[2],2,0) }
}`;
    keyProc = require('child_process').spawn('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    keyProc.on('exit', () => (keyProc = null));
    keyProc.stdin.on('error', () => {});
    return keyProc;
  }
  function padKeysOn(hwnd) {
    if (process.platform !== 'win32' || settings.data.autoClickPlay === false) return;
    padKeysHwnd = Number(hwnd);
    system.keepPadForward(true);
    try { keyInjector().stdin.write(`fg ${padKeysHwnd}\n`); } catch {}
  }
  function padKeysOff() {
    if (!padKeysHwnd) return;
    padKeysHwnd = 0;
    system.keepPadForward(!!(passthrough.enabled || passthrough.fallback));
    if (keyProc) { try { keyProc.stdin.end(); } catch {} keyProc = null; }
  }
  function pressEnter(hwnd) {
    const ps = `
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class KB{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);[DllImport("user32.dll")]public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);[DllImport("user32.dll")]public static extern void keybd_event(byte vk,byte sc,int fl,int ex);}'
$h=[IntPtr]${Number(hwnd)}
for($i=0;$i -lt 3;$i++){
  if(-not [KB]::IsWindowVisible($h)){break}
  [KB]::keybd_event(0x12,0,0,0); [KB]::keybd_event(0x12,0,2,0)
  [KB]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 400
  [KB]::PostMessage($h,0x100,[IntPtr]13,[IntPtr]0x1C0001) | Out-Null
  [KB]::PostMessage($h,0x101,[IntPtr]13,[IntPtr]0xC01C0001) | Out-Null
  [KB]::keybd_event(13,0x1C,8,0); Start-Sleep -Milliseconds 60; [KB]::keybd_event(13,0x1C,10,0)
  Start-Sleep -Milliseconds 2500
}`;
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { windowsHide: true, timeout: 20000 }, () => {});
  }
  function autoClickPlay(hwnd, tries = 4) {
    if (process.platform !== 'win32' || settings.data.autoClickPlay === false || tries <= 0) return;
    const ps = `
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$ae=[System.Windows.Automation.AutomationElement]
$root=$ae::FromHandle([IntPtr]${Number(hwnd)})
$c=New-Object System.Windows.Automation.PropertyCondition($ae::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)
foreach($b in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$c)){
  if($b.Current.IsEnabled -and $b.Current.Name -match '^\s*&?(play|play game|start|start game|launch|launch game|run|لعب|تشغيل|ابدأ)\s*$'){
    try{ $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'clicked'; break }catch{}
  }
}`;
    const enc = Buffer.from(ps, 'utf16le').toString('base64');
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], { windowsHide: true, timeout: 8000 }, (err, out) => {
      if (!err && /clicked/.test(out || '')) return;
      if (tries <= 1) return pressEnter(hwnd); // a custom-drawn menu (Tomb Raider): Play is its first, selected item
      setTimeout(() => autoClickPlay(hwnd, tries - 1), 1500); // the window may still be building its buttons
    });
  }

  function whenGameShows(id, then) {
    const token = ++launchWatch;
    launchWatchId = id;
    launchEndedAt = 0;
    const t0 = Date.now();
    const g = library.find(id) || {};
    const exe = g.exe || (g.launch && g.launch.type === 'exe' ? g.launch.target : null);
    const dirs = [g.installDir, ...(g.altDirs || [])].filter(Boolean);
    if (!dirs.length && exe) dirs.push(path.dirname(exe));
    { const bat = [g.launch && g.launch.target, g.path].find((q) => q && /\.(bat|cmd)$/i.test(q)); if (!dirs.length && bat) dirs.push(path.dirname(bat)); }
    const firstSeen = new Map(); // hwnd -> time first seen
    let bigSince = 0;
    let foreignSince = 0;
    let awaySince = 0;
    let recSince = 0;
    const askedFor = new Set(); // start windows already brought to the front
    // Games that open their own start menu (Play / Options...) before the game itself.
    const wantsStart = /tomb\s*raider|sottr|rottr/i.test(`${g.name || ''} ${exe || ''}`);
    let startHwnd = 0; // that start menu's window, while it is up
    let startDone = false;
    setCover(true);
    const finish = async (gaveUp, hwnd) => {
      if (token !== launchWatch) return;
      stopWatch();
      if (gaveUp) return send('game:started', { id, gaveUp: true });
      // The "Starting…" screen stays until the game really is in front. The launcher
      // steps aside first, then the game's window is pushed forward until it holds
      // (GTA V, Tomb Raider... often open behind with only their sound).
      if (settings.data.onLaunch === 'minimize' && win && !win.isDestroyed()) win.minimize();
      const until = Date.now() + 3000;
      for (let i = 0; i < 20 && Date.now() < until; i++) {
        const rec = monitor.get(id);
        const fg = await system.foreground().catch(() => null);
        const inFront = fg && ((hwnd && Number(fg.hwnd) === Number(hwnd)) || (rec && fg.pid && Number(fg.pid) === Number(rec.pid)));
        if (inFront) break;
        if (hwnd) await system.focusWindow(hwnd);
        else if (dirs.length) {
          // A launcher that hands over to the real game (GTAVLauncher.exe -> GTA5.exe): the biggest window in the game's folder.
          const wins = await system.request('dirWindows', { dirs }, 3000).catch(() => []);
          const top = (wins || []).filter((w) => !BOOTSTRAP.test(w.name) && w.w >= 320 && w.h >= 200).sort((a, b) => b.w * b.h - a.w * a.h)[0];
          if (top) await system.focusWindow(top.hwnd);
        }
        if (rec) await system.request('focusProc', { pid: rec.pid }, 3000).catch(() => false);
        await new Promise((r) => setTimeout(r, 400));
      }
      then();
    };
    const step = async () => {
      if (token !== launchWatch || !win || win.isDestroyed()) return;
      const now = Date.now();
      if (now - t0 > 180000) return finish(true); // never showed up: leave the launcher alone
      if (launchEndedAt && !monitor.get(id) && now - launchEndedAt > 3000) return finish(true); // it quit and didn't come back
      if (now - t0 > 90000) setCover(false);
      const focused = win.isFocused() && !win.isMinimized();
      awaySince = focused ? 0 : awaySince || now;
      const fg = await system.foreground();
      let game = null;
      if (dirs.length) {
        const wins = await system.request('dirWindows', { dirs }, 4000).catch(() => []);
        const real = (wins || []).filter((w) => !BOOTSTRAP.test(w.name) && w.w >= 320 && w.h >= 200);
        for (const w of real) if (!firstSeen.has(w.hwnd)) firstSeen.set(w.hwnd, now);
        const big = real.find((w) => w.w * w.h >= 0.35 * (w.mw || 1920) * (w.mh || 1080));
        bigSince = big ? bigSince || now : 0;
        // A game's own start window (Tomb Raider's launcher with a Play button...):
        // it needs a click, so the launcher steps off it and puts that window in front.
        if (!big) {
          const dlg = real.find((w) => now - firstSeen.get(w.hwnd) >= 2500 && !askedFor.has(w.hwnd));
          if (dlg) {
            askedFor.add(dlg.hwnd);
            setCover(false);
            system.focusWindow(dlg.hwnd);
            autoClickPlay(dlg.hwnd);
          }
        }
        // A big window that stays for a moment, or a normal-sized one that stays a while (windowed games).
        if (big && now - bigSince >= 900) game = big;
        else game = real.find((w) => now - firstSeen.get(w.hwnd) >= 8000 && w.w >= 640 && w.h >= 360) || null;
        // Something outside the game is asking for attention (a store sign-in,
        // an update, an anti-cheat error): stop covering it.
        const ours = fg && win && Number(fg.hwnd) === Number(overlay.hwndOf(win));
        // The game's own window is in front (found by its exe name or process): that is the game.
        const exeName = exe ? path.basename(exe).toLowerCase() : '';
        const rec = monitor.get(id);
        if (!game && fg && !ours && fg.w >= 640 && fg.h >= 360 && !BOOTSTRAP.test(fg.name || '')) {
          const sameExe = exeName && String(fg.name || '').toLowerCase().replace(/\.exe$/, '') === exeName.replace(/\.exe$/, '');
          const samePid = rec && fg.pid && Number(fg.pid) === Number(rec.pid);
          if (sameExe || samePid) game = fg;
        }
        const foreign = fg && !ours && !game && !BOOTSTRAP.test(fg.name || '') && fg.w >= 300 && fg.h >= 200;
        foreignSince = foreign ? foreignSince || now : 0;
        if (foreignSince && now - foreignSince > 3000) setCover(false);
      } else if (awaySince && now - awaySince > 5000) {
        // Nothing to look for (some store apps): something else has been in
        // front for a while, so that is the game.
        return finish(false);
      }
      if (token !== launchWatch) return;
      if (wantsStart && !startDone) {
        if (game && !startHwnd) {
          // First window: the start menu. Put it in front and drive it (auto Enter + controller).
          startHwnd = game.hwnd;
          askedFor.add(startHwnd);
          setCover(false);
          system.focusWindow(startHwnd);
          autoClickPlay(startHwnd);
          padKeysOn(startHwnd);
          game = null;
        } else if (startHwnd) {
          const still = dirs.length ? ((await system.request('dirWindows', { dirs }, 3000).catch(() => [])) || []).some((w) => Number(w.hwnd) === Number(startHwnd)) : false;
          if (still) game = null; // the start menu is still up
          else { startDone = true; padKeysOff(); } // Play was pressed: the game itself is next
        }
      }
      // No window found by folder, but the game's process is up: use its own window.
      const live = monitor.get(id);
      if (!game && live && !(wantsStart && !startDone)) {
        recSince = recSince || now;
        // Never hang on the Starting… screen: the game is running, so let go of it after a while.
        if (now - recSince >= 3000) return finish(false, null);
        if (now - recSince >= 3000 && (await system.request('focusProc', { pid: live.pid }, 3000).catch(() => false))) game = { hwnd: null };
      }
      if (game) return finish(false, game.hwnd);
      monitor.poke(0);
      setTimeout(step, 450);
    };
    setTimeout(step, 600);
  }

  // In-game overlay
  ipcMain.handle('overlay:closed', () => overlay.hideNow());
  ipcMain.handle('overlay:navigate', async (_e, nav) => {
    await overlay.hideNow({ restoreFocus: false });
    await showLauncher(nav);
  });
  ipcMain.handle('overlay:toggle', () => overlay.toggle({ running: monitor.list() }));
  // Sound themes
  ipcMain.handle('sounds:list', () => packs.list());
  ipcMain.handle('sounds:browse', (_e, q) => packs.browse(q || {}));
  ipcMain.handle('sounds:download', (_e, theme) => packs.download(theme));
  ipcMain.handle('sounds:remove', async (_e, id) => {
    await packs.remove(id);
    const s = settings.data;
    const patch = {};
    if (s.soundPack === id) patch.soundPack = null;
    if (s.musicPack === id) patch.musicPack = null;
    if (Object.keys(patch).length) {
      Object.assign(s, patch);
      settings.saveNow();
      send('settings:changed', s);
    }
    return true;
  });
  ipcMain.handle('sounds:installLocal', async (_e, kind, picked) => {
    const k = await files.kind(picked);
    if (kind === 'folder' ? k !== 'dir' : k !== 'file' || !/\.zip$/i.test(String(picked))) return null;
    return packs.installLocal(path.resolve(picked));
  });

  ipcMain.handle('pad:fallback', (_e, on) => {
    passthrough.fallback = !!on;
    system.keepPadForward(passthrough.enabled || passthrough.fallback);
  });
  // live: straight from the helper (its output counters), not the last state it announced.
  ipcMain.handle('passthrough:status', (_e, live) => (!live && passthrough.state) || system.request('passthroughStatus', {}, 3000).catch(() => null));

  /* Captures (OBS) */
  const captureNote = (n) => send('notify', { icon: 'camera', kind: 'capture', ...n });
  const captureLength = (s) => {
    const n = Math.round(Number(s) || 0);
    const m = Math.floor(n / 60);
    return m ? `${m} min${n % 60 ? ` ${n % 60} s` : ''}` : `${n} s`;
  };
  const captureError = (title, err) => captureNote({ title, body: String((err && err.message) || err), icon: 'info' });
  // The newest capture, for the quick menu's card (both windows: the overlay doesn't get notifications).
  let lastCapture = null;
  const captureSaved = (n) => {
    lastCapture = { ...n, time: Date.now() };
    send('capture:saved', lastCapture);
  };
  ipcMain.handle('capture:last', () => lastCapture);
  ipcMain.handle('capture:state', () => obs.publicState());
  ipcMain.handle('capture:encoders', () => obs.encoderInfo());
  ipcMain.handle('capture:list', () => obs.list());
  // One file, or several (Media Gallery › Select Media).
  ipcMain.handle('capture:delete', async (_e, file) => {
    if (!Array.isArray(file)) return obs.remove(file);
    let n = 0;
    for (const f of file) if (await obs.remove(f).catch(() => false)) n++;
    return n;
  });
  ipcMain.handle('capture:favorite', (_e, file, on) => obs.setFavorite(file, !!on));
  // The captures folder (made if needed), for the file browser.
  ipcMain.handle('capture:dir', async () => {
    await fs.promises.mkdir(obs.dir, { recursive: true }).catch(() => {});
    return obs.dir;
  });
  ipcMain.handle('capture:pickDir', async (_e, dir) => {
    if ((await files.kind(dir)) !== 'dir') return null;
    settings.data.captureDir = path.resolve(dir);
    settings.saveNow();
    send('settings:changed', settings.data);
    obs.onSettings().catch(() => {});
    return settings.data.captureDir;
  });
  ipcMain.handle('capture:open', () => onShare());
  ipcMain.handle('capture:action', async (_e, kind) => {
    const game = obs.game ? obs.game.name : '';
    try {
      if (kind === 'clip') {
        const c = await obs.saveClip();
        captureNote({ title: 'Recent gameplay saved', body: c.seconds ? `${game} · ${captureLength(c.seconds)}` : game, image: c.thumbUrl, icon: 'clipRecent' });
        captureSaved({ kind: 'clip', title: 'Recent gameplay saved', game, image: c.thumbUrl || null, url: c.url || null });
        return c;
      }
      if (kind === 'screenshot') {
        const c = await obs.screenshot();
        captureNote({ title: 'Screenshot saved', body: game, image: c.url, icon: 'camera' });
        captureSaved({ kind: 'screenshot', title: 'Screenshot saved', game, image: c.url || null, url: c.url || null });
        return c;
      }
      if (kind === 'record') {
        const r = await obs.toggleRecording();
        if (r.started) captureNote({ title: 'Recording started', body: game, icon: 'record' });
        else {
          captureNote({ title: 'Recording saved', body: r.capture && r.capture.seconds ? `${game} · ${captureLength(r.capture.seconds)}` : game, image: r.capture && r.capture.thumbUrl, icon: 'record' });
          captureSaved({ kind: 'recording', title: 'Recording saved', game, image: (r.capture && r.capture.thumbUrl) || null, url: (r.capture && r.capture.url) || null });
        }
        return r;
      }
    } catch (err) {
      captureError(kind === 'clip' ? "Couldn't save the clip" : kind === 'screenshot' ? "Couldn't take the screenshot" : "Couldn't record", err);
      throw err;
    }
    return null;
  });

  ipcMain.handle('notify:popup', (_e, n) => {
    if (!n || typeof n !== 'object') return;
    overlay.popup({ title: String(n.title || ''), body: String(n.body || ''), icon: String(n.icon || 'bell'), image: n.image ? String(n.image) : null, duration: Math.min(15000, Number(n.duration) || 5000), kind: String(n.kind || 'system') });
  });
  ipcMain.handle('games:running', () => monitor.list());
  /** Windows of the game's folder (a launcher that hands over to the real game: GTAVLauncher.exe -> GTA5.exe). */
  async function gameTopWindow(id) {
    const g = library.find(id) || {};
    const exe = g.exe || (g.launch && g.launch.type === 'exe' ? g.launch.target : null);
    const dirs = [g.installDir, ...(g.altDirs || [])].filter(Boolean);
    if (!dirs.length && exe) dirs.push(path.dirname(exe));
    { const bat = [g.launch && g.launch.target, g.path].find((q) => q && /\.(bat|cmd)$/i.test(q)); if (!dirs.length && bat) dirs.push(path.dirname(bat)); }
    if (!dirs.length) return null;
    const wins = await system.request('dirWindows', { dirs }, 3000).catch(() => []);
    return (wins || []).filter((w) => !BOOTSTRAP.test(w.name) && w.w >= 320 && w.h >= 200).sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
  }
  /** Push a running game in front, retrying until it holds (never waits longer than ms). */
  async function bringGameFront(id, ms = 3000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const rec = monitor.get(id);
      const top = await gameTopWindow(id);
      const fg = await system.foreground().catch(() => null);
      if (fg && ((top && Number(fg.hwnd) === Number(top.hwnd)) || (rec && fg.pid && Number(fg.pid) === Number(rec.pid)))) return true;
      if (top) await system.focusWindow(top.hwnd);
      if (rec) await system.request('focusProc', { pid: rec.pid }, 2000).catch(() => false);
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  async function continueGame(id) {
    const r = monitor.get(id);
    if (!r) return { continued: false };
    // Resume without hanging: the helper waits for the controller buttons to be released.
    await Promise.race([resumeNow(), new Promise((res) => setTimeout(res, 1500))]);
    if (overlay.visible) await Promise.race([overlay.hideNow({ restoreFocus: false }), new Promise((res) => setTimeout(res, 1500))]);
    if (win && !win.isDestroyed() && settings.data.onLaunch === 'minimize') win.minimize();
    const ok = await bringGameFront(id, 3000);
    return { continued: !!ok };
  }
  ipcMain.handle('game:continue', (_e, id) => continueGame(id));

  ipcMain.handle('game:close', async (e, id) => {
    const fromOverlay = !!(overlay.win && e.sender === overlay.win.webContents);
    const r = monitor.get(id);
    closingPid = r ? r.pid : null;
    try {
      if (pausedPid) await resumeNow();
      if (fromOverlay) {
        // Put the home screen up in front of the game first and close the game
        // behind it, so the desktop never shows in between.
        await showLauncher({ view: 'home' });
        await new Promise((res) => setTimeout(res, 350));
        await overlay.hideNow({ restoreFocus: false });
      }
      return await monitor.close(id);
    } finally {
      closingPid = null;
    }
  });

  // Media, volume and brightness (native helper)
  ipcMain.handle('sys:available', () => system.available());
  ipcMain.handle('sys:media', (_e, appId, knownKey) => system.media(appId, knownKey));
  ipcMain.handle('sys:mediaPlaying', () => system.request('mediaPlaying', {}, 3000).catch(() => false));
  ipcMain.handle('sys:mediaCmd', (_e, appId, action, value) => system.mediaCommand(appId, action, value));
  ipcMain.handle('sys:volume', () => system.volume());
  ipcMain.handle('sys:setVolume', (_e, v) => system.setVolume(v));
ipcMain.handle('audioSessions', async () => {
  const raw = await system.request('audio-sessions', {}, 3000);
  return enrichSessions(raw);
});
ipcMain.handle('setAppVolume', (_e, pid, value) => system.request('set-app-volume', { pid, value }, 3000));
ipcMain.handle('setAppMute', (_e, pid, value) => system.request('set-app-mute', { pid, value }, 3000));
  ipcMain.handle('sys:setMute', (_e, m) => system.setMute(m));
  ipcMain.handle('sys:audioOutputs', () => system.audioOutputs());
  ipcMain.handle('sys:setAudioOutput', (_e, id) => system.setAudioOutput(id));
  ipcMain.handle('sys:brightness', () => system.brightness());
  ipcMain.handle('sys:setBrightness', (_e, v, index) => system.setBrightness(v, index));
  ipcMain.handle('sys:nightLight', () => system.nightLight());
  ipcMain.handle('sys:setNightLight', (_e, on) => system.setNightLight(on));
  ipcMain.handle('sys:hdr', () => system.hdr());
  ipcMain.handle('sys:setHdr', (_e, on, index) => system.setHdr(on, Number.isInteger(index) ? index : -1));
  // Display (native helper): resolution, refresh rate, main display, scale, colors, VRR
  ipcMain.handle('display:info', () => system.displayInfo());
  ipcMain.handle('display:setMode', (_e, device, w, h, hz) => system.setDisplayMode(String(device || ''), Number(w) || 0, Number(h) || 0, Number(hz) || 0));
  ipcMain.handle('display:setPrimary', (_e, device) => system.setPrimaryDisplay(String(device || '')));
  ipcMain.handle('display:setTopology', (_e, value) => system.setTopology(Number(value)));
  ipcMain.handle('display:setDpi', (_e, device, value) => system.setDpiScale(String(device || ''), Number(value)));
  ipcMain.handle('display:vrr', () => system.vrr());
  ipcMain.handle('display:setVrr', (_e, on) => system.setVrr(on));
  ipcMain.handle('bt:state', () => system.bluetooth());
  ipcMain.handle('bt:radio', (_e, on) => system.bluetoothRadio(on));
  ipcMain.handle('bt:connect', (_e, address, connect) => system.bluetoothConnect(address, connect));
  ipcMain.handle('bt:pair', (_e, id) => system.bluetoothPair(id));
  ipcMain.handle('bt:unpair', (_e, id) => system.bluetoothUnpair(id));
  ipcMain.handle('bt:scan', (_e, action) => system.bluetoothScan(action));

  // Discord party (voice) controls
  ipcMain.handle('update:state', () => updater.publicState());
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:download', () => updater.download());
  ipcMain.handle('update:install', () => updater.install(() => app.quit()));
  ipcMain.handle('steamfriends:get', (_e, opts) => steamFriends.get(opts || {}));
  ipcMain.handle('steamfriends:setKey', (_e, data) => steamFriends.setKey(data || {}));
  ipcMain.handle('steamfriends:forget', () => steamFriends.forget());
  ipcMain.handle('steamfriends:open', (_e, kind, id) => steamFriends.open(kind, id));
  ipcMain.handle('discord:state', () => discord.publicState());
  ipcMain.handle('discord:setup', (_e, data) => discord.setup(data || {}));
  ipcMain.handle('discord:connect', () => discord.connect({ interactive: true }));
  ipcMain.handle('discord:disconnect', () => discord.disconnect());
  ipcMain.handle('discord:forget', () => discord.forget());
  ipcMain.handle('discord:cmd', (_e, name, value, extra) => discord.command(name, value, extra));
  ipcMain.handle('discord:guilds', (_e, opts) => discord.guilds(opts || {}));
  ipcMain.handle('discord:voiceChannels', (_e, guildId) => discord.voiceChannels(guildId));
  ipcMain.handle('discord:directChats', () => discord.directChats());
  ipcMain.handle('discord:openChat', (_e, id) => discord.openChat(id));
  ipcMain.handle('discord:closeChat', () => discord.closeChat());
  ipcMain.handle('discord:openInDiscord', (_e, id, guild) => discord.openInDiscord(id, guild));

  ipcMain.handle('downloads:state', () => downloads.publicState());
  // Update a Steam game now (by library id or Steam app id).
  ipcMain.handle('downloads:update', (_e, id) => {
    const g = library.find(String(id || ''));
    const appid = g ? g.steamAppId : id;
    if (!appid) throw new Error('This game has no Steam app id.');
    return downloads.update(appid);
  });
  // Install a Steam game the account owns (Steam's install dialog opens).
  // library: the Steam library folder picked in the launcher (no Steam dialog); without it Steam's own dialog opens.
  ipcMain.handle('downloads:install', (_e, id, library) => {
    const g = library_(id);
    return library ? downloads.installTo(g.steamAppId, library, { name: g.name, gameId: g.id }) : downloads.install(g.steamAppId, { name: g.name, gameId: g.id });
  });
  ipcMain.handle('downloads:installInfo', (_e, id) => downloads.installInfo(library_(id).steamAppId));
  function library_(id) {
    const g = library.find(String(id || ''));
    if (!g || !g.steamAppId) throw new Error('This game has no Steam app id.');
    return g;
  }
  ipcMain.handle('downloads:openSteam', () => shell.openExternal('steam://open/downloads'));

  /* Settings › Storage › Games and Apps: drives, installed games, deleting them. */
  const storage = new Storage({ library, system, steam: downloads, monitor, settings, dataDir, send });
  ipcMain.handle('storage:info', () => storage.info());
  ipcMain.handle('storage:delete', (_e, ids) => storage.remove(Array.isArray(ids) ? ids : [ids]));

  ipcMain.handle('steam:search', (_e, term) => searchSteam(String(term || '')).catch(() => []));

  ipcMain.handle('cache:size', () => library.cacheSize());
  ipcMain.handle('app:dataDir', () => dataDir);
ipcMain.handle('app:openExternal', (_e, url) => {
  if (/^(steam:\/\/|discord:\/\/|https:\/\/(store\.steampowered\.com|www\.steamgriddb\.com|discord\.com\/developers|steamcommunity\.com\/dev\/apikey|github\.com\/nefarius\/HidHide|github\.com\/Alia5\/VIIPER|obsproject\.com|t\.me|telegram\.me|telegram\.dog)\/?)/.test(String(url))) {
    return shell.openExternal(url);
  }
  return null;
});

  ipcMain.handle('window:action', (_e, action) => {
    if (!win) return;
    if (action === 'minimize') { ensureExplorer(); win.minimize(); }
    else if (action === 'close') { ensureExplorer({ force: true }); app.quit(); }
    else if (action === 'toggleFullscreen') {
      const fs = !win.isFullScreen();
      win.setFullScreen(fs);
      send('window:state', { fullscreen: fs, focused: win.isFocused() });
      return { fullscreen: fs };
    }
    return { fullscreen: win.isFullScreen() };
  });

  ipcMain.handle('power:action', (_e, action) => {
    const run = (cmd, args) => execFile(cmd, args, { windowsHide: true }, () => {});
    if (action === 'shutdown') run('shutdown', ['/s', '/t', '0']);
    else if (action === 'restart') run('shutdown', ['/r', '/t', '0']);
    else if (action === 'sleep') {
      run('powershell', [
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState("Suspend", $false, $false)',
      ]);
    }
  });
}

