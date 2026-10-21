/**
 * Panneau « Corps » (ex-StatistiqueDocs, volet organismes).
 *
 * - Mêmes données, mêmes API : /api/corps-stats/ (total + par nom),
 *   /api/corps-stats1/ (ajouts journalier/mensuel/annuel + plage de dates),
 *   /api/most-visited-corps/ (corps les plus consultés).
 * - Barres horizontales triées, tableau stylé avec tri/Voir plus/top 3,
 *   états chargement/vide/erreur, libellés i18n dans les 3 langues.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar } from 'react-chartjs-2';
import { faBuilding, faPlus } from '@fortawesome/free-solid-svg-icons';
import axiosInstance from '../AxiosConfig';
import StatCard from './StatCard';
import StatSection from './StatSection';
import ChartCard from './ChartCard';
import StatsTable from './StatsTable';
import PeriodSelector from './PeriodSelector';
import HelpRead from './HelpRead';
import {
  PALETTE,
  optionsBarres,
  pluginValeurFin,
  formatNombre,
  dateCourte,
} from './chartConfig';

/**
 * Liste des noms de corps — MÊMES valeurs que l'ancien écran (inchangées,
 * valeur = clé utilisée par l'API /api/corps-stats?nom=…).
 */
const CORPS_NOM = [
  { value: 'Administration Publique', label: 'Administration Publique' },
  { value: 'Administration Judiciaire', label: 'Administration Judiciaire' },
  { value: 'Administration Pénitentiaire', label: 'Administration Pénitentiaire' },
  { value: 'Agriculture-Elevage - Pêche', label: 'Agriculture-Élevage - Pêche' },
  { value: 'Chercheur enseignant et Enseignement chercheur', label: 'Chercheur enseignant et Enseignement chercheur' },
  { value: 'Communication médiatisée', label: 'Communication médiatisée' },
  { value: 'Diplomatie', label: 'Diplomatie' },
  { value: 'Domaine-Topographie', label: 'Domaine-Topographie' },
  { value: 'Environnement - Eaux et Forêts', label: 'Environnement - Eaux et Forêts' },
  { value: 'Économie, Finances et Plan', label: 'Économie, Finances et Plan' },
  { value: "Inspection de l'Etat", label: "Inspection de l'État" },
  { value: 'Forces Armées', label: 'Forces Armées' },
  { value: 'Jeunesse et Sports', label: 'Jeunesse et Sport' },
  { value: 'Météorologie', label: 'Météorologie' },
  { value: 'Planification', label: 'Planification' },
  { value: 'Police nationale', label: 'Police nationale' },
  { value: 'Poste et Télécommunications', label: 'Poste et Télécommunications' },
  { value: 'Travail et Lois Sociales', label: 'Travail et Lois Sociales' },
  { value: 'Corps transversaux', label: 'Corps transversaux' },
  { value: 'Travaux publics, Habitat et Aménagement', label: 'Travaux publics, Habitat et Aménagement' },
  { value: 'Transports', label: 'Transports' },
  { value: 'Santé Publique', label: 'Santé Publique' },
];

