// ميزات إضافية: الشريط العلوي، ودجت الرئيسية، التقويم، تفاصيل اللعبة، التصنيف، الرقم السري،
// القفل التلقائي، سجل النشاط، مشغل الموسيقى، ترتيب القائمة السريعة.
import { t } from './i18n.js';
import { api, state, on, setSetting, emit } from './state.js';
import { toast } from './ui/toast.js';
import { textDialog, infoDialog, confirmDialog, themeTrackDialog } from './ui/dialogs.js';
import { browseFiles } from './ui/filebrowser.js';
import { activeProfileId, profiles } from './profiles.js';
import { pinPad } from './ui/pinpad.js';

const S = () => state.settings;
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const onOff = (key, label, hint) => ({ type: 'toggle', key, label, hint });
const fmtDate = (ts, o) => new Date(ts).toLocaleDateString('ar-EG', o || { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

/* ------------------------------------------------------------------ */
/* الشريط العلوي + ودجت الرئيسية                                        */
/* ------------------------------------------------------------------ */
let battery = null;
export let hasBattery = false;
let weatherData = null;
let weatherAt = 0;
const WX = (c) => (c === 0 ? '☀️' : c <= 3 ? '⛅' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌦️' : '⛈️');

function statusText() {
  const bits = [];
  const s = S();
  if (s.tbBattery !== false && battery && hasBattery) bits.push(`${battery.charging ? '⚡' : '🔋'} ${Math.round(battery.level * 100)}%`);
  if (s.tbDate) bits.push(fmtDate(Date.now(), { day: 'numeric', month: 'short' }));
  return bits.join('  ');
}

function ensureStatus() {
  document.documentElement.classList.toggle('pro-no-clock', S().tbClock === false);
  for (const right of document.querySelectorAll('.tb-right')) {
    let el = right.querySelector('.pro-status');
    if (!el) {
      el = document.createElement('div');
      el.className = 'pro-status';
      right.insertBefore(el, right.firstChild);
    }
    el.textContent = statusText();
  }
  const w = document.getElementById('pro-widget');
  if (w) w.remove();
}

async function loadWeather() {
  if (S().homeShowWeather === false || Date.now() - weatherAt < 20 * 60 * 1000) return;
  weatherAt = Date.now();
  try { weatherData = (await api.proWeather(S().weatherCity || 'Cairo')) || weatherData; } catch {}
}

/* ------------------------------------------------------------------ */
/* التقويم (الألعاب المضافة مؤخراً)                                     */
/* ------------------------------------------------------------------ */
export function openCalendar() {
  const games = state.games.filter((g) => g.addedAt && g.category !== 'media').sort((a, b) => b.addedAt - a.addedAt);
  if (!games.length) return infoDialog({ title: 'التقويم', html: '<p>لا توجد ألعاب بعد.</p>' });
  const groups = new Map();
  for (const g of games) {
    const key = new Date(g.addedAt).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  }
  const week = Date.now() - 7 * 86400000;
  let html = '';
  for (const [month, list] of groups) {
    html += `<h3 class="pro-h">${esc(month)} · ${list.length}</h3>`;
    html += list.slice(0, 40).map((g) => `<p class="pro-row"><span>${g.addedAt > week ? '🆕 ' : ''}${esc(g.name)}</span><small>${esc(fmtDate(g.addedAt, { day: 'numeric', month: 'short' }))}</small></p>`).join('');
  }
  return infoDialog({ title: 'تقويم الألعاب (أحدث ما نزل)', html });
}

/* ------------------------------------------------------------------ */
/* تفاصيل اللعبة                                                       */
/* ------------------------------------------------------------------ */
export async function openGameDetails(game) {
  if (!game) return;
  const info = await api.proGameInfo(game.id).catch(() => null);
  if (!info || info.error || info.noSteam) {
    return infoDialog({ title: game.name, html: '<p>لا تتوفر تفاصيل لهذه اللعبة (التفاصيل تأتي من Steam للألعاب المرتبطة به).</p>' });
  }
  const mc = info.metacritic != null ? `<span class="pro-mc ${info.metacritic >= 75 ? 'g' : info.metacritic >= 50 ? 'y' : 'r'}">${info.metacritic}</span> Metacritic` : 'لا يوجد تقييم Metacritic';
  const pre = (txt) => `<p class="pro-pre">${esc(txt).replace(/\n/g, '<br>')}</p>`;
  const html = `
    <p>${mc}${info.release ? ` · ${esc(info.release)}` : ''}</p>
    ${info.genres.length ? `<p>🏷️ ${info.genres.map(esc).join(' · ')}</p>` : ''}
    ${pre(info.desc)}
    ${info.minReq ? `<h3 class="pro-h">الحد الأدنى للتشغيل</h3>${pre(info.minReq)}` : ''}
    ${info.recReq ? `<h3 class="pro-h">المتطلبات الموصى بها</h3>${pre(info.recReq)}` : ''}`;
  return infoDialog({ title: info.name || game.name, html });
}

/* ------------------------------------------------------------------ */
/* التصنيف التلقائي حسب النوع                                          */
/* ------------------------------------------------------------------ */
let classifying = false;
async function classify() {
  if (classifying) return;
  classifying = true;
  const map = { ...(S().genreMap || {}) };
  const todo = state.games.filter((g) => g.category !== 'media' && !map[g.id]);
  let n = 0;
  for (const g of todo) {
    if (!g.steamAppId) { map[g.id] = ['أخرى']; continue; }
    try {
      const i = await api.proGameInfo(g.id);
      map[g.id] = i && i.genres && i.genres.length ? i.genres : ['أخرى'];
    } catch {}
    if (++n % 6 === 0) await setSetting('genreMap', map);
    await sleep(700);
  }
  await setSetting('genreMap', map);
  classifying = false;
}

async function showGenres() {
  if (!Object.keys(S().genreMap || {}).length) {
    await infoDialog({ title: 'التصنيف', html: '<p>جارٍ تصنيف الألعاب في الخلفية… أعد فتح هذه الصفحة بعد قليل.</p>' });
    return classify();
  }
  const groups = new Map();
  for (const g of state.games) for (const genre of (S().genreMap || {})[g.id] || []) {
    if (!groups.has(genre)) groups.set(genre, []);
    groups.get(genre).push(g.name);
  }
  const html = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
    .map(([k, v]) => `<h3 class="pro-h">${esc(k)} · ${v.length}</h3><p class="pro-pre">${v.slice(0, 30).map(esc).join(' • ')}</p>`).join('');
  return infoDialog({ title: 'الألعاب حسب النوع', html: html || '<p>لا يوجد.</p>' });
}

/* ------------------------------------------------------------------ */
/* الرقم السري (منفصل لكل مستخدم) + القفل التلقائي                      */
/* ------------------------------------------------------------------ */
const pinOf = (id) => (S().pins || {})[id] || null;
export const myPin = () => pinOf(activeProfileId());
const profileOf = (id) => profiles().find((p) => p.id === id) || null;
async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const savePin = (v) => {
  const pins = { ...(S().pins || {}) };
  if (v) pins[activeProfileId()] = v; else delete pins[activeProfileId()];
  return setSetting('pins', pins);
};
const checker = (p) => async (v) => (await hashPin(v, p.salt)) === p.hash;
export async function setPin() {
  const id = activeProfileId();
  const profile = profileOf(id);
  const cur = pinOf(id);

  if (cur && (await pinPad({
    title: 'أدخل الرقم السري الحالي',
    profile,
    verify: checker(cur),
    length: cur.len || 0,          // ← سيبها زي ما هي (للتوافق مع الأرقام القديمة)
  })) == null) return;

  const a = await pinPad({
    title: 'اختر رقماً سرياً من 4 أرقام',
    profile,
    length: 4,                      // ← ضيف السطر ده
  });
  if (a == null) return;

  const b = await pinPad({
    title: 'أعد كتابة الرقم السري',
    profile,
    length: 4,                      // ← ضيف السطر ده كمان
  });
  if (b == null) return;

  if (a !== b) return infoDialog({ title: 'الرقمان غير متطابقين', html: '<p>حاول مرة أخرى.</p>' });

  const salt = Math.random().toString(36).slice(2);
  await savePin({ salt, hash: await hashPin(a, salt), len: 4 });
  api.proLogAdd('pin', 'تم تعيين رقم سري');
}
export async function removePin() {
  const p = myPin();
  if (!p) return;
  const v = await pinPad({ title: 'أدخل الرقم السري الحالي', profile: profileOf(activeProfileId()), verify: checker(p), length: p.len || 0 });
  if (v == null) return;
  await savePin(null);
  api.proLogAdd('pin', 'تمت إزالة الرقم السري');
}

/** Asks for a user's PIN (each user has their own). true = no PIN set, or the right one was entered. */
export async function unlockProfile(id, cancellable = true) {
  const p = pinOf(id);
  if (!p) return true;
  const v = await pinPad({ title: 'أدخل الرقم السري', profile: profileOf(id), cancellable, verify: checker(p), length: p.len || 0 });
  if (v == null) return false;
  api.proLogAdd('unlock', 'فُتح القفل');
  return true;
}

let locked = false;
let lastActive = Date.now();
export async function lockNow(reason) {
  const id = activeProfileId();
  const p = pinOf(id);
  if (locked || !p) return;
  locked = true;
  const cover = document.createElement('div');
  cover.className = 'pro-lock';
  document.body.appendChild(cover);
  api.proLogAdd('lock', reason || 'قفل');
  await pinPad({ title: 'أدخل الرقم السري', profile: profileOf(id), cancellable: false, verify: checker(p), length: p.len || 0 });
  cover.remove();
  locked = false;
  lastActive = Date.now();
  api.proLogAdd('unlock', 'فُتح القفل');
}

function watchIdle() {
  const bump = () => { lastActive = Date.now(); };
  for (const e of ['keydown', 'mousemove', 'mousedown', 'wheel']) addEventListener(e, bump, true);
  let sig = '';
  setInterval(() => {
    const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean);
    const now = pads.map((p) => p.buttons.map((b) => (b.pressed ? 1 : 0)).join('') + p.axes.map((a) => Math.round(a * 4)).join(',')).join('|');
    if (now !== sig) { sig = now; bump(); }
    const mins = Number(S().autoLockMin) || 0;
    if (mins && myPin() && !locked && Date.now() - lastActive > mins * 60000) lockNow('قفل تلقائي بعد خمول');
  }, 2000);
}

/* ------------------------------------------------------------------ */
/* سجل النشاط                                                          */
/* ------------------------------------------------------------------ */
const TYPES = { launch: ' فتح لعبة', lock: ' قفل', unlock: ' فتح القفل', pin: ' الرقم السري' };
async function showActivity() {
  const log = await api.proLogGet().catch(() => []);
  const html = log.length
    ? log.slice(0, 120).map((e) => `<p class="pro-row"><span>${esc(TYPES[e.type] || e.type)} — ${esc(e.name)}</span><small>${esc(fmtDate(e.t, { day: 'numeric', month: 'short' }))} ${esc(fmtTime(e.t))}</small></p>`).join('')
    : '<p>لا يوجد نشاط مسجل بعد.</p>';
  return infoDialog({ title: 'سجل النشاط', html });
}

/* ------------------------------------------------------------------ */
/* مشغل الموسيقى (ملفات محلية + يوتيوب)                                 */
/* ------------------------------------------------------------------ */
const audio = new Audio();
audio.loop = false;
const SONGS = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac', 'webm'];
let queue = []; // { title, sub, key, track?, url? }
let qi = -1;
let playing = false;
let busy = false;
const blobs = new Map();
const vol = () => Math.max(0, Math.min(100, Number(S().musicVol ?? 60)));
const saved = () => (S().ytList || []).filter((x) => x && typeof x === 'object');

function setVolume() { audio.volume = vol() / 100; }
async function urlFor(it) {
  if (it.url) return it.url;
  if (blobs.has(it.key)) return blobs.get(it.key);
  const bytes = await api.themeTrackAudio(it.track);
  if (!bytes) throw new Error('no audio');
  const u = URL.createObjectURL(new Blob([bytes]));
  blobs.set(it.key, u);
  return u;
}

/* No floating bar: a notification when a song starts, controls live in the quick menu (Music). */
const ytArt = (id) => (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '');
function paintBar() {
  const it = queue[qi];
  if ('mediaSession' in navigator && it) navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: it.sub || '', artwork: it.art ? [{ src: it.art }] : [] });
  emit('user-music', !!it && (playing || busy));
}
export const musicInfo = () => {
  const it = queue[qi];
  return { on: !!it, playing, art: it ? it.art || '' : '', pos: audio.currentTime || 0, dur: Number.isFinite(audio.duration) ? audio.duration : 0, title: it ? it.title : '', sub: it ? (busy ? 'جارٍ التحميل…' : [it.sub, queue.length > 1 ? `${qi + 1}/${queue.length}` : ''].filter(Boolean).join(' · ')) : '' };
};
export const musicCmd = (c) => ({ prev: () => skip(-1), next: () => skip(1), toggle: () => toggleMusic(), stop: () => stopMusic() })[c]();
export const musicSeek = (sec) => { if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, sec)); };
export const musicHistory = () => (S().musicHistory || []).filter((x) => x && typeof x === 'object');
export const musicPlayItem = (it) => { if (it) push({ ...it }); };
export const musicClearHistory = () => setSetting('musicHistory', []);
export const musicLooping = () => !!audio.loop;
export const musicSetLoop = (v) => { audio.loop = !!v; return audio.loop; };
export const musicSetVol = (v) => { setSetting('musicVol', v); setVolume(); };
export const musicVolume = () => vol();
export { searchSong, addFiles };
audio.addEventListener('timeupdate', () => emit('user-music-time'));
audio.addEventListener('pause', () => { playing = false; paintBar(); });
audio.addEventListener('play', () => { playing = true; paintBar(); });
audio.addEventListener('ended', () => skip(1));
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => toggleMusic());
  navigator.mediaSession.setActionHandler('pause', () => toggleMusic());
  navigator.mediaSession.setActionHandler('nexttrack', () => skip(1));
  navigator.mediaSession.setActionHandler('previoustrack', () => skip(-1));
}

