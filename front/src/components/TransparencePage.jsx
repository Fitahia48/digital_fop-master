/**
 * Page /transparence (authentifiée — verrou inchangé) — statistiques de
 * CONSULTATION des textes réglementaires.
 *
 * Réécrite sur les briques communes : l'en-tête, le message d'engagement et
 * la mention d'anonymat sont conservés ; le contenu des données est le
 * panneau « Consultations » PARTAGÉ avec l'onglet correspondant de
 * /admin/statistiques (même composant → mêmes données, mêmes chiffres).
 * Chargement en lazy : Chart.js n'est téléchargé qu'à l'ouverture de la page.
 */
import React, { Suspense, lazy, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faScaleBalanced, faLock } from '@fortawesome/free-solid-svg-icons';

const ConsultationsPanel = lazy(() => import('./stats/ConsultationsPanel'));

const TransparencePage = () => {
  const { t, i18n } = useTranslation();
  // maj_le est rapporté par le panneau (aucune requête supplémentaire).
  const [majLe, setMajLe] = useState(null);

  const formatDate = (valeur) => {
    if (!valeur) return '';
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Indian/Antananarivo',
      }).format(new Date(valeur));
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 mt-40 pb-16">
      <div className="max-w-5xl mx-auto px-4">
        {/* En-tête */}
        <div className="text-center pt-10 pb-8">
          <FontAwesomeIcon icon={faScaleBalanced} className="text-4xl text-blue-800 mb-3" />
          <h1 className="text-3xl font-bold text-gray-800">{t('transparence.titre')}</h1>
          <p className="text-gray-600 mt-2 max-w-2xl mx-auto">{t('transparence.sous_titre')}</p>
          <p className="text-sm text-gray-500 mt-1">{t('transparence.periode_cumul')}</p>
        </div>

        {/* Contenu partagé avec l'onglet « Consultations » des statistiques */}
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16" role="status">
              <span
                className="animate-spin rounded-full h-8 w-8 border-4 border-blue-800 border-t-transparent"
                aria-hidden="true"
              />
              <span className="sr-only">{t('common.chargement')}</span>
            </div>
          }
        >
          <ConsultationsPanel onStats={setMajLe} />
        </Suspense>

        {/* Engagement + mentions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-5">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">
            {t('transparence.engagement_titre')}
          </h2>
          <p className="text-gray-700 leading-relaxed">{t('transparence.engagement_texte')}</p>
          <p className="mt-3 text-sm text-gray-600 flex items-start gap-2">
            <FontAwesomeIcon icon={faLock} className="mt-1 shrink-0" />
            {t('transparence.anonymat')}
          </p>
          {majLe && (
            <p className="mt-2 text-xs text-gray-500">
              {t('transparence.maj_le', { date: formatDate(majLe) })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransparencePage;
