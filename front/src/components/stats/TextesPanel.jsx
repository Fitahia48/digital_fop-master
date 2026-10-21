/**
 * Panneau « Textes » (ex-StatistiqueDocs, volet documents).
 *
 * - Mêmes données, mêmes API : /api/document-stats/ (total + par type),
 *   /api/documents-stats/ (ajouts journalier/mensuel/annuel + plage de dates).
 * - Total global (documents + corps) conservé, répartitions par type avec
 *   LIBELLÉS i18n (plus de valeur brute « loi_organique » affichée).
 * - Graphique : barres HORIZONTALES triées du plus grand au plus petit
 *   (décision validée) — l'ancien écran affichait des courbes inadaptées.
 * - Sélecteur de période cohérent + états chargement/vide/erreur.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar } from 'react-chartjs-2';
import { faFileLines, faLayerGroup, faPlus } from '@fortawesome/free-solid-svg-icons';
import axiosInstance from '../AxiosConfig';
import { DOCUMENT_TYPES, documentTypeLabel } from '../../utils/documentTypes';
import StatCard from './StatCard';
import StatSection from './StatSection';
import ChartCard from './ChartCard';
import PeriodSelector from './PeriodSelector';
import HelpRead from './HelpRead';
import {
  PALETTE,
  optionsBarres,
  pluginValeurFin,
  formatNombre,
  dateCourte,
} from './chartConfig';

const TextesPanel = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [totaux, setTotaux] = useState({ documents: null, corps: null });
  const [statutTotaux, setStatutTotaux] = useState('loading');
  const [ajouts, setAjouts] = useState({ daily: 0, monthly: 0, yearly: 0 });
  const [statutAjouts, setStatutAjouts] = useState('loading');
  // Période par défaut identique à l'ancien écran : « daily ».
  const [periode, setPeriode] = useState('daily');
  const [dates, setDates] = useState({ debut: '', fin: '' });
  const [typeChoisi, setTypeChoisi] = useState('');
  const [resultatType, setResultatType] = useState({ statut: 'idle', valeur: 0 });
  const [tentative, setTentative] = useState(0);

  const periodeAPI = periode === 'personnalisee' ? 'daily' : periode;

  // Totaux (documents + corps) — montée comme l'ancien écran.
  useEffect(() => {
    let actif = true;
    setStatutTotaux('loading');
    Promise.all([
      axiosInstance.get('/api/document-stats/'),
      axiosInstance.get('/api/corps-stats/'),
    ])
      .then(([docs, corps]) => {
        if (!actif) return;
        setTotaux({
          documents: docs.data.total_documents ?? 0,
          corps: corps.data.total_corps ?? 0,
        });
        setStatutTotaux('ready');
      })
      .catch((error) => {
        console.error('Erreur lors de la récupération des totaux :', error);
        if (!actif) return;
        setTotaux({ documents: null, corps: null });
        setStatutTotaux('error');
      });
    return () => {
      actif = false;
    };
  }, [tentative]);

  // Ajouts (documents) — même logique de paramètres que l'ancien écran.
  useEffect(() => {
    let actif = true;
    setStatutAjouts('loading');
    const params = { period: periodeAPI };
    if (periodeAPI === 'daily') {
      params.start_date = dates.debut;
      params.end_date = dates.fin;
    }
    axiosInstance
      .get('/api/documents-stats/', { params })
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

  // Comptage par type de texte (libellé affiché, jamais la valeur brute).
  const changerType = useCallback(
    (event) => {
      const type = event.target.value;
      setTypeChoisi(type);
      if (!type) {
        setResultatType({ statut: 'idle', valeur: 0 });
        return;
      }
      setResultatType({ statut: 'loading', valeur: 0 });
      axiosInstance
        .get('/api/document-stats/', { params: { type } })
        .then((res) => setResultatType({ statut: 'ready', valeur: res.data.count || 0 }))
        .catch(() => setResultatType({ statut: 'error', valeur: 0 }));
    },
    []
  );

  const totalTextes =
    statutTotaux === 'ready' && totaux.documents !== null && totaux.corps !== null
      ? totaux.documents + totaux.corps
      : null;

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

  // Barres horizontales triées du plus grand au plus petit.
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
  const tousAJour =
    statutAjouts === 'ready' && barres.every((b) => Number(b.valeur) === 0);

  const reessayer = () => setTentative((n) => n + 1);

  return (
    <div>
      <HelpRead titre={t('stats.textes_aide_titre')}>
        <p>{t('stats.textes_aide_1')}</p>
        <p>{t('stats.textes_aide_2')}</p>
        <p>{t('stats.textes_aide_3')}</p>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <StatCard
          chargement={enChargementTotaux}
          icone={faLayerGroup}
          valeur={statutTotaux === 'error' || totalTextes === null ? '—' : formatNombre(lang, totalTextes)}
          libelle={t('stats.total_textes')}
          aide={t('stats.total_textes_aide')}
        />
        <StatCard
          chargement={enChargementTotaux}
          icone={faFileLines}
          valeur={
            statutTotaux === 'error' || totaux.documents === null
              ? '—'
              : formatNombre(lang, totaux.documents)
          }
          libelle={t('stats.total_documents')}
        />
        <StatCard
          chargement={statutAjouts === 'loading'}
          icone={faPlus}
          valeur={erreurAjouts ? '—' : formatNombre(lang, valeurAjouts)}
          libelle={t('stats.ajouts_documents')}
          aide={phraseAjouts}
        />
      </div>

      {/* Répartition par type de texte — libellés, jamais de valeurs brutes */}
      <StatSection
        id="stats-textes-repartition"
        titre={t('stats.repartition_type_titre')}
        aide={t('stats.repartition_type_aide')}
        className="mb-5"
      >
        <label
          htmlFor="stats-type-select"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          {t('stats.select_type')}
        </label>
        <select
          id="stats-type-select"
          value={typeChoisi}
          onChange={changerType}
          className="block w-full sm:max-w-md rounded-lg border border-gray-300 shadow-sm px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
        >
          <option value="">{t('stats.choisir_type')}</option>
          {DOCUMENT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {documentTypeLabel(type.value, t)}
            </option>
          ))}
        </select>

        {resultatType.statut !== 'idle' && (
          <div className="mt-4 max-w-md">
            <StatCard
              chargement={resultatType.statut === 'loading'}
              valeur={
                resultatType.statut === 'error'
                  ? '—'
                  : formatNombre(lang, resultatType.valeur)
              }
              libelle={documentTypeLabel(typeChoisi, t)}
              aide={t('stats.nombre_type_aide')}
            />
          </div>
        )}
      </StatSection>

      {/* Ajouts par période — barres horizontales triées */}
      <ChartCard
        id="stats-textes-ajouts"
        titre={t('stats.textes_ajouts_titre')}
        aide={t('stats.textes_ajouts_aide')}
        chargement={statutAjouts === 'loading'}
        erreur={erreurAjouts ? t('stats.erreur') : null}
        vide={tousAJour}
        onReessayer={reessayer}
        hauteur="h-56"
        resume={
          statutAjouts === 'ready'
            ? `${t('stats.textes_ajouts_titre')} : ${barres
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
                label: t('stats.ajouts_documents'),
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
    </div>
  );
};

export default TextesPanel;
