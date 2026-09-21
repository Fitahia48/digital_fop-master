import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import axiosInstance from './AxiosConfig';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo, faRoute } from '@fortawesome/free-solid-svg-icons';
import DemarcheTimelineModal from './DemarcheTimelineModal';

const STATUT_STYLES = {
  soumise: 'bg-gray-100 text-gray-800 border-gray-300',
  en_cours: 'bg-blue-100 text-blue-800 border-blue-300',
  traitee: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  rejetee: 'bg-red-100 text-red-800 border-red-300',
};

// Les libellés viennent des clés i18n (statut_* et types de démarche)

const MesDemarches = () => {
  const { t, i18n } = useTranslation();
  const [demarches, setDemarches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timelineId, setTimelineId] = useState(null); // démarche affichée dans la modale

  useEffect(() => {
    axiosInstance
      .get('/api/demarches/mine/')
      .then((res) => setDemarches(res.data.results || []))
      .catch((err) => {
        console.error('Erreur lors du chargement des démarches :', err);
        toast.error(t('common.erreur_generique'));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 mt-40 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('demarches.mes_demarches')}</h1>
          <p className="text-sm text-gray-600">
            {t('demarches.mes_demarches_intro')}
          </p>
        </div>
        <Link
          to="/demarches/nouvelle"
          className="bg-blue-900 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition duration-200"
        >
          {t('demarches.nouvelle_demarche')}
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-10">{t('demarches.chargement_demarches')}</p>
      ) : demarches.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600 mb-4">{t('demarches.aucune_demarche')}</p>
          <Link
            to="/demarches/nouvelle"
            className="text-blue-700 hover:underline font-medium"
          >
            {t('demarches.premiere_demande')}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {demarches.map((d) => (
            <div key={d.id} className="bg-white rounded-lg shadow-md border border-gray-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-800 bg-blue-100 px-2.5 py-1 rounded">
                    {t(`demarches.${d.type_demarche}`)}
                  </span>
                  <span
                    className={`ml-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${STATUT_STYLES[d.statut] || STATUT_STYLES.soumise}`}
                  >
                    {t(`demarches.statut_${d.statut}`)}
                  </span>
                </div>
                <span className="text-xs text-gray-600">
                  {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d.created_at))}
                </span>
              </div>

              <p className="mt-3 text-gray-800">{d.objet}</p>

              {d.document_numero && (
                <p className="mt-2 text-xs text-gray-600">
                  <FontAwesomeIcon icon={faCircleInfo} className="mr-1" />
                  {t('demarches.texte_lie', { texte: `${d.document_type || ''} ${d.document_numero ? `n° ${d.document_numero}` : ''}`.trim() })}
                </p>
              )}

              {d.nb_pieces_jointes > 0 && (
                <p className="mt-1 text-xs text-gray-600">
                  {t('demarches.pieces_jointes', { count: d.nb_pieces_jointes })}
                </p>
              )}

              {d.commentaire_admin && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
                  <strong>{t('demarches.reponse_admin')}</strong> {d.commentaire_admin}
                </div>
              )}

              <button
                type="button"
                onClick={() => setTimelineId(d.id)}
                className="mt-3 inline-flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 hover:underline font-medium"
              >
                <FontAwesomeIcon icon={faRoute} />
                {t('demarches.voir_suivi')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modale de suivi (timeline + stepper) */}
      {timelineId && (
        <DemarcheTimelineModal
          demarcheId={timelineId}
          onClose={() => setTimelineId(null)}
        />
      )}
    </div>
  );
};

export default MesDemarches;
