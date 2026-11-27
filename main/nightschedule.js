// Turns Windows Night Light on and off by itself: from sunset to sunrise (worked
// out from latitude and longitude) or between two times of day the user picks.
//
// It only acts when the wanted state changes (and once at start), so switching
// Night Light by hand stays in effect until the next sunset or sunrise.

const TICK_MS = 60 * 1000;

/** Sunrise and sunset (Date objects) for the calendar day of `date`, at a place. null: no sunrise or sunset that day. */
function sunTimes(date, lat, lon) {
  const rad = Math.PI / 180;
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const dayOfYear = Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / 86400000);
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1);
  const eqTime =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  // The sun's centre 0.833 degrees below the horizon: its upper edge, with the air bending the light.
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosHa > 1) return { polar: 'night' };
  if (cosHa < -1) return { polar: 'day' };
  const ha = Math.acos(cosHa) / rad;
  const base = Date.UTC(y, m, d);
  return {
    sunrise: new Date(base + (720 - 4 * (lon + ha) - eqTime) * 60000),
    sunset: new Date(base + (720 - 4 * (lon - ha) - eqTime) * 60000),
  };
}

function parseTime(text, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text || ''));
  if (!m) return fallback;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

/**
 * Where the user is, for sunset and sunrise. The coordinates in the settings,
 * or, without them, a rough guess from the PC's time zone (15 degrees of
 * longitude per hour, 30 degrees north): good to within about half an hour.
 */
function place(settings, now) {
  const lat = parseFloat(settings.nightLat);
  const lon = parseFloat(settings.nightLon);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon, guessed: false };
  return { lat: 30, lon: Math.max(-180, Math.min(180, -now.getTimezoneOffset() / 4)), guessed: true };
}

/** Should Night Light be on right now? null: the schedule is off. */
function wantedState(settings, now = new Date()) {
  const mode = settings.nightSchedule;
  if (mode === 'custom') {
    const from = parseTime(settings.nightFrom, 21 * 60);
    const to = parseTime(settings.nightTo, 7 * 60);
    const cur = now.getHours() * 60 + now.getMinutes();
    if (from === to) return false;
    return from < to ? cur >= from && cur < to : cur >= from || cur < to;
  }
  if (mode === 'sun') {
    const { lat, lon } = place(settings, now);
    const t = sunTimes(now, lat, lon);
    if (t.polar) return t.polar === 'night';
    return now < t.sunrise || now >= t.sunset;
  }
  return null;
}

class NightSchedule {
  constructor({ getSettings, system }) {
    this.getSettings = getSettings;
    this.system = system;
    this.timer = null;
    this.applied = null;
  }

  /** (Re)start after the settings changed. */
  restart() {
    clearInterval(this.timer);
    this.timer = null;
    this.applied = null;
    if (wantedState(this.getSettings()) === null) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref();
  }

  async tick() {
    const want = wantedState(this.getSettings());
    if (want === null || want === this.applied) return;
    try {
      await this.system.setNightLight(want);
      this.applied = want;
    } catch {
      // Not available on this PC, or the helper is busy: try again next minute.
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { NightSchedule, sunTimes, wantedState, place };