async function playAt(i) {
  if (!queue.length) return;
  qi = (i + queue.length) % queue.length;
  const my = qi, it = queue[qi];
  busy = true;
  audio.pause();
  paintBar();
  try {
    const u = await urlFor(it);
    if (my !== qi) return;
    audio.src = u;
    setVolume();
    await audio.play();
  } catch {
    if (my === qi) { busy = false; paintBar(); if (queue.length > 1) setTimeout(() => skip(1), 800); }
    return;
  }
  busy = false;
  playing = true;
  paintBar();
  try {
    const hist = [{ title: it.title, sub: it.sub || '', key: it.key, track: it.track, url: it.url && !String(it.url).startsWith('blob:') ? it.url : undefined, art: it.art || '', t: Date.now() }, ...(S().musicHistory || []).filter((x) => x && x.key !== it.key)].slice(0, 40);
    setSetting('musicHistory', hist);
  } catch {}
  toast({ title: it.title, body: it.sub || 'الموسيقى', image: it.art || null, icon: 'music', duration: 4500, sound: false, preview: true });
}
function skip(d) { if (queue.length) playAt(qi + d); }
function toggleMusic() {
  if (!queue.length) { queue = saved().map((x) => ({ ...x })); if (!queue.length) return infoDialog({ title: 'مشغل الموسيقى', html: '<p>ابحث عن أغنية أو أضف ملفات من الجهاز أولاً.</p>' }); return playAt(0); }
  if (audio.src && !audio.ended) return audio.paused ? audio.play() : audio.pause();
  playAt(Math.max(qi, 0));
}
function stopMusic() { audio.pause(); audio.removeAttribute('src'); queue = []; qi = -1; playing = false; paintBar(); }
const push = (it, play = true) => { queue.push(it); if (play) playAt(queue.length - 1); else paintBar(); };

