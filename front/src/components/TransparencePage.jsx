import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faScaleBalanced,
  faFileLines,
  faClock,
  faCircleCheck,
  faLock,
} from '@fortawesome/free-solid-svg-icons';
import { Oval } from 'react-loader-spinner';
import axiosInstance from './AxiosConfig';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Valeurs acceptées par l'API (?periode=)
const PERIODES = ['mois', 'trimestre', 'annee'];

// ─── Jauge circulaire (SVG, sans dépendance) ────────────────────────────────
const Gauge = ({ value, label }) => {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const rayon = 54;
  const circonference = 2 * Math.PI * rayon;
  const couleur = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 140 140"
        className="w-40 h-40"
        role="img"
        aria-label={`${label} : ${value == null ? '—' : `${pct} %`}`}
      >
        <circle cx="70" cy="70" r={rayon} fill="none" stroke="#e5e7eb" strokeWidth="14" />
        <circle
          cx="70"
          cy="70"
          r={rayon}
          fill="none"
          stroke={couleur}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circonference}
          strokeDashoffset={circonference * (1 - pct / 100)}
          transform="rotate(-90 70 70)"
        />
        <text
          x="70"
          y="70"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-gray-800"
          style={{ fontSize: '26px', fontWeight: 700 }}
        >
          {value == null ? '—' : `${pct}%`}
        </text>
      </svg>
      <p className="text-sm text-gray-600 text-center mt-1">{label}</p>
    </div>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────
