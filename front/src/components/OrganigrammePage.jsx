import React from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSitemap, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import { EXTERNAL_URLS } from '../config/externalLinks';

const OrganigrammePage = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Bloc site officiel — Option B: seulement le lien officiel */}
      <section className="mb-8 p-8 bg-blue-50 border border-blue-200 rounded-xl text-center" aria-labelledby="organigramme-officiel-title">
        <div className="mb-6">
          <h2 id="organigramme-officiel-title" className="text-3xl font-bold text-blue-900 flex items-center justify-center gap-3">
            <FontAwesomeIcon icon={faSitemap} className="text-blue-700" />
            {t('organigramme.titre_officiel')}
          </h2>
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
  );
};

export default OrganigrammePage;
