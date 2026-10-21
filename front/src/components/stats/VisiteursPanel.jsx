/**
 * Panneau « Visiteurs » (ex-VisitStatistics) — administrateur.
 *
 * - Mêmes données, même API : GET /api/visit-statistics/ (start_date/end_date).
 * - Cartes de chiffres clés (aujourd'hui / visiteurs différents / visites),
 *   courbe lisse 2 séries, sélecteur de période aligné sur l'API.
 * - La ligne « objectif 200 » a été SUPPRIMÉE (décision validée) : aucune
 *   valeur calculée hors des données existantes.
 * - Graphiques en lazy loading via AdminStats ; états chargement/vide/erreur
 *   (Réessayer) ; résumé textuel pour lecteur d'écran.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { faUserGroup, faEye, faCalendarDay } from '@fortawesome/free-solid-svg-icons';
import axiosInstance from '../AxiosConfig';
import StatCard from './StatCard';
import ChartCard from './ChartCard';
import PeriodSelector from './PeriodSelector';
import HelpRead from './HelpRead';
import { PALETTE, optionsCourbe, formatNombre, resumeCourbe } from './chartConfig';

const FUSEAU = 'Indian/Antananarivo';
const iso = (date) => date.toLocaleDateString('sv-SE', { timeZone: FUSEAU });
const reculer = (jours) => iso(new Date(Date.now() - jours * 86_400_000));

const VIDE = {
  totalVisits: 0,
  uniqueVisitors: 0,
  totalVisitsPerDay: [],
  uniqueVisitorsPerDay: [],
  visitsToday: 0,
};

const VisiteursPanel = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [data, setData] = useState(VIDE);
  const [statut, setStatut] = useState('loading'); // loading | ready | error
  const [periode, setPeriode] = useState('tout'); // défaut historique = aucun filtre
  const [dates, setDates] = useState({ debut: '', fin: '' });
  const [tentative, setTentative] = useState(0);

  const charger = useCallback(async () => {
    setStatut('loading');
    const aujourdhui = iso(new Date());
    // Mêmes paramètres que l'ancien écran (les chaînes vides étaient envoyées
    // telles quelles) : aucun changement de comportement côté API.
    const params = { start_date: '', end_date: '' };
    if (periode === 'aujourdhui') {
      params.start_date = aujourdhui;
      params.end_date = aujourdhui;
    } else if (periode === 'jours7') {
      params.start_date = reculer(6);
      params.end_date = aujourdhui;
    } else if (periode === 'jours30') {
      params.start_date = reculer(29);
      params.end_date = aujourdhui;
    } else if (periode === 'personnalisee') {
      params.start_date = dates.debut;
      params.end_date = dates.fin;
    }
    try {
      const { data: stats } = await axiosInstance.get('/api/visit-statistics/', { params });
      setData({
        totalVisits: stats.total_visits || 0,
        uniqueVisitors: stats.unique_visitors || 0,
        totalVisitsPerDay: stats.total_visits_per_day || [],
        uniqueVisitorsPerDay: stats.unique_visitors_per_day || [],
        visitsToday: stats.visits_today || 0,
      });
      setStatut('ready');
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques :', error);
      setData(VIDE);
      setStatut('error');
    }
  }, [periode, dates.debut, dates.fin, tentative]);

  useEffect(() => {
    charger();
  }, [charger]);

  const labels = useMemo(
    () => data.totalVisitsPerDay.map((v) => v.visit_date),
    [data.totalVisitsPerDay]
  );

  // Les deux séries sont associées par DATE (et non par position) : si un jour
  // manque dans une série, aucune valeur n'est décalée.
  const valeursVisiteurs = useMemo(() => {
    const parDate = new Map(
      data.uniqueVisitorsPerDay.map((v) => [String(v.visit_date).slice(0, 10), v.count])
    );
    return labels.map((l, i) => {
      const cle = String(l).slice(0, 10);
      if (parDate.has(cle)) return parDate.get(cle);
      const brut = data.uniqueVisitorsPerDay[i]?.count;
      return Number.isFinite(Number(brut)) ? Number(brut) : 0;
    });
  }, [labels, data.uniqueVisitorsPerDay]);

  const valeursVisites = useMemo(
    () => labels.map((_, i) => Number(data.totalVisitsPerDay[i]?.count) || 0),
    [labels, data.totalVisitsPerDay]
  );

  const serieVide =
    data.totalVisitsPerDay.length === 0 && data.uniqueVisitorsPerDay.length === 0;

  // Comparaison « hier » uniquement si la donnée existe réellement.
  const hier = iso(new Date(Date.now() - 86_400_000));
  const entreeHier = data.uniqueVisitorsPerDay.find(
    (v) => String(v.visit_date).slice(0, 10) === hier
  );
  const comparaisonHier = entreeHier
    ? t('stats.comparaison_hier', { n: formatNombre(lang, entreeHier.count) })
    : null;

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: t('stats.serie_visiteurs'),
          data: valeursVisiteurs,
          borderColor: PALETTE.bleu,
          backgroundColor: PALETTE.bleu,
        },
        {
          label: t('stats.serie_visites'),
          data: valeursVisites,
          borderColor: PALETTE.grisFonce,
          backgroundColor: PALETTE.grisFonce,
        },
      ],
    }),
    [labels, valeursVisiteurs, valeursVisites, t]
  );

  const options = useMemo(
    () =>
      optionsCourbe({
        langue: lang,
        axeX: t('stats.axe_date'),
        axeY: t('stats.axe_nombre'),
        legende: true,
        labelsDates: true,
      }),
    [lang, t]
  );

  const resume = serieVide
    ? ''
    : [
        resumeCourbe(lang, t('stats.serie_visiteurs'), labels, valeursVisiteurs),
        resumeCourbe(lang, t('stats.serie_visites'), labels, valeursVisites),
      ].join(' · ');

  const presets = useMemo(
    () => [
      { id: 'tout', libelle: t('stats.periode_tout') },
      { id: 'aujourdhui', libelle: t('stats.periode_aujourdhui') },
      { id: 'jours7', libelle: t('stats.periode_jours7') },
      { id: 'jours30', libelle: t('stats.periode_jours30') },
    ],
    [t]
  );

  const enChargement = statut === 'loading';
  const enErreur = statut === 'error';

  return (
    <div>
      <HelpRead titre={t('stats.visiteurs_aide_titre')}>
        <p>{t('stats.visiteurs_aide_1')}</p>
        <p>{t('stats.visiteurs_aide_2')}</p>
        <p>{t('stats.visiteurs_aide_3')}</p>
      </HelpRead>

      <div className="flex justify-end mb-4">
        <PeriodSelector
          presets={presets}
          valeur={periode}
          onChange={setPeriode}
          dates={dates}
          onDatesChange={setDates}
          afficherPersonnalisee
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard
          chargement={enChargement}
          icone={faCalendarDay}
          valeur={enErreur ? '—' : formatNombre(lang, data.visitsToday)}
          libelle={t('stats.visiteurs_aujourdhui')}
          aide={t('stats.visiteurs_aujourdhui_aide')}
          comparaison={!enErreur && !enChargement ? comparaisonHier : null}
        />
        <StatCard
          chargement={enChargement}
          icone={faUserGroup}
          valeur={enErreur ? '—' : formatNombre(lang, data.uniqueVisitors)}
          libelle={t('stats.visiteurs_differents')}
          aide={t('stats.visiteurs_differents_aide')}
        />
        <StatCard
          chargement={enChargement}
          icone={faEye}
          valeur={enErreur ? '—' : formatNombre(lang, data.totalVisits)}
          libelle={t('stats.visites_totales')}
          aide={t('stats.visites_totales_aide')}
        />
      </div>

      {enErreur && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-5 mb-5" role="alert">
          <p className="text-sm text-red-700 mb-3">{t('stats.erreur')}</p>
          <button
            type="button"
            onClick={() => setTentative((n) => n + 1)}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          >
            {t('stats.reessayer')}
          </button>
        </div>
      )}

      <ChartCard
        id="stats-visiteurs-courbe"
        titre={t('stats.visiteurs_courbe_titre')}
        aide={t('stats.visiteurs_courbe_aide')}
        chargement={enChargement}
        erreur={enErreur ? t('stats.erreur') : null}
        vide={!enChargement && !enErreur && serieVide}
        onReessayer={() => setTentative((n) => n + 1)}
        resume={resume}
      >
        <Line data={chartData} options={options} />
      </ChartCard>
    </div>
  );
};

export default VisiteursPanel;