async function searchSong() {
  const q = await textDialog({ title: 'ابحث عن أغنية', placeholder: 'اسم الأغنية أو الفنان', okLabel: 'بحث' });
  if (!q || !q.trim()) return;
  const r = await themeTrackDialog({ name: q.trim() }, { plain: true, title: 'اختر الأغنية' });
  if (!r) return;
  const it = { title: r.title, sub: r.channel || '', key: r.key, track: r, art: ytArt(r.id) };
  await setSetting('ytList', [it, ...saved().filter((x) => x.key !== it.key)].slice(0, 30));
  push(it);
  // The rest of the results line up as the next songs.
  api.themeCandidates(q.trim(), false).then((list) => {
    const have = new Set(queue.map((x) => x.key));
    for (const x of list || []) {
      if (queue.length >= 15) break;
      if (have.has(x.key)) continue;
      queue.push({ title: x.title, sub: x.channel || '', key: x.key, track: { kind: 'track', ...x }, art: ytArt(x.id) });
    }
    paintBar();
  }).catch(() => {});
}
async function addFiles() {
  const r = await browseFiles({ title: 'إضافة أغاني', mode: 'file', exts: SONGS, multi: true, key: 'music' });
  const list = Array.isArray(r) ? r : r ? [r] : [];
  const first = queue.length;
  for (const f of list) {
    const path = String(f.path || f);
    push({ title: path.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''), sub: 'من الجهاز', key: `f:${path}`, url: encodeURI('file:///' + path.replace(/\\/g, '/')) }, false);
  }
  if (list.length) playAt(first);
}

