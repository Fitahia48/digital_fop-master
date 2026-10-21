/**
 * Compteur de visiteurs du jour (tableau de bord administrateur).
 *
 * - Même donnée, même API, même intervalle de 5 s qu'avant
 *   (GET /api/visit-statistics/ → visits_today).
 * - Libellé explicite (« remis à zéro chaque nuit ») + indicateur « en
 *   direct » discret (point vert + texte, jamais la couleur seule).
 * - Animations calmes : pulsation du point uniquement, désactivée sous
 *   `prefers-reduced-motion` (classe Tailwind motion-reduce:animate-none).
 * - Format « 1 234 » selon la langue (source unique stats/formats.js).
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axiosInstance from './AxiosConfig';
import { formatNombre } from './stats/formats';

const RealTimeVisitors = () => {
  const { t, i18n } = useTranslation();
  // null = pas encore de donnée chargée (jamais de « NaN » à l'écran).
  const [visiteurs, setVisiteurs] = useState(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let actif = true;

    const fetchVisitors = async () => {
      try {
        const res = await axiosInstance.get('/api/visit-statistics/');
        if (!actif) return;
        setVisiteurs(res.data.visits_today ?? 0);
        setErreur(false);
      } catch (error) {
        console.error('Erreur lors de la récupération des visiteurs en temps réel :', error);
        // On conserve la dernière valeur connue (pas de clignotement d'erreur).
        if (actif) setErreur(true);
      }
    };

    // Chargement immédiat puis rafraîchissement à l'intervalle EXISTANT (5 s).
    fetchVisitors();
    const interval = setInterval(fetchVisitors, 5000);
    return () => {
      actif = false;
      clearInterval(interval);
    };
  }, []);

  const affiche =
    visiteurs !== null ? formatNombre(i18n.language, visiteurs) : erreur ? '—' : '0';

  return (
    <div className="inline-flex items-center gap-4 bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t('accueil.visitors_today')}
        </p>
        <p className="text-2xl font-bold text-gray-900 tabular-nums leading-tight">{affiche}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{t('stats.compteur_aide')}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 whitespace-nowrap">
        <span
          className="h-2 w-2 rounded-full bg-green-500 animate-pulse motion-reduce:animate-none"
          aria-hidden="true"
        />
        {t('stats.en_direct')}
      </span>
    </div>
  );
};

export default RealTimeVisitors;
