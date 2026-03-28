import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import km from './km';

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

export default i18n;
