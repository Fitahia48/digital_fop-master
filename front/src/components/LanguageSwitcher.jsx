import React from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUES } from '../i18n';

/**
 * Sélecteur de langue (FR / EN / MG) : appelle i18n.changeLanguage() qui
 * persiste automatiquement le choix dans localStorage (clé i18nextLng).
 */
const LanguageSwitcher = ({ className = '' }) => {
  const { i18n, t } = useTranslation();

  const changerLangue = (code) => {
    if (code && code !== i18n.language) {
      i18n.changeLanguage(code);
    }
  };

  return (
    <div className={`flex items-center gap-1 ${className}`} role="group" aria-label={t('menu.langue')}>
      {LANGUES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => changerLangue(l.code)}
          aria-pressed={i18n.language.startsWith(l.code)}
          aria-label={`${t('menu.langue')} : ${l.label}`}
          title={l.label}
          className={`px-2 py-1 rounded-md text-xs font-bold uppercase transition ${
            i18n.language.startsWith(l.code)
              ? 'bg-blue-900 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-blue-50'
          }`}
        >
          {l.code}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
