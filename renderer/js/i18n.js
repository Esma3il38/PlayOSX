// Interface language. Strings are written in English in the code and looked
// up here by their English text; anything without a translation stays in
// English. {name}-style placeholders are filled from `vars`.

import ar from './locales/ar.js';
import en from './locales/en.js';
import es from './locales/es.js';
import de from './locales/de.js';
import fr from './locales/fr.js';
import pt from './locales/pt.js';

// Arabic strings that live in the code double as the Arabic text for their English twins.
for (const [arText, enText] of Object.entries(en)) if (!ar[enText]) ar[enText] = arText;

const TABLES = { ar, es, de, fr, pt };
const EN_KEYS = Object.keys(en).sort((a, b) => b.length - a.length);

const RTL = new Set(['ar']);

export const LANGUAGES = [
  { value: 'auto', label: 'System Language' },
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
];

/** The operating system's language (Windows display language) if we have it, else English. */
export function systemLanguage() {
  try {
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).filter(Boolean);
    for (const l of list) {
      const code = String(l).toLowerCase().split('-')[0];
      if (code === 'en' || TABLES[code]) return code;
    }
  } catch {}
  return 'en';
}

let table = null;
let lang = 'en';

/** Pick the language from the setting ('auto' follows Windows). */
export function setLanguage(value) {
  let code = value && value !== 'auto' ? value : systemLanguage();
  if (code !== 'en' && !TABLES[code]) code = 'en';
  lang = code;
  table = TABLES[code] || null;
  document.documentElement.lang = code;
  // Text flows right-to-left; the carousel and layout stay as they are (see base.css .lang-rtl).
  document.documentElement.classList.toggle('lang-rtl', RTL.has(code));
}

export { en as EN_TABLE };

export function language() {
  return lang;
}

export function t(text, vars) {
  if (text == null || text === '') return text;
  let out = String(text);
  if (table) {
    if (lang !== 'ar' && /[\u0600-\u06FF]/.test(out)) {
      if (en[out]) out = en[out];
      else for (const k of EN_KEYS) if (out.includes(k)) out = out.split(k).join(en[k]);
    }
    const hit = table[out];
    if (hit) out = hit;
  } else if (lang === 'en' && /[\u0600-\u06FF]/.test(out)) {
    // Text that was written in Arabic in the code: show English instead.
    if (en[out]) out = en[out];
    else for (const k of EN_KEYS) if (out.includes(k)) out = out.split(k).join(en[k]);
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  // No full stop at the end of any text ("..." and "…" are kept).
  return out.replace(/(?<![.\s])[.。]+\s*$/u, (m) => (m.trim().length > 1 ? m : ''));
}
