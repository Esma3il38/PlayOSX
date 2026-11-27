// Extra features: weather, Steam game details (description, Metacritic, requirements, genres), activity log.
const cache = new Map();
const getJson = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'PS5Launcher' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};
const strip = (h) => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<li>/gi, '• ').replace(/<\/li>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

async function weather(city) {
  const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city || 'Cairo')}&count=1&language=ar`);
  const p = g.results && g.results[0];
  if (!p) return null;
  const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code&timezone=auto`);
  return { city: p.name, temp: Math.round(w.current.temperature_2m), code: w.current.weather_code };
}

async function gameInfo(g) {
  if (!g || !g.steamAppId) return { noSteam: true, name: g && g.name };
  const key = String(g.steamAppId);
  if (cache.has(key)) return cache.get(key);
  const j = await getJson(`https://store.steampowered.com/api/appdetails?appids=${key}&l=arabic`);
  const d = j[key] && j[key].data;
  if (!d) return { noSteam: true, name: g.name };
  const out = {
    name: d.name,
    desc: strip(d.short_description),
    metacritic: d.metacritic ? d.metacritic.score : null,
    genres: (d.genres || []).map((x) => x.description),
    release: d.release_date ? d.release_date.date : '',
    minReq: strip(d.pc_requirements && d.pc_requirements.minimum),
    recReq: strip(d.pc_requirements && d.pc_requirements.recommended),
  };
  cache.set(key, out);
  return out;
}

function log(settings, type, name, id) {
  const a = settings.data.activityLog || (settings.data.activityLog = []);
  a.unshift({ t: Date.now(), type, name, id });
  if (a.length > 300) a.length = 300;
  settings.saveNow();
}

function hasBattery() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    require('child_process').execFile('powershell.exe', ['-NoProfile', '-Command', '@(Get-CimInstance Win32_Battery).Count'], { timeout: 8000, windowsHide: true }, (err, out) => resolve(!err && parseInt(String(out).trim(), 10) > 0));
  });
}

function register(ipcMain, { settings, library }) {
  ipcMain.handle('pro:hasBattery', () => hasBattery());
  ipcMain.handle('pro:gameInfo', (_e, id) => gameInfo(library.find(id)).catch(() => ({ error: true })));
  ipcMain.handle('pro:logGet', () => settings.data.activityLog || []);
  ipcMain.handle('pro:logAdd', (_e, type, name) => log(settings, String(type), String(name), null));
  ipcMain.handle('pro:logClear', () => { settings.data.activityLog = []; settings.saveNow(); });
}

module.exports = { register, log };
