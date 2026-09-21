import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import fr from './locales/fr/translation.json';
import en from './locales/en/translation.json';
import mg from './locales/mg/translation.json';

// Langues supportées par l'application (mg = malagasy, ISO 639-1)
export const LANGUES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'mg', label: 'Malagasy' },
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      mg: { translation: mg },
    },
    supportedLngs: ['fr', 'en', 'mg'],
    fallbackLng: 'fr',
    // Détection : localStorage (clé i18nextLng, persistance inter-sessions) puis navigateur
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

// Attribut lang dynamique sur <html> : indispensable pour les lecteurs d'écran et le SEO
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng.split('-')[0];
});

export default i18n;
