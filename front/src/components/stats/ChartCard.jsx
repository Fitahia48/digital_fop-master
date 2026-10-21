/**
 * Carte contenant un graphique : titre (quoi), aide d'une ligne (comment lire),
 * états chargement (squelette à la forme du graphique) / vide (message utile) /
 * erreur (message + bouton Réessayer), résumé textuel pour lecteur d'écran.
 * Jamais de graphique vide ni de « NaN ».
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import StatSection from './StatSection';

const ChartCard = ({
  titre,
  aide,
  id,
  hauteur = 'h-72',
  chargement = false,
  erreur = null,
  vide = false,
  onReessayer,
  resume,
  children,
}) => {
  const { t } = useTranslation();

  return (
    <StatSection titre={titre} aide={aide} id={id}>
      {chargement ? (
        <div className="animate-pulse" role="status" aria-live="polite">
          <div className={`${hauteur} bg-gray-100 rounded-lg`} aria-hidden="true" />
          <div className="h-3 w-1/3 bg-gray-200 rounded mt-3" aria-hidden="true" />
          <span className="sr-only">{t('stats.chargement')}</span>
        </div>
      ) : erreur ? (
        <div
          className="flex flex-col items-center justify-center gap-3 bg-red-50 border border-red-200 rounded-lg p-6 text-center"
          role="alert"
        >
          <p className="text-sm text-red-700">{erreur}</p>
          {onReessayer && (
            <button
              type="button"
              onClick={onReessayer}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              {t('stats.reessayer')}
            </button>
          )}
        </div>
      ) : vide ? (
        <div
          className="flex items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-lg text-center"
          style={{ minHeight: '8rem' }}
          role="status"
        >
          <p className="text-sm text-gray-600 px-4">{t('stats.vide')}</p>
        </div>
      ) : (
        <>
          <div className={hauteur} role="img" aria-label={titre}>
            {children}
          </div>
          {/* Résumé textuel : alternative des graphiques importants */}
          {resume && <p className="sr-only">{resume}</p>}
        </>
      )}
    </StatSection>
  );
};

export default ChartCard;