const CorpsPanel = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [totalCorps, setTotalCorps] = useState(null);
  const [statutTotaux, setStatutTotaux] = useState('loading');
  const [ajouts, setAjouts] = useState({ daily: 0, monthly: 0, yearly: 0 });
  const [statutAjouts, setStatutAjouts] = useState('loading');
  const [periode, setPeriode] = useState('daily'); // défaut identique à l'ancien écran
  const [dates, setDates] = useState({ debut: '', fin: '' });
  const [nomChoisi, setNomChoisi] = useState('');
  const [resultatNom, setResultatNom] = useState({ statut: 'idle', valeur: 0 });
  const [consultes, setConsultes] = useState([]);
  const [statutConsultes, setStatutConsultes] = useState('loading');
  const [tentative, setTentative] = useState(0);

  const periodeAPI = periode === 'personnalisee' ? 'daily' : periode;

  // Total des corps (montée unique, comme l'ancien écran).
  useEffect(() => {
    let actif = true;
    setStatutTotaux('loading');
    axiosInstance
      .get('/api/corps-stats/')
      .then((res) => {
        if (!actif) return;
        setTotalCorps(res.data.total_corps ?? 0);
        setStatutTotaux('ready');
      })
      .catch((error) => {
        console.error('Erreur lors de la récupération du total des corps :', error);
        if (!actif) return;
        setTotalCorps(null);
        setStatutTotaux('error');
      });
    return () => {
      actif = false;
    };
  }, [tentative]);

  // Ajouts de corps (même logique de paramètres que l'ancien écran).
  useEffect(() => {
    let actif = true;
    setStatutAjouts('loading');
    const params = { period: periodeAPI };
    if (periodeAPI === 'daily') {
      params.start_date = dates.debut;
      params.end_date = dates.fin;
    }
    axiosInstance
      .get('/api/corps-stats1/', { params })
      .then((res) => {
        if (!actif) return;
        setAjouts({
          daily: res.data.daily_count || 0,
          monthly: res.data.monthly_count || 0,
          yearly: res.data.yearly_count || 0,
        });
        setStatutAjouts('ready');
      })
      .catch((error) => {
        console.error('Erreur lors de la récupération des statistiques :', error);
        if (!actif) return;
        setAjouts({ daily: 0, monthly: 0, yearly: 0 });
        setStatutAjouts('error');
      });
    return () => {
      actif = false;
    };
  }, [periodeAPI, dates.debut, dates.fin, tentative]);

  // Corps les plus consultés.
  useEffect(() => {
    let actif = true;
    setStatutConsultes('loading');
    axiosInstance
      .get('/api/most-visited-corps/')
      .then((res) => {
        if (!actif) return;
        setConsultes(Array.isArray(res.data) ? res.data : []);
        setStatutConsultes('ready');
      })
      .catch((error) => {
        console.error('Erreur lors de la récupération des corps les plus consultés :', error);
        if (!actif) return;
        setConsultes([]);
        setStatutConsultes('error');
      });
    return () => {
      actif = false;
    };
  }, [tentative]);

  // Comptage par nom de corps.
  const changerNom = (event) => {
    const nom = event.target.value;
    setNomChoisi(nom);
    if (!nom) {
      setResultatNom({ statut: 'idle', valeur: 0 });
      return;
    }
    setResultatNom({ statut: 'loading', valeur: 0 });
    axiosInstance
      .get('/api/corps-stats/', { params: { nom } })
      .then((res) => setResultatNom({ statut: 'ready', valeur: res.data.count || 0 }))
      .catch(() => setResultatNom({ statut: 'error', valeur: 0 }));
  };

  // Phrase d'aide de la carte « Ajouts » : la période réellement affichée.
  const phraseAjouts = (() => {
    if (periodeAPI === 'monthly') return t('stats.ajouts_ce_mois');
    if (periodeAPI === 'yearly') return t('stats.ajouts_cette_annee');
    if (periode === 'personnalisee') {
      if (dates.debut && dates.fin) {
        return t('stats.ajouts_du_au', {
          debut: dateCourte(lang, dates.debut),
          fin: dateCourte(lang, dates.fin),
        });
      }
      if (dates.debut) return t('stats.ajouts_depuis', { debut: dateCourte(lang, dates.debut) });
      if (dates.fin) return t('stats.ajouts_jusqua', { fin: dateCourte(lang, dates.fin) });
    }
    return t('stats.ajout_aujourdhui');
  })();

  const barres = useMemo(() => {
    const brut = [
      { label: t('stats.p_journalier'), valeur: ajouts.daily },
      { label: t('stats.p_mensuel'), valeur: ajouts.monthly },
      { label: t('stats.p_annuel'), valeur: ajouts.yearly },
    ];
    return brut.sort((a, b) => b.valeur - a.valeur);
  }, [ajouts, t]);

  const options = useMemo(
    () =>
      optionsBarres({
        langue: lang,
        axeX: t('stats.axe_nombre'),
        axeY: t('stats.axe_periode'),
      }),
    [lang, t]
  );
  const plugin = useMemo(() => pluginValeurFin(lang), [lang]);

  const valeurAjouts =
    periodeAPI === 'daily' ? ajouts.daily : periodeAPI === 'monthly' ? ajouts.monthly : ajouts.yearly;

  const presets = useMemo(
    () => [
      { id: 'daily', libelle: t('stats.p_journalier') },
      { id: 'monthly', libelle: t('stats.p_mensuel') },
      { id: 'yearly', libelle: t('stats.p_annuel') },
    ],
    [t]
  );

  const enChargementTotaux = statutTotaux === 'loading';
  const erreurAjouts = statutAjouts === 'error';
  const tousAJour = statutAjouts === 'ready' && barres.every((b) => Number(b.valeur) === 0);
  const reessayer = () => setTentative((n) => n + 1);

  const colonnesConsultes = useMemo(
    () => [
      { cle: 'nom', libelle: t('stats.col_corps'), type: 'texte' },
      { cle: 'numero', libelle: t('stats.col_numero'), type: 'texte' },
      { cle: 'visits', libelle: t('stats.col_visites'), type: 'nombre' },
    ],
    [t]
  );

  return (
    <div>
      <HelpRead titre={t('stats.corps_aide_titre')}>
        <p>{t('stats.corps_aide_1')}</p>
        <p>{t('stats.corps_aide_2')}</p>
        <p>{t('stats.corps_aide_3')}</p>
      </HelpRead>

      <div className="flex justify-end mb-4">
        <PeriodSelector
          presets={presets}
          valeur={periode}
          onChange={setPeriode}
          dates={dates}
          onDatesChange={setDates}
          afficherPersonnalisee
          libelleGroupe={t('stats.periode_ajouts_groupe')}
        />
      </div>

      {/* Cartes de chiffres clés */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard
          chargement={enChargementTotaux}
          icone={faBuilding}
          valeur={
            statutTotaux === 'error' || totalCorps === null
              ? '—'
              : formatNombre(lang, totalCorps)
          }
          libelle={t('stats.total_corps')}
          aide={t('stats.total_corps_aide')}
        />
        <StatCard
          chargement={statutAjouts === 'loading'}
          icone={faPlus}
          valeur={erreurAjouts ? '—' : formatNombre(lang, valeurAjouts)}
          libelle={t('stats.ajouts_corps')}
          aide={phraseAjouts}
        />
      </div>

      {/* Répartition par nom de corps */}
      <StatSection
        id="stats-corps-repartition"
        titre={t('stats.repartition_corps_titre')}
        aide={t('stats.repartition_corps_aide')}
        className="mb-5"
      >
        <label htmlFor="stats-corps-select" className="block text-sm font-medium text-gray-700 mb-2">
          {t('stats.select_corps')}
        </label>
        <select
          id="stats-corps-select"
          value={nomChoisi}
          onChange={changerNom}
          className="block w-full sm:max-w-md rounded-lg border border-gray-300 shadow-sm px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
        >
          <option value="">{t('stats.choisir_corps')}</option>
          {CORPS_NOM.map((corps) => (
            <option key={corps.value} value={corps.value}>
              {corps.label}
            </option>
          ))}
        </select>

        {resultatNom.statut !== 'idle' && (
          <div className="mt-4 max-w-md">
            <StatCard
              chargement={resultatNom.statut === 'loading'}
              valeur={resultatNom.statut === 'error' ? '—' : formatNombre(lang, resultatNom.valeur)}
              libelle={nomChoisi}
              aide={t('stats.nombre_corps_aide')}
            />
          </div>
        )}
      </StatSection>

      {/* Ajouts de corps par période */}
      <ChartCard
        id="stats-corps-ajouts"
        titre={t('stats.corps_ajouts_titre')}
        aide={t('stats.corps_ajouts_aide')}
        chargement={statutAjouts === 'loading'}
        erreur={erreurAjouts ? t('stats.erreur') : null}
        vide={tousAJour}
        onReessayer={reessayer}
        hauteur="h-56"
        resume={
          statutAjouts === 'ready'
            ? `${t('stats.corps_ajouts_titre')} : ${barres
                .map((b) => `${b.label} = ${formatNombre(lang, b.valeur)}`)
                .join(' · ')}`
            : ''
        }
      >
        <Bar
          data={{
            labels: barres.map((b) => b.label),
            datasets: [
              {
                label: t('stats.ajouts_corps'),
                data: barres.map((b) => b.valeur),
                backgroundColor: PALETTE.bleu,
                hoverBackgroundColor: PALETTE.bleuClair,
              },
            ],
          }}
          options={options}
          plugins={[plugin]}
        />
      </ChartCard>

      {/* Corps les plus consultés */}
      <StatSection
        id="stats-corps-consultes"
        titre={t('stats.corps_consultes_titre')}
        aide={t('stats.corps_consultes_aide')}
        className="mt-5"
      >
        {statutConsultes === 'loading' && (
          <div className="animate-pulse" role="status" aria-live="polite">
            <div className="h-8 bg-gray-100 rounded mb-2" aria-hidden="true" />
            <div className="h-8 bg-gray-100 rounded mb-2" aria-hidden="true" />
            <div className="h-8 bg-gray-100 rounded" aria-hidden="true" />
            <span className="sr-only">{t('stats.chargement')}</span>
          </div>
        )}
        {statutConsultes === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-5 text-center" role="alert">
            <p className="text-sm text-red-700 mb-3">{t('stats.erreur')}</p>
            <button
              type="button"
              onClick={reessayer}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              {t('stats.reessayer')}
            </button>
          </div>
        )}
        {statutConsultes === 'ready' && (
          <StatsTable
            colonnes={colonnesConsultes}
            lignes={consultes}
            caption={t('stats.corps_consultes_titre')}
            meta={{ nom: 'visits' }}
            vide={t('stats.corps_consultes_vide')}
          />
        )}
      </StatSection>
    </div>
  );
};

export default CorpsPanel;
