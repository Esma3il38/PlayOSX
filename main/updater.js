// Launcher updates from the GitHub Releases page (Settings › System › Software
// Update). The newest published release (pre-releases too, no drafts) is
// compared with this version; its "…Setup….exe" is downloaded, checked
// against the SHA-512 that electron-builder writes into latest.yml (uploaded
// with the release), and run silently once the launcher has closed:
//   Setup.exe /S --updated --force-run
// /S installs without pages over the existing installation (same folder,
// settings and library kept), --updated skips the "Extras" page
// (build/installer.nsh) and --force-run starts the launcher again.
// A full-screen "Installing the update…" page (main/update-page.js) runs the
// setup while the launcher is closed, then shows "Restarting…" and starts the
// launcher again; it logs to update.log and, if the silent setup fails, opens
// the normal setup window instead.
// A copy unpacked from the zip has no installer to run: it only learns of the
// update and opens the download page.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { app, shell } = require('electron');
const { buildPage } = require('./update-page');

const REPO = 'Esma3il38/PlayOSX';
const RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=10`;
const PAGE = `https://github.com/${REPO}/releases/latest`;
const AUTO_EVERY = 6 * 60 * 60 * 1000;

/** "v1.2.0-beta" -> [1, 2, 0, "beta"]; null when it isn't a version. */
function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(String(v || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0), m[4] || ''] : null;
}

/** Semver order: 1.1.0 > 1.1.0-beta > 1.0.0. */
function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  if (x[3] === y[3]) return 0;
  if (!x[3]) return 1;
  if (!y[3]) return -1;
  return x[3].localeCompare(y[3], undefined, { numeric: true });
}

