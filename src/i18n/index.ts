import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en';
import km from './km';

export const LANGUAGES = ['en', 'km'] as const;
export type Language = typeof LANGUAGES[number];

const KEY_LANGUAGE = 'app.language';

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3' as any,
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      km: { translation: km },
    },
    interpolation: { escapeValue: false },
  });

// Restore the saved language on launch…
AsyncStorage.getItem(KEY_LANGUAGE)
  .then(saved => {
    if (saved && (LANGUAGES as readonly string[]).includes(saved) && saved !== i18n.language) {
      i18n.changeLanguage(saved);
    }
  })
  .catch(() => {});

// …and remember every change, wherever it's made (Profile, Login, …)
i18n.on('languageChanged', lng => {
  AsyncStorage.setItem(KEY_LANGUAGE, lng).catch(() => {});
});

/** Translated label for an API status ("paid", "Occupied", "partially paid"…); falls back to Title Case. */
export function statusLabel(status?: string | null): string {
  const raw = String(status ?? '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  const fallback = raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return i18n.t(`status.${key}`, { defaultValue: fallback });
}

/** Short month names for the current language (Jan…Dec / មករា…ធ្នូ). */
export function monthsShort(): string[] {
  return i18n.t('common.monthsShort').split(',');
}

/** "2026-11" → "Nov 2026" / "វិច្ឆិកា 2026" */
export function monthLabel(ym?: string | null): string {
  const [y, m] = String(ym ?? '').split('-');
  const name = monthsShort()[parseInt(m, 10) - 1];
  return name ? `${name} ${y}` : String(ym ?? '—');
}

/** "2026-11-15" (or ISO) → "Nov 15" / "វិច្ឆិកា 15"; pass `year` for "Nov 15, 2026". */
export function dayLabel(v?: string | null, year = false): string {
  if (!v || v === 'N/A') return '—';
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
  if (isNaN(d.getTime())) return v;
  return `${monthsShort()[d.getMonth()]} ${d.getDate()}${year ? `, ${d.getFullYear()}` : ''}`;
}

export default i18n;
