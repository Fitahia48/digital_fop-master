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
  faDownload,
  faBookOpen,
  faLock,
} from '@fortawesome/free-solid-svg-icons';
import { Oval } from 'react-loader-spinner';
import axiosInstance from './AxiosConfig';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// ─── Page ───────────────────────────────────────────────────────────────────
/**
 * Page publique /transparence — statistiques de CONSULTATION des textes
 * réglementaires (les statistiques de traitement des démarches ont été
 * retirées avec la suppression des démarches en ligne).
 *
 * Source : GET /api/transparence/stats (public) → compteurs existants
 * `visits` / `telechargements` du content-type document.
 */
const TransparencePage = () => {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let actif = true;
    setLoading(true);
    setError(false);

    axiosInstance
      .get('/api/transparence/stats/')
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
  }, []);

  const formatNombre = (n) =>
    Number.isFinite(Number(n)) ? new Intl.NumberFormat(i18n.language).format(Number(n)) : '0';

  const formatDate = (iso) =>
    iso
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeStyle: 'short' }).format(
          new Date(iso)
        )
      : '';

  const libelleTexte = (l) => [l.type, l.numero].filter(Boolean).join(' ') || '—';

  const parType = stats?.par_type || [];
  const topConsultes = stats?.top_consultes || [];
  const topTelecharges = stats?.top_telecharges || [];

  const chartData = {
    labels: parType.map((l) => l.type),
    datasets: [
      {
        label: t('transparence.graphique_legende'),
        data: parType.map((l) => l.consultations),
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

  const cartes = [
    {
      cle: 'total_consultations',
      valeur: stats?.total_consultations ?? 0,
      icon: faFileLines,
    },
    {
      cle: 'total_telechargements',
      valeur: stats?.total_telechargements ?? 0,
      icon: faDownload,
    },
    {
      cle: 'documents_publies',
      valeur: stats?.documents_total ?? 0,
      icon: faScaleBalanced,
    },
    {
      cle: 'documents_consultes',
      valeur: stats?.documents_consultes ?? 0,
      icon: faBookOpen,
    },
  ];

  /** Tableau « top » : colonnes Texte / Obet / la métrique concernée. */
  const tableauClassement = (lignes, cleMetrique) => (
    <table className="min-w-full text-left border-collapse">
      <caption className="sr-only">{cleMetrique === 'consultations' ? t('transparence.top_consultes_titre') : t('transparence.top_telecharges_titre')}</caption>
      <thead>
        <tr className="bg-blue-900 text-white text-sm">
          <th scope="col" className="py-2 px-3">{t('transparence.colonne_texte')}</th>
          <th scope="col" className="py-2 px-3">{t('transparence.colonne_objet')}</th>
          <th scope="col" className="py-2 px-3 text-right">
            {t(`transparence.colonne_${cleMetrique}`)}
          </th>
        </tr>
      </thead>
      <tbody className="text-gray-800 text-sm">
        {lignes.map((l, idx) => (
          <tr key={`${cleMetrique}-${idx}`} className="border-b border-gray-100">
            <td className="py-2 px-3 whitespace-nowrap">{libelleTexte(l)}</td>
            <td className="py-2 px-3">{l.objet || '—'}</td>
            <td className="py-2 px-3 text-right font-medium">{formatNombre(l[cleMetrique])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {cartes.map((carte) => (
                <div
                  key={carte.cle}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex items-center gap-4"
                >
                  <FontAwesomeIcon icon={carte.icon} className="text-2xl text-blue-800" />
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{formatNombre(carte.valeur)}</p>
                    <p className="text-sm text-gray-600">{t(`transparence.${carte.cle}`)}</p>
                  </div>
                </div>
              ))}
            </div>

            {stats?.indisponible && (
              <p className="text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-3 mb-8">
                {t('transparence.indisponible')}
              </p>
            )}

            {(stats?.documents_total ?? 0) === 0 ? (
              <p className="text-center text-gray-600 py-10">{t('transparence.aucune_donnee')}</p>
            ) : (
              <>
                {/* Classements */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                  <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 overflow-x-auto">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">
                      {t('transparence.top_consultes_titre')}
                    </h2>
                    {topConsultes.length === 0 ? (
                      <p className="text-sm text-gray-500">{t('transparence.aucune_donnee')}</p>
                    ) : (
                      tableauClassement(topConsultes, 'consultations')
                    )}
                  </section>
                  <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 overflow-x-auto">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">
                      {t('transparence.top_telecharges_titre')}
                    </h2>
                    {topTelecharges.length === 0 ? (
                      <p className="text-sm text-gray-500">{t('transparence.aucune_donnee')}</p>
                    ) : (
                      tableauClassement(topTelecharges, 'telechargements')
                    )}
                  </section>
                </div>

                {/* Répartition par type de texte */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">
                    {t('transparence.graphique_titre')}
                  </h2>
                  <div className="h-72">
                    <Bar data={chartData} options={chartOptions} />
                  </div>
                </div>

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
                        <th scope="col" className="py-2 px-3">{t('transparence.colonne_consultations')}</th>
                        <th scope="col" className="py-2 px-3">{t('transparence.colonne_telechargements')}</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-800 text-sm">
                      {parType.map((l) => (
                        <tr key={l.type} className="border-b border-gray-100">
                          <td className="py-2 px-3">{l.type}</td>
                          <td className="py-2 px-3">{formatNombre(l.nombre)}</td>
                          <td className="py-2 px-3">{formatNombre(l.consultations)}</td>
                          <td className="py-2 px-3">{formatNombre(l.telechargements)}</td>
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