const TransparencePage = () => {
  const { t, i18n } = useTranslation();
  const [periode, setPeriode] = useState('annee');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let actif = true;
    setLoading(true);
    setError(false);

    axiosInstance
      .get('/api/transparence/stats/', { params: { periode } })
      .then((res) => {
        if (actif) setStats(res.data);
      })
      .catch((err) => {
        console.error('Erreur chargement transparence :', err);
        if (actif) setError(true);
      })
      .finally(() => {
        if (actif) setLoading(false);
      });

    return () => {
      actif = false;
    };
  }, [periode]);

  // Libellé d'un type de démarche (repli sur la valeur brute si non traduit)
  const typeLabel = (type) =>
    t(`demarches.${type}`, { defaultValue: type });

  const formatDate = (iso) =>
    iso
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeStyle: 'short' }).format(
          new Date(iso)
        )
      : '';

  const parType = stats?.par_type || [];

  const chartData = {
    labels: parType.map((l) => typeLabel(l.type_demarche)),
    datasets: [
      {
        label: t('transparence.graphique_legende'),
        data: parType.map((l) => l.delai_moyen_jours ?? 0),
        backgroundColor: 'rgba(30, 58, 138, 0.65)',
        borderColor: 'rgba(30, 58, 138, 1)',
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 mt-40 pb-16">
      <div className="max-w-5xl mx-auto px-4">
        {/* En-tête */}
        <div className="text-center pt-10 pb-8">
          <FontAwesomeIcon icon={faScaleBalanced} className="text-4xl text-blue-800 mb-3" />
          <h1 className="text-3xl font-bold text-gray-800">{t('transparence.titre')}</h1>
          <p className="text-gray-600 mt-2 max-w-2xl mx-auto">{t('transparence.sous_titre')}</p>
        </div>

        {/* Sélecteur de période */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          <span className="text-sm text-gray-600 mr-1">{t('transparence.periode')} :</span>
          {PERIODES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriode(p)}
              aria-pressed={periode === p}
              className={`px-3 py-1.5 text-sm rounded-md border transition ${
                periode === p
                  ? 'bg-blue-900 text-white border-blue-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50'
              }`}
            >
              {t(`transparence.${p}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-gray-600">
            <Oval height={36} width={36} color="#1e3a8a" secondaryColor="#93c5fd" strokeWidth={4} />
            {t('transparence.chargement')}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-6 text-center">
            {t('transparence.erreur')}
          </div>
        ) : (
          <>
            {/* Indicateurs clés */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex items-center gap-4">
                <FontAwesomeIcon icon={faFileLines} className="text-2xl text-blue-800" />
                <div>
                  <p className="text-2xl font-bold text-gray-800">{stats?.total_demarches ?? 0}</p>
                  <p className="text-sm text-gray-600">{t('transparence.total_demarches')}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex items-center gap-4">
                <FontAwesomeIcon icon={faClock} className="text-2xl text-blue-800" />
                <div>
                  <p className="text-2xl font-bold text-gray-800">
                    {stats?.delai_moyen_global_jours ?? '—'}
                  </p>
                  <p className="text-sm text-gray-600">{t('transparence.delai_moyen_global')}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex items-center gap-4">
                <FontAwesomeIcon icon={faCircleCheck} className="text-2xl text-blue-800" />
                <div>
                  <p className="text-2xl font-bold text-gray-800">
                    {stats?.total_traitees ?? 0}
                  </p>
                  <p className="text-sm text-gray-600">{t('transparence.colonne_traitees')}</p>
                </div>
              </div>
            </div>

            {/* Jauge du taux de respect des délais */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8 flex flex-col items-center">
              <Gauge
                value={stats?.taux_respect_delai_global}
                label={t('transparence.taux_respect')}
              />
              <p className="text-sm text-gray-500 mt-4">
                {t('transparence.delai_reglementaire', {
                  jours: stats?.delai_reglementaire_jours ?? 30,
                })}
              </p>
            </div>

            {stats?.indisponible && (
              <p className="text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-3 mb-8">
                {t('transparence.indisponible')}
              </p>
            )}

            {parType.length === 0 ? (
              <p className="text-center text-gray-600 py-10">{t('transparence.aucune_donnee')}</p>
            ) : (
              <>
                {/* Graphique des délais moyens par type */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">
                    {t('transparence.graphique_titre')}
                  </h2>
                  <div className="h-72">
                    <Bar data={chartData} options={chartOptions} />
                  </div>
                </div>

                {/* Tableau détaillé */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8 overflow-x-auto">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">
                    {t('transparence.tableau_titre')}
                  </h2>
                  <table className="min-w-full text-left border-collapse">
                    <caption className="sr-only">{t('transparence.tableau_titre')}</caption>
                    <thead>
                      <tr className="bg-blue-900 text-white text-sm">
                        <th scope="col" className="py-2 px-3">{t('transparence.colonne_type')}</th>
                        <th scope="col" className="py-2 px-3">{t('transparence.colonne_nombre')}</th>
                        <th scope="col" className="py-2 px-3">{t('transparence.colonne_traitees')}</th>
                        <th scope="col" className="py-2 px-3">{t('transparence.colonne_delai')}</th>
                        <th scope="col" className="py-2 px-3">{t('transparence.colonne_taux')}</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-800 text-sm">
                      {parType.map((l) => (
                        <tr key={l.type_demarche} className="border-b border-gray-100">
                          <td className="py-2 px-3">{typeLabel(l.type_demarche)}</td>
                          <td className="py-2 px-3">{l.nombre}</td>
                          <td className="py-2 px-3">{l.traitees}</td>
                          <td className="py-2 px-3">
                            {l.delai_moyen_jours != null
                              ? `${l.delai_moyen_jours} ${t('transparence.jours')}`
                              : '—'}
                          </td>
                          <td className="py-2 px-3">
                            {l.taux_respect_delai != null ? `${l.taux_respect_delai} %` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Engagement + mentions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-blue-900 mb-2">
                {t('transparence.engagement_titre')}
              </h2>
              <p className="text-gray-700 leading-relaxed">{t('transparence.engagement_texte')}</p>
              <p className="mt-3 text-sm text-gray-600 flex items-start gap-2">
                <FontAwesomeIcon icon={faLock} className="mt-1 shrink-0" />
                {t('transparence.anonymat')}
              </p>
              {stats?.maj_le && (
                <p className="mt-2 text-xs text-gray-500">
                  {t('transparence.maj_le', { date: formatDate(stats.maj_le) })}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TransparencePage;
