import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt, faCircleCheck } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  // Terme brut recherché (searchValue prioritaire sur queryEncoded déjà encodé)
  const termeRecherche = searchValue || (queryEncoded ? decodeURIComponent(queryEncoded) : '');

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

  // Fallback : aucun résultat web — ne rien afficher
  return null;
};

export default WebSearchResult;
