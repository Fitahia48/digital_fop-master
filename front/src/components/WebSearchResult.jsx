import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt, faCircleCheck } from '@fortawesome/free-solid-svg-icons';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { useTranslation } from 'react-i18next';
import { buildGoogleBooksUrl } from '../utils/googleBooks';

export const OfficialBadge = ({ label = 'Officiel MTeFOP' }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
    <FontAwesomeIcon icon={faCircleCheck} className="text-blue-600" />
    {label}
  </span>
);

const ExternalBadge = ({ label = 'Extérieur' }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
    <FontAwesomeIcon icon={faExternalLinkAlt} className="text-gray-500" />
    {label}
  </span>
);

const WebSearchResult = ({ webSearchAvailable, webItems = [], queryEncoded, searchValue }) => {
  const { t, i18n } = useTranslation();

  // Terme brut recherché (searchValue prioritaire sur queryEncoded déjà encodé)
  const termeRecherche = searchValue || (queryEncoded ? decodeURIComponent(queryEncoded) : '');
  // Lien externe → onglet Livres de Google ; null si le terme est vide (aucun lien affiché)
  const googleBooksUrl = buildGoogleBooksUrl(termeRecherche, i18n.language);

  if (webSearchAvailable && webItems.length > 0) {
    return (
      <section className="mt-6 w-full max-w-6xl">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-xl font-semibold text-gray-200">Résultats trouvés sur le web</h2>
          <ExternalBadge />
        </div>
        <div className="space-y-3">
          {webItems.map((item, index) => (
            <article
              key={item.link || index}
              className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-auto">
                  <p className="text-xs text-gray-500">{item.formattedUrl}</p>
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block w-fit break-words text-blue-800 hover:underline"
                  >
                    {item.title || item.displayLink}
                  </a>
                </div>
                <ExternalBadge />
              </div>

              {item.snippet && (
                <p className="text-sm text-gray-600 line-clamp-3">{item.snippet}</p>
              )}

              <p className="text-xs text-gray-400">
                Contenu provenant d'un site externe, non vérifié par le MTeFOP
              </p>
            </article>
          ))}
        </div>

        {webItems.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-gray-500">
            Aucun résultat web trouvé pour « {termeRecherche} ».
          </p>
        )}
      </section>
    );
  }

  // Fallback : recherche manuelle
  return (
    <section className="mt-6 w-full max-w-6xl">
      <h2 className="text-xl font-semibold text-gray-200 mb-3">{t('recherche.web_manuelle_titre')}</h2>

      <div className="rounded-lg border border-dashed border-gray-400 bg-gray-50 p-5 text-center">
        <div className="mx-auto mb-3 flex items-center justify-center gap-2 text-gray-500">
          <FontAwesomeIcon icon={faGoogle} className="text-3xl" />
          <span className="text-sm">{t('recherche.web_google_livres')}</span>
        </div>

        <p className="text-sm text-gray-600">
          {t('recherche.web_quota')}
        </p>

        {/* Lien masqué si le terme est vide : pas d'URL vide vers Google */}
        {googleBooksUrl && (
          <a
            href={googleBooksUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-800 px-5 py-2.5 text-sm font-medium text-white shadow transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <FontAwesomeIcon icon={faExternalLinkAlt} />
            {t('recherche.web_lien_google_livres')}
          </a>
        )}

        <p className="mt-3 text-xs text-gray-400">
          {t('recherche.web_aide_ouverture')}{' '}
          <span className="font-medium text-gray-600">
            {termeRecherche}
          </span>
        </p>
      </div>
    </section>
  );
};

export default WebSearchResult;
