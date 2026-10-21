/**
 * Carte de chiffre clé (statistiques) : valeur très grande, libellé clair,
 * aide/comparaison facultatives en petite ligne. Squelette de chargement à la
 * forme de la carte. La couleur seule ne porte jamais l'information.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const StatCard = ({ valeur, libelle, icone, aide, comparaison, chargement = false }) => {
  const { t } = useTranslation();

  if (chargement) {
    return (
      <div
        className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse"
        role="status"
        aria-live="polite"
      >
        <div className="h-9 w-24 bg-gray-200 rounded" aria-hidden="true" />
        <div className="h-4 w-36 bg-gray-200 rounded mt-3" aria-hidden="true" />
        <div className="h-3 w-44 bg-gray-100 rounded mt-2" aria-hidden="true" />
        <span className="sr-only">{t('stats.chargement')}</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        {icone && (
          <span className="shrink-0 text-blue-800 bg-blue-50 rounded-lg p-2.5" aria-hidden="true">
            <FontAwesomeIcon icon={icone} />
          </span>
        )}
        {/* tabular-nums : valeurs qui ne « dansent » pas au rafraîchissement */}
        <p className="text-3xl font-bold text-gray-900 tabular-nums leading-none break-words">
          {valeur}
        </p>
      </div>
      <p className="text-sm font-medium text-gray-700 mt-2">{libelle}</p>
      {aide && <p className="text-xs text-gray-500 mt-1">{aide}</p>}
      {comparaison && <p className="text-xs text-gray-600 mt-auto pt-2">{comparaison}</p>}
    </div>
  );
};

export default StatCard;
