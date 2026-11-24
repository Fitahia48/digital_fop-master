import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSitemap, faNewspaper, faExternalLinkAlt, faLandmark } from '@fortawesome/free-solid-svg-icons';
import { EXTERNAL_URLS } from '../config/externalLinks';

const MinisterePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('organigramme');

  // Sync activeTab with URL on mount and when URL changes
  useEffect(() => {
    const path = location.pathname;
    if (path.endsWith('/actualites') || path.includes('?choix=actualites')) {
      setActiveTab('actualites');
    } else {
      setActiveTab('organigramme');
    }
  }, [location]);

  // Update URL when tab changes (without full navigation for sharing)
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const basePath = '/ministere';
    const newPath = tab === 'actualites' ? `${basePath}/actualites` : `${basePath}/organigramme`;
    navigate(newPath, { replace: true });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* En-tête de la page Ministère */}
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center justify-center gap-3 mb-3">
          <FontAwesomeIcon icon={faLandmark} className="text-blue-700" />
          {t('ministere.titre_page')}
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          {t('ministere.intro')}
        </p>
      </header>

      {/* Onglets de choix : Organigramme / Actualités */}
      <div
        role="tablist"
        aria-label={t('ministere.titre_page')}
        className="mb-6 flex flex-col sm:flex-row justify-center gap-2"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'organigramme'}
          aria-controls="panel-organigramme"
          id="tab-organigramme"
          onClick={() => handleTabChange('organigramme')}
          className={`flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-medium transition-all min-h-[48px] touch-target ${
            activeTab === 'organigramme'
              ? 'bg-blue-900 text-white shadow-lg border-2 border-blue-700'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-blue-50 hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
          }`}
        >
          <FontAwesomeIcon icon={faSitemap} className="text-lg" aria-hidden="true" />
          <span>{t('ministere.choix_organigramme')}</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'actualites'}
          aria-controls="panel-actualites"
          id="tab-actualites"
          onClick={() => handleTabChange('actualites')}
          className={`flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-medium transition-all min-h-[48px] touch-target ${
            activeTab === 'actualites'
              ? 'bg-blue-900 text-white shadow-lg border-2 border-blue-700'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-blue-50 hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
          }`}
        >
          <FontAwesomeIcon icon={faNewspaper} className="text-lg" aria-hidden="true" />
          <span>{t('ministere.choix_actualites')}</span>
        </button>
      </div>

      {/* Panneau Organigramme */}
      <div
        role="tabpanel"
        id="panel-organigramme"
        aria-labelledby="tab-organigramme"
        hidden={activeTab !== 'organigramme'}
        className="animate-fade-in"
      >
        <section className="p-6 bg-blue-50 border border-blue-200 rounded-xl text-center" aria-labelledby="organigramme-officiel-title">
          <div className="mb-6">
            <h2 id="organigramme-officiel-title" className="text-2xl font-bold text-blue-900 flex items-center justify-center gap-3">
              <FontAwesomeIcon icon={faSitemap} className="text-blue-700" />
              {t('organigramme.titre_officiel')}
            </h2>
            <p className="mt-2 text-blue-700">{t('ministere.desc_organigramme')}</p>
          </div>
          <p className="text-center text-blue-800 mb-6 text-lg">
            {t('organigramme.voir_officiel')}
          </p>
          <a
            href={EXTERNAL_URLS.OFFICIAL_ORGANIGRAMME}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-lg rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label={`${t('organigramme.voir_officiel')} — ${t('organigramme.nouvel_onglet')} — ${t('organigramme.site_officiel')}`}
          >
            <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xl" aria-hidden="true" />
            {t('organigramme.voir_officiel')}
          </a>
          <p className="mt-4 text-sm text-blue-600 hidden sm:block">{t('organigramme.nouvel_onglet')}</p>
          <p className="mt-2 text-sm text-blue-700" role="status" aria-live="polite">
            {t('organigramme.redirection_notice')}
          </p>
          <p className="mt-3 text-xs text-blue-500 sm:hidden">{t('organigramme.mobile_rappel')}</p>
        </section>
      </div>

      {/* Panneau Actualités */}
      <div
        role="tabpanel"
        id="panel-actualites"
        aria-labelledby="tab-actualites"
        hidden={activeTab !== 'actualites'}
        className="animate-fade-in"
      >
        <section className="p-6 bg-blue-50 border border-blue-200 rounded-xl text-center" aria-labelledby="actualites-officielles-title">
          <div className="mb-6">
            <h2 id="actualites-officielles-title" className="text-2xl font-bold text-blue-900 flex items-center justify-center gap-3">
              <FontAwesomeIcon icon={faNewspaper} className="text-blue-700" />
              {t('ministere.choix_actualites')}
            </h2>
            <p className="mt-2 text-blue-700">{t('ministere.desc_actualites')}</p>
          </div>
          <p className="text-center text-blue-800 mb-6 text-lg">
            {t('ministere.actualites.voir_officiel')}
          </p>
          <a
            href={EXTERNAL_URLS.OFFICIAL_ACTUALITES}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-lg rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label={`${t('ministere.actualites.voir_officiel')} — ${t('ministere.actualites.nouvel_onglet')} — ${t('ministere.actualites.site_officiel')}`}
          >
            <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xl" aria-hidden="true" />
            {t('ministere.actualites.voir_officiel')}
          </a>
          <p className="mt-4 text-sm text-blue-600 hidden sm:block">{t('ministere.actualites.nouvel_onglet')}</p>
          <p className="mt-2 text-sm text-blue-700" role="status" aria-live="polite">
            {t('ministere.actualites.redirection_notice')}
          </p>
          <p className="mt-1 text-sm text-blue-700" role="status" aria-live="polite">
            {t('ministere.actualites.erreur_chargement')}
          </p>
          <p className="mt-3 text-xs text-blue-500 sm:hidden">{t('ministere.actualites.mobile_rappel')}</p>
        </section>
      </div>
    </div>
  );
};

export default MinisterePage;