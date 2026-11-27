// Detects which library game is running, however it was started (launcher,
// Steam, Epic, a desktop shortcut…). Works from the system process list:
// process names first, then the full image path of the few candidates, both
// read through the helper without opening a handle to any game process.
//
// Several library entries can share one executable (e.g. Switch games that all
// start the same emulator). A process is only ever counted for ONE game,
// chosen by: the game the launcher just started, then the window title (the
// emulator shows the game name), then the most recently played candidate.

const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { EXE_SKIP } = require('./scanner');

const TICK_MS = 3000;
// Matched against folder names and program files only (.exe/.dll/.sys), never
// art or data files — a skin called "Vanguard" is not Riot Vanguard.
const ANTI_CHEAT = /easy.?anti.?cheat|battl.?eye|^beservice|anti.?cheat|xigncode|nprotect|gameguard|punkbuster|pnkbstr|^equ8|faceit|mhyprot|acebase|sguard|randgrid|ricochet|^vgk|riot.?vanguard/i;
const PROGRAM_FILE = /\.(exe|dll|sys)$/i;

function antiCheatName(e) {
  return (e.isDirectory() || PROGRAM_FILE.test(e.name)) && ANTI_CHEAT.test(e.name);
}
const SKIP_DIRS = /^(redist|_commonredist|directx|__installer|support|\.git)$/i;

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** How well a window title matches a game name (0..1). */
function titleScore(title, name) {
  const t = ` ${normalize(title)} `;
  const words = normalize(name).split(' ').filter((w) => w.length > 1 || /\d/.test(w));
  if (!words.length) return 0;
  if (t.includes(` ${words.join(' ')} `)) return 1;
  const hit = words.filter((w) => t.includes(` ${w} `)).length;
  return hit / words.length;
}

/* ---- Games started through a .bat / .cmd file ----------------------------
   A start file has no exe and often no install folder, so the monitor had
   nothing to look for: the game never showed as running and no play time was
   counted. Here the file is read for the programs it starts, and its folder
   is used as the game's folder. */
const SYS_EXE = /^(cmd|powershell|pwsh|conhost|taskkill|timeout|reg|regedit|explorer|start|wscript|cscript|mshta|rundll32|msiexec|sc|net|netsh|schtasks|tasklist|where|findstr|find|ping|curl|wget|attrib|xcopy|robocopy|copy|move|del|setx|wmic|choice|more|type|echo|call)$/i;
const GENERIC_DIR = /[\\/](desktop|downloads|documents)([\\/]|$)/i;

function batOf(g) {
  const l = g.launch || {};
  return [l.target, g.path].find((p) => p && /\.(bat|cmd)$/i.test(p)) || null;
}

function genericDir(d) {
  const n = path.normalize(d || '').toLowerCase().replace(/[\\/]+$/, '');
  return !n || n === os.homedir().toLowerCase() || GENERIC_DIR.test(n + path.sep) || /^[a-z]:$/.test(n);
}

function expandVars(p, base) {
  return p
    .replace(/%~dp0/gi, base + path.sep)
    .replace(/%~dpnx0|%~f0/gi, base)
    .replace(/%cd%/gi, base)
    .replace(/%([^%]+)%/g, (m, v) => process.env[v] || process.env[v.toUpperCase()] || m);
}