/** Markdown of the release notes as plain lines for the UI. */
function plainNotes(md) {
  return String(md || '')
    .replace(/\r/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim();
}

class Updater {
  constructor({ send, settings }) {
    this.send = send;
    this.settings = settings;
    this.timer = null;
    this.busy = null;
    this.state = {
      current: app.getVersion(),
      installable: this.installable(),
      status: 'idle', // idle | checking | none | available | downloading | ready | installing | error
      latest: null, // { version, tag, name, notes, url, size, published, asset }
      progress: 0,
      checked: 0,
      error: null,
    };
    this.afterRestart();
  }

  get updateDir() {
    return path.join(app.getPath('temp'), 'PlayOSX-update');
  }

  /** After an install attempt: tidy the download when it worked, report it when it didn't. */
  afterRestart() {
    try {
      const dir = this.updateDir;
      const res = path.join(dir, 'result.txt');
      if (!fs.existsSync(res)) return;
      const r = fs.readFileSync(res, 'utf8').trim();
      if (r === 'ok') {
        for (const f of fs.readdirSync(dir)) if (/\.exe$/i.test(f)) fs.rmSync(path.join(dir, f), { force: true });
        fs.rmSync(res, { force: true });
      } else if (r.startsWith('failed')) {
        fs.rmSync(res, { force: true });
        this.state.status = 'error';
        this.state.error = 'The update couldn’t be installed silently, so the setup window was opened. Finish it there, or try again.';
      }
    } catch {}
  }

  /** Installed with the setup (it left its uninstaller next to the launcher), not run from the zip. */
  installable() {
    if (!app.isPackaged) return false;
    const dir = path.dirname(process.execPath);
    try {
      return fs.readdirSync(dir).some((f) => /^Uninstall .*\.exe$/i.test(f));
    } catch {
      return false;
    }
  }

  publicState() {
    return { ...this.state };
  }

  set(patch) {
    Object.assign(this.state, patch);
    this.send('update:state', this.publicState());
  }

  /** Check at startup and every few hours when Settings › System › Check Automatically is on. */
  start() {
    clearTimeout(this.timer);
    const run = async () => {
      if (this.settings.data.autoUpdateCheck !== false && this.state.status !== 'downloading' && this.state.status !== 'ready') {
        const before = this.state.latest && this.state.latest.version;
        await this.check().catch(() => {});
        const l = this.state.latest;
        if (this.state.status === 'available' && l && l.version !== before) {
          this.send('notify', { title: 'Update available', body: `PlayOSX ${l.version}`, icon: 'download', kind: 'system' });
        }
      }
      this.timer = setTimeout(run, AUTO_EVERY);
    };
    this.timer = setTimeout(run, 15000);
  }

  stop() {
    clearTimeout(this.timer);
  }

  async fetchJson(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'PlayOSX', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
    if (res.status === 403 || res.status === 429) throw new Error('GitHub asked to wait a moment. Try again later.');
    if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
    return res.json();
  }

  /** Is there a newer release than this version? */
  check() {
    if (this.busy) return this.busy;
    this.busy = (async () => {
      this.set({ status: 'checking', error: null });
      try {
        const list = await this.fetchJson(RELEASES);
        const releases = (Array.isArray(list) ? list : []).filter((r) => !r.draft && parseVersion(r.tag_name));
        releases.sort((a, b) => compareVersions(b.tag_name, a.tag_name));
        const r = releases[0];
        if (!r || compareVersions(r.tag_name, this.state.current) <= 0) {
          this.set({ status: 'none', latest: null, checked: Date.now() });
          return this.publicState();
        }
        const asset = (r.assets || []).find((a) => /setup.*\.exe$/i.test(a.name));
        const yml = (r.assets || []).find((a) => /^latest\.yml$/i.test(a.name));
        this.set({
          status: 'available',
          checked: Date.now(),
          latest: {
            version: String(r.tag_name).replace(/^v/, ''),
            tag: r.tag_name,
            name: r.name || r.tag_name,
            notes: plainNotes(r.body),
            url: r.html_url || PAGE,
            published: r.published_at,
            size: asset ? asset.size : 0,
            asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size } : null,
            yml: yml ? yml.browser_download_url : null,
          },
        });
      } catch (err) {
        const msg = err && err.name === 'TimeoutError' ? 'GitHub can’t be reached. Check the internet connection.' : String((err && err.message) || err);
        this.set({ status: 'error', error: /fetch failed/i.test(msg) ? 'GitHub can’t be reached. Check the internet connection.' : msg });
      } finally {
        this.busy = null;
      }
      return this.publicState();
    })();
    return this.busy;
  }

  /** The SHA-512 (base64) latest.yml gives for the setup, if the release has it. */
  async expectedHash(l) {
    if (!l.yml) return null;
    try {
      const res = await fetch(l.yml, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      const text = await res.text();
      const name = l.asset.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // The entry under files: whose url is this setup, else the top-level sha512.
      const entry = new RegExp(`url:\\s*${name}\\s*\\n\\s*sha512:\\s*(\\S+)`).exec(text);
      const top = /^sha512:\s*(\S+)/m.exec(text);
      return (entry && entry[1]) || (top && top[1]) || null;
    } catch {
      return null;
    }
  }

  /** Download the setup (with progress) and check it. */
  async download() {
    const l = this.state.latest;
    if (!l) throw new Error('Check for updates first.');
    if (!this.state.installable || !l.asset) {
      shell.openExternal(l.url || PAGE);
      return this.publicState();
    }
    if (this.state.status === 'downloading' || this.state.status === 'ready') return this.publicState();
    const dir = path.join(app.getPath('temp'), 'PlayOSX-update');
    const file = path.join(dir, l.asset.name);
    this.set({ status: 'downloading', progress: 0, error: null });
    try {
      fs.mkdirSync(dir, { recursive: true });
      const res = await fetch(l.asset.url);
      if (!res.ok || !res.body) throw new Error(`The download failed (${res.status}).`);
      const total = Number(res.headers.get('content-length')) || l.asset.size || 0;
      const hash = crypto.createHash('sha512');
      const out = fs.createWriteStream(file);
      let done = 0;
      let shown = 0;
      for await (const chunk of res.body) {
        hash.update(chunk);
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        done += chunk.length;
        const p = total ? done / total : 0;
        if (p - shown >= 0.01) {
          shown = p;
          this.set({ progress: p });
        }
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
      const want = await this.expectedHash(l);
      if (want && hash.digest('base64') !== want) {
        fs.rmSync(file, { force: true });
        throw new Error('The download doesn’t match the release (its checksum differs). Try again.');
      }
      this.file = file;
      this.set({ status: 'ready', progress: 1, verified: !!want });
    } catch (err) {
      this.set({ status: 'error', error: String((err && err.message) || err) });
    }
    return this.publicState();
  }

  /**
   * Close the launcher and install. A full-screen page ("Installing the
   * update…", main/update-page.js, run by Windows' own mshta.exe) opens first
   * and does the work while the launcher is closed: it waits for the launcher
   * to exit, ends anything left running from the install folder, runs the setup
   * silently, then shows "Restarting…" and starts the launcher again. It logs to
   * update.log; if the silent setup fails it opens the normal setup window.
   */
  install(quit) {
    if (this.state.status !== 'ready' || !this.file || !fs.existsSync(this.file)) throw new Error('Download the update first.');
    const dir = this.updateDir;
    const exe = process.execPath;
    const lang = String(this.settings.data.language || 'auto');
    const page = path.join(dir, 'install-update.hta');
    try {
      fs.mkdirSync(dir, { recursive: true });
      try { fs.copyFileSync(path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'), path.join(dir, 'icon.png')); } catch {}
      fs.rmSync(path.join(dir, 'result.txt'), { force: true });
      const html = buildPage({
        lang: lang === 'auto' ? String(app.getLocale() || 'en').slice(0, 2).toLowerCase() : lang,
        pid: process.pid,
        setup: this.file,
        exe,
        exeName: path.basename(exe),
        dir: path.dirname(exe),
        log: path.join(dir, 'update.log'),
        result: path.join(dir, 'result.txt'),
        version: (this.state.latest && this.state.latest.version) || '',
      });
      fs.writeFileSync(page, '\ufeff' + html, 'utf8');
    } catch (err) {
      throw new Error(`Couldn’t prepare the update (${(err && err.message) || err}).`);
    }
    const root = process.env.SystemRoot || 'C:\\Windows';
    const detached = { detached: true, stdio: 'ignore' };
    // Without the page (no mshta.exe), run the setup straight away, with no screen.
    const direct = () => {
      try { spawn(this.file, ['/S', '--updated', '--force-run'], detached).unref(); } catch {}
    };
    try {
      const child = spawn(path.join(root, 'System32', 'mshta.exe'), [page], detached);
      child.on('error', direct);
      child.unref();
    } catch {
      direct();
    }
    this.set({ status: 'installing' });
    try { this.settings.saveNow && this.settings.saveNow(); } catch {}
    // The page is already on screen when the launcher goes away.
    setTimeout(quit, 900);
    // Something (OBS shutting down, a stuck window) can hold the quit back: don't let it block the update.
    setTimeout(() => { try { app.exit(0); } catch {} }, 9000);
    return true;
  }
}

module.exports = { Updater, compareVersions, parseVersion };
