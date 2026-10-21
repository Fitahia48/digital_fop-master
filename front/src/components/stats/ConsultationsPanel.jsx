/**
 * Panneau « Consultations » (ex-TransparencePage, données + classements).
 *
 * - Mêmes données, mêmes API : /api/transparence/stats/ (cumulés, admin
 *   côté serveur) + /api/most-visited/ (documents les plus consultés).
 * - 4 cartes de chiffres clés, barres horizontales triées par type de texte
 *   (libellés i18n, jamais « loi_organique » brut), classements top consultés
 *   / top téléchargés / top documents avec tri + « Voir plus » + top 3.
 * - États chargement / vide / erreur (Réessayer) partout.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar } from 'react-chartjs-2';
import {
  faFileLines,
  faDownload,
  faScaleBalanced,
  faBookOpen,
} from '@fortawesome/free-solid-svg-icons';
import axiosInstance from '../AxiosConfig';
import { documentTypeLabel } from '../../utils/documentTypes';
import StatCard from './StatCard';
import StatSection from './StatSection';
import ChartCard from './ChartCard';
import StatsTable from './StatsTable';
import HelpRead from './HelpRead';
import {
  PALETTE,
  optionsBarres,
  pluginValeurFin,
  formatNombre,
} from './chartConfig';

/** Libellé d'un texte du top : « type numéro » (comme l'ancienne page). */
const libelleTexte = (l) => [l.type, l.numero].filter(Boolean).join(' ') || '—';