/** Exe names and folders a .bat/.cmd start file refers to. */
async function parseBat(file) {
  const names = new Set();
  const dirs = [];
  let text = '';
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch {
    return { names, dirs, driver: false };
  }
  const base = path.dirname(file);
  const win = String(process.env.SystemRoot || 'C:\\Windows').toLowerCase();
  const addDir = (d) => {
    if (!d || d.includes('%')) return;
    const full = path.resolve(base, d.replace(/^["'\s]+|["'\s]+$/g, ''));
    if (full.toLowerCase().startsWith(win) || genericDir(full)) return;
    if (!dirs.includes(full)) dirs.push(full);
  };
  // cd / pushd to the game folder
  const cdRe = /^\s*@?(?:cd|chdir|pushd)\s+(?:\/d\s+)?("[^"\r\n]+"|[^\r\n&|]+)/gim;
  let m;
  while ((m = cdRe.exec(text))) addDir(expandVars(m[1].trim(), base));
  // every .exe mentioned
  const exeRe = /"([^"\r\n]+?\.exe)"|([^\s"&|<>=,;()]+?\.exe)/gi;
  while ((m = exeRe.exec(text))) {
    const raw = expandVars((m[1] || m[2]).trim(), base);
    if (raw.includes('%')) continue;
    const name = path.basename(raw, path.extname(raw)).toLowerCase();
    if (!name || SYS_EXE.test(name) || EXE_SKIP.test(name)) continue;
    const full = path.resolve(base, raw);
    if (full.toLowerCase().startsWith(win)) continue;
    names.add(name);
    if (/[\\/]/.test(raw)) addDir(path.dirname(full));
  }
  // A kernel driver (anti-cheat shim) is installed by the file: never pause such a game.
  return { names, dirs, driver: /type=\s*kernel|\.sys\b/i.test(text) };
}