/* ------------------------------------------------------------------ */
/* ترتيب أيقونات القائمة السريعة بالسحب                                  */
/* ------------------------------------------------------------------ */
const QM = [
  ['home', 'الرئيسية'], ['library', 'مكتبة الألعاب'], ['notifications', 'الإشعارات'], ['party', 'التواصل'],
  ['search', 'البحث'], ['music', 'الموسيقى'], ['sound', 'الصوت'], ['bluetooth', 'البلوتوث'],
  ['accessories', 'الملحقات'], ['display', 'الشاشة'], ['settings', 'الإعدادات'], ['power', 'الطاقة'],
];

/* ------------------------------------------------------------------ */
/* أقسام الإعدادات                                                     */
/* ------------------------------------------------------------------ */
export function proSections(id) {
 
  if (id === 'library') {
    return [{ label: 'التصنيف التلقائي', items: () => [
      onOff('genreAuto', 'تصنيف الألعاب تلقائياً حسب النوع'),
      { type: 'action', label: 'عرض الألعاب حسب النوع (أكشن، RPG…)', icon: 'library', run: () => showGenres() },
      { type: 'action', label: 'تصنيف الألعاب الآن', icon: 'refresh', run: () => classify() },
      { type: 'note', label: 'الأنواع تأتي من Steam. تفاصيل أي لعبة (وصف، Metacritic، المتطلبات) من قائمة خيارات اللعبة.' },
    ] }];
  }
  if (id === 'users') {
    return [
      { label: 'سجل النشاط', items: () => [
        { type: 'action', label: 'عرض سجل النشاط (ما الذي فُتح ومتى)', icon: 'clock', run: () => showActivity() },
        { type: 'action', label: 'مسح السجل', icon: 'trash', danger: true, run: async () => {
          if (await confirmDialog({ title: 'مسح سجل النشاط؟', message: 'سيتم حذف كل الأحداث المسجلة.', confirmLabel: 'مسح', cancelLabel: 'إلغاء', danger: true })) api.proLogClear();
        } },
      ] },
    ];
  }
  if (id === 'sound') {
    return [
      { label: 'مشغل الموسيقى (خلفية)', items: () => [
        { type: 'range', label: 'مستوى صوت الموسيقى', min: 0, max: 100, step: 5, unit: '%', get: () => vol(), set: (v) => { setSetting('musicVol', v); setVolume(); } },
         onOff('musicAuto', 'تشغيل الموسيقى تلقائياً عند فتح الجهاز'),
         { type: 'note', label: 'يستمر التشغيل في الخلفية، والتحكم من القائمة السريعة (قسم Music). أول تشغيل لأي أغنية يأخذ بضع ثوانٍ للتحميل (يحتاج yt-dlp والإنترنت).' },
        { type: 'action', label: 'بحث عن أغنية في يوتيوب…', icon: 'search',primary: true, run: () => searchSong() },
        { type: 'action', label: 'إضافة أغاني من الجهاز…', icon: 'folder',warning: true, run: () => addFiles() },
        
      ] },
      { label: 'أغاني محفوظة', items: () => saved().length
        ? [...saved().slice(0, 15).map((x, i) => ({ type: 'action', label: x.title.slice(0, 60), icon: 'music', run: () => push({ ...x }) })), { type: 'action', label: 'مسح المحفوظات', icon: 'trash', danger: true, run: () => setSetting('ytList', []) }]
        : [{ type: 'note', label: 'الأغاني التي تبحث عنها تُحفظ هنا.' }] },
    ];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* التشغيل                                                             */
/* ------------------------------------------------------------------ */
export function initPro() {
  if (navigator.getBattery) navigator.getBattery().then((b) => {
    battery = b;
    b.addEventListener('levelchange', ensureStatus);
    b.addEventListener('chargingchange', ensureStatus);
  }).catch(() => {});
  api.proHasBattery().then((v) => { hasBattery = !!v; ensureStatus(); }).catch(() => {});
  let raf = 0;
  const tick = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(ensureStatus); };
  const views = document.getElementById('views');
  if (views) new MutationObserver(tick).observe(views, { childList: true, subtree: true });
  on('settings', tick);
  setInterval(ensureStatus, 30000);
  tick();
  watchIdle();
  if (myPin() && S().lockOnStart !== false && S().welcomeScreen === false) setTimeout(() => lockNow('عند التشغيل'), 300);
  if (S().genreAuto) setTimeout(() => classify(), 20000);
  if (S().musicAuto && saved().length) setTimeout(() => { queue = saved().map((x) => ({ ...x })); playAt(0); }, 4000);
}