const ConsultationsPanel = ({ onStats = null }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [stats, setStats] = useState(null);
  // Rapport vers la page englobante (ex. date de maj) sans requête en plus :
  // stocké dans une ref pour ne jamais re-déclencher le chargement.
  const onStatsRef = useRef(onStats);
  useEffect(() => {
    onStatsRef.current = onStats;
  });
  const [statut, setStatut] = useState('loading'); // loading | ready | error
  const [consultes, setConsultes] = useState([]);
  const [statutConsultes, setStatutConsultes] = useState('loading');
  const [tentative, setTentative] = useState(0);

  const charger = useCallback(() => {
    setStatut('loading');
    axiosInstance
      .get('/api/transparence/stats/')
      .then((res) => {
        setStats(res.data);
        setStatut('ready');
        if (res.data?.maj_le) onStatsRef.current?.(res.data.maj_le);
      })
      .catch((err) => {
        console.error('Erreur chargement transparence :', err);
        setStats(null);
        setStatut('error');
      });
  }, []);

  const chargerConsultes = useCallback(() => {
    setStatutConsultes('loading');
    axiosInstance
      .get('/api/most-visited/')
      .then((res) => {
        setConsultes(Array.isArray(res.data) ? res.data : []);
        setStatutConsultes('ready');
      })
      .catch((err) => {
        console.error('Erreur documents les plus consultés :', err);
        setConsultes([]);
        setStatutConsultes('error');
      });
  }, []);

  useEffect(() => {
    charger();
    chargerConsultes();
  }, [charger, chargerConsultes, tentative]);

  const reessayer = () => setTentative((n) => n + 1);

  const parType = stats?.par_type || [];
  const topConsultes = stats?.top_consultes || [];
  const topTelecharges = stats?.top_telecharges || [];

  const cartes = [
    {
      cle: 'total_consultations',
      valeur: stats?.total_consultations ?? 0,
      icon: faFileLines,
      label: t('transparence.total_consultations'),
      aide: t('stats.consultations_carte_aide'),
    },
    {
      cle: 'total_telechargements',
      valeur: stats?.total_telechargements ?? 0,
      icon: faDownload,
      label: t('transparence.total_telechargements'),
      aide: t('stats.telechargements_carte_aide'),
    },
    {
      cle: 'documents_publies',
      valeur: stats?.documents_total ?? 0,
      icon: faScaleBalanced,
      label: t('transparence.documents_publies'),
    },
    {
      cle: 'documents_consultes',
      valeur: stats?.documents_consultes ?? 0,
      icon: faBookOpen,
      label: t('transparence.documents_consultes'),
    },
  ];

  // Barres horizontales triées du plus grand au plus petit, libellés i18n.
  const barres = useMemo(() => {
    const brut = parType.map((l) => ({
      label: documentTypeLabel(l.type, t),
      valeur: Number(l.consultations) || 0,
    }));
    return brut.sort((a, b) => b.valeur - a.valeur);
  }, [parType, t]);

  const options = useMemo(
    () =>
      optionsBarres({
        langue: lang,
        axeX: t('stats.axe_consultations'),
        axeY: t('stats.axe_type_texte'),
      }),
    [lang, t]
  );
  const plugin = useMemo(() => pluginValeurFin(lang), [lang]);

  const enChargement = statut === 'loading';
  const enErreur = statut === 'error';
  const vide = statut === 'ready' && (stats?.documents_total ?? 0) === 0;

  const colonnesParType = useMemo(
    () => [
      {
        cle: 'type',
        libelle: t('transparence.colonne_type'),
        type: 'texte',
        rendu: (l) => documentTypeLabel(l.type, t),
      },
      { cle: 'nombre', libelle: t('transparence.colonne_nombre'), type: 'nombre' },
      { cle: 'consultations', libelle: t('transparence.colonne_consultations'), type: 'nombre' },
      {
        cle: 'telechargements',
        libelle: t('transparence.colonne_telechargements'),
        type: 'nombre',
      },
    ],
    [t]
  );

  const colonnesTop = useCallback(
    (cleMetrique) => [
      { cle: 'texte', libelle: t('transparence.colonne_texte'), type: 'texte', rendu: libelleTexte },
      { cle: 'objet', libelle: t('transparence.colonne_objet'), type: 'texte' },
      {
        cle: cleMetrique,
        libelle: t(`transparence.colonne_${cleMetrique}`),
        type: 'nombre',
      },
    ],
    [t]
  );

  const colonnesConsultes = useMemo(
    () => [
      {
        cle: 'type',
        libelle: t('transparence.colonne_type'),
        type: 'texte',
        rendu: (l) => documentTypeLabel(l.type, t),
      },
      { cle: 'numero', libelle: t('stats.col_numero'), type: 'texte' },
      { cle: 'visits', libelle: t('stats.col_visites'), type: 'nombre' },
    ],
    [t]
  );

  return (
    <div>
      <HelpRead titre={t('stats.consultations_aide_titre')}>
        <p>{t('stats.consultations_aide_1')}</p>
        <p>{t('stats.consultations_aide_2')}</p>
        <p>{t('stats.consultations_aide_3')}</p>
      </HelpRead>

      {/* Cartes de chiffres clés */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {cartes.map((carte) => (
          <StatCard
            key={carte.cle}
            chargement={enChargement}
            icone={carte.icon}
            valeur={enErreur ? '—' : formatNombre(lang, carte.valeur)}
            libelle={carte.label}
            aide={carte.aide}
          />
        ))}
      </div>

      {enErreur && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-5 mb-5" role="alert">
          <p className="text-sm text-red-700 mb-3">{t('transparence.erreur')}</p>
          <button
            type="button"
            onClick={reessayer}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          >
            {t('stats.reessayer')}
          </button>
        </div>
      )}

      {!enChargement && !enErreur && stats?.indisponible && (
        <p className="text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5">
          {t('transparence.indisponible')}
        </p>
      )}

      {!enChargement && !enErreur && vide && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-600">{t('transparence.aucune_donnee')}</p>
        </div>
      )}

      {!enChargement && !enErreur && !vide && (
        <>
          {/* Classements top consultés / top téléchargés */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <StatSection
              id="stats-top-consultes"
              titre={t('transparence.top_consultes_titre')}
              aide={t('stats.top_consultes_aide')}
            >
              <StatsTable
                colonnes={colonnesTop('consultations')}
                lignes={topConsultes}
                caption={t('transparence.top_consultes_titre')}
                meta={{ nom: 'consultations' }}
                afficherInitialement={5}
                vide={t('transparence.aucune_donnee')}
              />
            </StatSection>
            <StatSection
              id="stats-top-telecharges"
              titre={t('transparence.top_telecharges_titre')}
              aide={t('stats.top_telecharges_aide')}
            >
              <StatsTable
                colonnes={colonnesTop('telechargements')}
                lignes={topTelecharges}
                caption={t('transparence.top_telecharges_titre')}
                meta={{ nom: 'telechargements' }}
                afficherInitialement={5}
                vide={t('transparence.aucune_donnee')}
              />
            </StatSection>
          </div>

          {/* Consultations par type de texte */}
          <ChartCard
            id="stats-consultations-type"
            titre={t('transparence.graphique_titre')}
            aide={t('stats.consultations_courbe_aide')}
            hauteur="h-72"
            vide={barres.length === 0}
            resume={
              barres.length
                ? `${t('transparence.graphique_titre')} : ${barres
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
                    label: t('transparence.graphique_legende'),
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

          {/* Tableau de répartition */}
          <StatSection
            id="stats-consultations-tableau"
            titre={t('transparence.tableau_titre')}
            className="mt-5"
          >
            <StatsTable
              colonnes={colonnesParType}
              lignes={parType}
              caption={t('transparence.tableau_titre')}
              triInitial={{ cle: 'consultations', sens: 'desc' }}
              meta={{ nom: 'consultations' }}
              afficherInitialement={10}
              vide={t('transparence.aucune_donnee')}
            />
          </StatSection>

          {/* Documents les plus consultés (ex-écran documents) */}
          <StatSection
            id="stats-consultations-documents"
            titre={t('stats.consultations_docs_titre')}
            aide={t('stats.consultations_docs_aide')}
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
              <div
                className="bg-red-50 border border-red-200 rounded-lg p-5 text-center"
                role="alert"
              >
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
                caption={t('stats.consultations_docs_titre')}
                meta={{ nom: 'visits' }}
                vide={t('stats.consultations_docs_vide')}
              />
            )}
          </StatSection>
        </>
      )}
    </div>
  );
};

export default ConsultationsPanel;