class GameMonitor {
  /**
   * @param {object} o
   * @param {import('./library').Library} o.library
   * @param {import('./system').SystemBridge} o.system
   * @param {(running: {id:string, pid:number, since:number}[]) => void} o.onChange
   * @param {(gameId: string, minutes: number) => void} o.onEnded
   */
  constructor({ library, system, onChange, onEnded }) {
    this.library = library;
    this.system = system;
    this.onChange = onChange;
    this.onEnded = onEnded;
    this.index = new Map(); // gameId -> { names:Set, dir, exe, sig, antiCheat }
    this.pidPaths = new Map(); // pid -> lower-case image path ('' if unknown)
    this.pidSeen = new Map(); // pid -> first time we saw it as a game candidate
    this.running = new Map(); // gameId -> { pid, since }
    this.launches = new Map(); // gameId -> time the launcher started it
    this.timer = null;
    this.ticking = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    setTimeout(() => this.tick(), 1500);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  list() {
    return [...this.running.entries()].map(([id, r]) => ({ id, pid: r.pid, since: r.since }));
  }

  get(id) {
    return this.running.get(id) || null;
  }

  /** The launcher is starting this game: it wins any "which game is it?" question. */
  noteLaunch(id) {
    this.launches.set(id, Date.now());
  }

  hasAntiCheat(id) {
    const e = this.index.get(id);
    return !e || e.antiCheat !== false;
  }

  /** Make the next tick come sooner (e.g. right after a launch). */
  poke(delay = 800) {
    setTimeout(() => this.tick(), delay);
  }

  /* -------------------------------------------------------------- */

  /** Exe names in a game folder (files before sub-folders) + anti-cheat check. */
  async scanDir(dir) {
    const names = new Set();
    let antiCheat = false;
    let budget = 6000;
    const queue = [{ d: dir, depth: 0 }];
    while (queue.length && budget > 0) {
      const { d, depth } = queue.shift();
      let entries;
      try {
        entries = await fsp.readdir(d, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (--budget < 0) break;
        if (antiCheatName(e)) antiCheat = true;
        if (e.isFile() && /\.exe$/i.test(e.name) && !EXE_SKIP.test(e.name)) names.add(e.name.slice(0, -4).toLowerCase());
        else if (e.isDirectory() && depth < 4 && !SKIP_DIRS.test(e.name)) queue.push({ d: path.join(d, e.name), depth: depth + 1 });
      }
    }
    // Anti-cheat often lives next to the binaries folder: also peek at parents.
    let p = dir;
    for (let i = 0; i < 3 && !antiCheat; i++) {
      const up = path.dirname(p);
      if (up === p) break;
      p = up;
      try {
        const entries = await fsp.readdir(p, { withFileTypes: true });
        if (entries.some(antiCheatName)) antiCheat = true;
      } catch {}
    }
    return { names, antiCheat };
  }

  async indexFor(g) {
    const exe = g.exe || (g.launch && g.launch.type === 'exe' ? g.launch.target : null);
    const bat = batOf(g);
    let batStamp = '';
    if (bat) {
      try {
        batStamp = String((await fsp.stat(bat)).mtimeMs);
      } catch {}
    }
    // Shortcut games: the exe's folder is the install folder (catches games that
    // start through a small launcher exe in the same folder). A .bat start file
    // uses its own folder, unless that is the Desktop / Downloads / a drive root.
    const batDir = bat && !genericDir(path.dirname(bat)) ? path.dirname(bat) : null;
    const dir = g.installDir || (exe ? path.dirname(exe) : null) || batDir;
    const altBase = (g.altDirs || []).slice();
    const sig = `${exe}|${dir}|${altBase.join('|')}|${bat || ''}|${batStamp}`;
    const cached = this.index.get(g.id);
    if (cached && cached.sig === sig) return cached;
    const batInfo = bat ? await parseBat(bat) : { names: new Set(), dirs: [], driver: false };
    const alt = [...altBase, ...batInfo.dirs].map((d) => path.normalize(d).toLowerCase() + path.sep);
    const { names, antiCheat: ac0 } = dir ? await this.scanDir(dir) : { names: new Set(), antiCheat: true };
    let antiCheat = ac0;
    for (const d of batInfo.dirs.slice(0, 3)) {
      try {
        const r = await this.scanDir(d);
        for (const n of r.names) names.add(n);
        if (dir) antiCheat = antiCheat || r.antiCheat;
        else antiCheat = r.antiCheat;
      } catch {}
    }
    for (const n of batInfo.names) names.add(n);
    if (batInfo.driver) antiCheat = true;
    if (exe && /\.exe$/i.test(exe)) names.add(path.basename(exe, path.extname(exe)).toLowerCase());
    const entry = {
      names,
      dir: dir ? path.normalize(dir).toLowerCase() + path.sep : null,
      alt,
      exe: exe ? path.normalize(exe).toLowerCase() : null,
      sig,
      antiCheat,
      loose: batInfo.names, // exe names the .bat starts itself (used when Windows hides the image path of an elevated game)
    };
    this.index.set(g.id, entry);
    return entry;
  }

  matches(entry, imagePath) {
    if (!imagePath) return false;
    if (entry.exe && imagePath === entry.exe) return true;
    if (entry.dir && imagePath.startsWith(entry.dir)) return true;
    return (entry.alt || []).some((d) => imagePath.startsWith(d));
  }

  async pathOf(pid) {
    if (!this.pidPaths.has(pid)) {
      let p = '';
      try {
        p = String((await this.system.request('procPath', { pid }, 4000)) || '');
      } catch {}
      this.pidPaths.set(pid, p ? path.normalize(p).toLowerCase() : '');
    }
    return this.pidPaths.get(pid);
  }

  /** Pick one game for a process that several library entries could be. */
  async resolve(pid, ids) {
    if (ids.length === 1) return ids[0];
    const firstSeen = this.pidSeen.get(pid) || Date.now();
    // 1. Started from the launcher shortly before the process appeared.
    let best = null;
    for (const id of ids) {
      const t = this.launches.get(id);
      if (t && t >= firstSeen - 120000 && (!best || t > this.launches.get(best))) best = id;
    }
    if (best) return best;
    // 2. The window title names the game (emulators do this).
    let titles = [];
    try {
      titles = (await this.system.request('windowTitles', { pid }, 3000)) || [];
    } catch {}
    let top = null;
    let topScore = 0;
    for (const id of ids) {
      const g = this.library.find(id);
      if (!g) continue;
      const score = Math.max(0, ...titles.map((t) => titleScore(t, g.name)));
      if (score > topScore) {
        topScore = score;
        top = id;
      }
    }
    if (top && topScore >= 0.6) return top;
    // 3. Still ambiguous after a while: the most recently played candidate.
    if (Date.now() - firstSeen > 20000) {
      const games = ids.map((id) => this.library.find(id)).filter(Boolean);
      games.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
      return games[0] ? games[0].id : null;
    }
    return null;
  }

  async tick() {
    if (this.ticking || !this.system.available()) return;
    this.ticking = true;
    try {
      const procs = await this.system.request('procs', {}, 8000);
      const byName = new Map();
      for (const p of procs) {
        const n = String(p.name).toLowerCase();
        if (!byName.has(n)) byName.set(n, []);
        byName.get(n).push(p.pid);
      }
      const alive = new Set(procs.map((p) => p.pid));
      this.procNames = byName; // for others asking whether a program runs (Steam downloads)
      for (const pid of this.pidPaths.keys()) if (!alive.has(pid)) this.pidPaths.delete(pid);
      for (const pid of this.pidSeen.keys()) if (!alive.has(pid)) this.pidSeen.delete(pid);

      const found = new Map(); // gameId -> { pid, since }
      const taken = new Set(); // pids already assigned
      // Keep following games we already know (one process = one game).
      for (const [id, r] of this.running) {
        if (alive.has(r.pid) && this.library.find(id)) {
          found.set(id, r);
          taken.add(r.pid);
        }
      }

      // Collect candidate games for each new process.
      const candidates = new Map(); // pid -> [gameId]
      for (const g of this.library.games) {
        if (g.category === 'media' || found.has(g.id)) continue;
        const entry = await this.indexFor(g);
        if (!entry.names.size) continue;
        for (const name of entry.names) {
          for (const pid of byName.get(name) || []) {
            if (taken.has(pid)) continue;
            const imgPath = await this.pathOf(pid);
            if (!this.matches(entry, imgPath) && !(imgPath === '' && entry.loose && entry.loose.has(name))) continue;
            if (!this.pidSeen.has(pid)) this.pidSeen.set(pid, Date.now());
            if (!candidates.has(pid)) candidates.set(pid, []);
            if (!candidates.get(pid).includes(g.id)) candidates.get(pid).push(g.id);
          }
        }
      }
      for (const [pid, ids] of candidates) {
        const open = ids.filter((id) => !found.has(id));
        if (!open.length) continue;
        const id = await this.resolve(pid, open);
        if (!id) continue;
        found.set(id, { pid, since: this.pidSeen.get(pid) || Date.now() });
        taken.add(pid);
        this.launches.delete(id);
      }

      let changed = false;
      for (const [id, r] of this.running) {
        if (!found.has(id)) {
          changed = true;
          const minutes = Math.round((Date.now() - r.since) / 60000);
          this.onEnded(id, minutes);
        }
      }
      for (const id of found.keys()) if (!this.running.has(id)) changed = true;
      this.running = found;
      if (changed) this.onChange(this.list());
    } catch {
      // Helper not ready yet — try again next tick.
    } finally {
      this.ticking = false;
    }
  }

  /** Close a running game: ask its windows to close, then end the process. */
  async close(id) {
    const r = this.running.get(id);
    if (!r) return false;
    // A paused game can't react to the close request.
    await this.system.request('resume', { pid: r.pid }).catch(() => {});
    try {
      await this.system.request('closeWindows', { pid: r.pid });
    } catch {}
    const gone = async () => {
      try {
        const procs = await this.system.request('procs', {}, 8000);
        return !procs.some((p) => p.pid === r.pid);
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 10; i++) {
      await new Promise((res) => setTimeout(res, 500));
      if (await gone()) break;
    }
    if (!(await gone())) {
      await new Promise((res) => {
        require('child_process').execFile('taskkill', ['/PID', String(r.pid), '/T', '/F'], { windowsHide: true }, () => res());
      });
    }
    await this.tick();
    return true;
  }
}

module.exports = { GameMonitor, titleScore, batOf };
