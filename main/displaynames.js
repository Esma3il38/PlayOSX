// main/displaynames.js
const { execFile } = require('child_process');
const { promisify } = require('util');
const { app } = require('electron');

const execFileAsync = promisify(execFile);
const cache = new Map();          // process name → display name

function stripExe(s) {
  return String(s || '').replace(/\.exe$/i, '');
}
function procKey(s) {
  return stripExe(s.process || s.name || '').toLowerCase();
}
function capitalize(s) {
  s = String(s || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** عناوين مش مفيدة من tasklist */
function normalizeTitle(t) {
  const s = String(t || '').trim();
  if (!s) return '';
  if (s === 'N/A' || s === 'n/a') return '';
  if (/^no title$/i.test(s)) return '';
  if (/^not responding$/i.test(s)) return '';
  return s;
}

/**
 * استدعاء tasklist واحد، ونرجع:
 *  byPid: Map<pid, { imageName, windowTitle }>
 *  bestByImage: Map<imageKey, bestWindowTitle>
 *   (نجمع أفضل window title لكل image، عشان chrome.exe لو فيه عملية
 *    واحدة عندها عنوان مفيد، كل عمليات chrome.exe تستخدمه)
 */
async function getAllProcessInfo() {
  try {
    const { stdout } = await execFileAsync(
      'tasklist',
      ['/v', '/fo', 'csv', '/nh'],
      { windowsHide: true, timeout: 3000, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
    );
    const lines = String(stdout).trim().split(/\r?\n/);
    const byPid = new Map();
    const bestByImage = new Map();

    for (const line of lines) {
      const cols = [];
      const re = /"([^"]*)"/g;
      let m;
      while ((m = re.exec(line))) cols.push(m[1]);
      if (cols.length < 9) continue;

      const imageName = cols[0] || '';
      const pid = parseInt(cols[1], 10);
      if (!pid) continue;

      const windowTitle = normalizeTitle(cols[8]);
      byPid.set(pid, { imageName, windowTitle });

      if (windowTitle) {
        const k = stripExe(imageName).toLowerCase();
        const existing = bestByImage.get(k);
        // نفضّل العنوان الأطول — عادةً "المحتوى - اسم التطبيق"
        if (!existing || windowTitle.length > existing.length) {
          bestByImage.set(k, windowTitle);
        }
      }
    }

    return { byPid, bestByImage };
  } catch {
    return { byPid: new Map(), bestByImage: new Map() };
  }
}

/**
 * "YouTube - Google Chrome" → "Google Chrome"
 * "Song Name | Spotify"     → "Spotify"
 * "PlayOSX"                 → "PlayOSX"
 * "Untitled - Notepad"      → "Notepad"
 * ""                        → null
 */
function nameFromWindowTitle(title) {
  const wt = String(title || '').trim();
  if (!wt) return null;

  const parts = wt.split(/\s[-|]\s/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].trim();
    if (last && last.length <= 40 && /^[\w\s.&'()+-]+$/.test(last)) {
      return last;
    }
  }
  if (wt.length <= 40) return wt;
  return null;
}

async function enrichSessions(sessions) {
  if (!Array.isArray(sessions) || !sessions.length) return sessions || [];

  const selfName = app.getName() || 'Launcher';

  const need = new Map();
  for (const s of sessions) {
    const k = procKey(s);
    if (!k || cache.has(k)) continue;
    if (k === 'electron' || s.pid === process.pid) {
      cache.set(k, selfName);
      continue;
    }
    if (!need.has(k)) need.set(k, s);
  }

  if (need.size) {
    const { byPid, bestByImage } = await getAllProcessInfo();

    for (const [k, s] of need) {
      const info = byPid.get(s.pid);
      let name = null;

      // 1) من window title للـ pid ده
      if (info && info.windowTitle) {
        name = nameFromWindowTitle(info.windowTitle);
      }

      // 2) من أي عملية بنفس الاسم عنده window title مفيد
      //    (حل مشكلة Chrome اللي الـ audio session بتاعته من عملية خلفية)
      if (!name) {
        const anyTitle = bestByImage.get(k);
        if (anyTitle) name = nameFromWindowTitle(anyTitle);
      }

      cache.set(k, name || capitalize(k));
    }
  }

  return sessions.map((s) => {
    const displayName = cache.get(procKey(s)) || '';
    return {
      ...s,
      displayName:
        displayName && displayName !== 'N/A' ? displayName : capitalize(procKey(s)),
    };
  });
}

function clearDisplayNameCache() {
  cache.clear();
}

module.exports = { enrichSessions, clearDisplayNameCache };