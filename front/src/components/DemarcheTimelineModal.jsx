import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axiosInstance from './AxiosConfig';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faFileSignature, faCircleCheck, faBan, faPaperclip } from '@fortawesome/free-solid-svg-icons';

// Ordre canonique du cycle de vie (rejetée traitée à part via bannière)
const STEPPER = ['soumise', 'en_cours', 'traitee'];

const TYPE_LABELS = {
  copie_certifiee: 'demarches.copie_certifiee',
  attestation: 'demarches.attestation',
  demande_information: 'demarches.demande_information',
  autre: 'demarches.autre',
};

const statutBadge = (statut, t) => {
  const styles = {
    soumise: 'bg-gray-100 text-gray-800 border-gray-300',
    en_cours: 'bg-blue-100 text-blue-800 border-blue-300',
    traitee: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    rejetee: 'bg-red-100 text-red-800 border-red-300',
  };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${styles[statut] || styles.soumise}`}>
      {t(`demarches.statut_${statut}`)}
      {statut === 'traitee' && <FontAwesomeIcon icon={faCircleCheck} className="ml-1.5" />}
      {statut === 'rejetee' && <FontAwesomeIcon icon={faBan} className="ml-1.5" />}
    </span>
  );
};

/**
 * Modale de suivi d'une démarche (modèle : DocumentLifecycleModal) :
 * - stepper horizontal Soumise → En cours → Traitée (bannière rouge si Rejetée)
 * - frise chronologique verticale de toutes les étapes (append-only côté serveur)
 */
const DemarcheTimelineModal = ({ demarcheId, onClose }) => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!demarcheId) return;
    setLoading(true);
    axiosInstance
      .get(`/api/demarches/${demarcheId}/timeline/`)
      .then((res) => setData(res.data))
      .catch((err) => {
        console.error('Erreur lors du chargement du suivi :', err);
      })
      .finally(() => setLoading(false));
  }, [demarcheId]);

  const demarche = data?.demarche;
  const timeline = data?.timeline || [];
  const statutActuel = demarche?.statut;
  const rejetee = statutActuel === 'rejetee';
  const formatDateTime = (value) =>
    value ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

  // Position dans le stepper : statuts déjà franchis selon la timeline réelle
  const statutsVisites = new Set(timeline.map((t) => t.statut));
  const stepIndex = STEPPER.indexOf(statutActuel); // -1 si rejetée

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-blue-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-800 rounded-lg text-yellow-300">
              <FontAwesomeIcon icon={faFileSignature} size="lg" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{t('demarches.suivi_titre')}</h2>
              <p className="text-xs text-blue-200">
                {t('demarches.suivi_intro')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.fermer')}
            className="text-gray-300 hover:text-white p-1 rounded-lg hover:bg-blue-800 transition"
          >
            <FontAwesomeIcon icon={faTimes} size="lg" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="flex justify-center items-center py-12 text-gray-500">
              {t('demarches.suivi_chargement')}
            </div>
          ) : !demarche ? (
            <div className="text-center py-8 text-gray-500">
              {t('demarches.suivi_erreur')}
            </div>
          ) : (
            <>
              {/* Carte résumé */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-800 bg-blue-100 px-2.5 py-1 rounded">
                    {t(TYPE_LABELS[demarche.type_demarche] || 'demarches.autre')}
                  </span>
                  {statutBadge(statutActuel, t)}
                </div>
                <p className="text-sm text-gray-800">{demarche.objet}</p>
                <p className="text-xs text-gray-600">
                  {t('demarches.deposee_le', { date: formatDateTime(demarche.created_at) })}
                </p>
                {data.document && (
                  <p className="text-xs text-gray-600">
                    {t('demarches.texte_lie', { texte: `${data.document.type || ''} ${data.document.numero ? `n° ${data.document.numero}` : ''}`.trim() })}
                  </p>
                )}
                {data.pieces_jointes?.length > 0 && (
                  <p className="text-xs text-gray-600 flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faPaperclip} />
                    {t('demarches.pieces_jointes', { count: data.pieces_jointes.length })}
                  </p>
                )}
              </div>

              {/* Stepper horizontal */}
              {rejetee ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                  <FontAwesomeIcon icon={faBan} className="text-red-600 text-xl" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">{t('demarches.rejetee_banniere')}</p>
                    <p className="text-xs text-red-700">
                      {t('demarches.rejetee_detail')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between px-2" role="list" aria-label={t('demarches.progression_label')}>
                  {STEPPER.map((s, i) => {
                    const atteint = statutsVisites.has(s) || (stepIndex >= 0 && i <= stepIndex);
                    const courant = statutActuel === s;
                    return (
                      <React.Fragment key={s}>
                        <div className="flex flex-col items-center text-center w-24">
                          <div
                            aria-current={courant ? 'step' : undefined}
                            className={`w-10 h-10 rounded-full flex items-center justify-center border-2 font-bold transition ${
                              courant
                                ? 'bg-blue-600 border-blue-600 text-white ring-4 ring-blue-200'
                                : atteint
                                  ? 'bg-emerald-500 border-emerald-500 text-white'
                                  : 'bg-white border-gray-300 text-gray-400'
                            }`}
                          >
                            {atteint && !courant ? <FontAwesomeIcon icon={faCircleCheck} /> : i + 1}
                          </div>
                          <span className={`mt-1.5 text-xs font-medium ${courant ? 'text-blue-700' : atteint ? 'text-emerald-700' : 'text-gray-500'}`}>
                            {t(`demarches.statut_${s}`)}
                          </span>
                        </div>
                        {i < STEPPER.length - 1 && (
                          <div className={`flex-1 h-0.5 mt-5 rounded ${atteint && statutsVisites.has(STEPPER[i + 1]) ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}

              {/* Frise chronologique verticale */}
              <div>
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">
                  {t('demarches.historique_titre')}
                </h3>
                <ol className="relative border-l-2 border-gray-200 ml-3 space-y-5">
                  {timeline.map((etape) => {
                    const dotColor =
                      etape.statut === 'traitee'
                        ? 'bg-emerald-500'
                        : etape.statut === 'en_cours'
                          ? 'bg-blue-500'
                          : etape.statut === 'rejetee'
                            ? 'bg-red-500'
                            : 'bg-gray-400';
                    return (
                      <li key={etape.id} className="ml-6">
                        <span className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white shadow ${dotColor}`} />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">
                            {t(`demarches.statut_${etape.statut}`)}
                          </span>
                          <span className="text-xs text-gray-600">
                            {formatDateTime(etape.created_at)}
                          </span>
                        </div>
                        {etape.commentaire && (
                          <p className="mt-1 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5">
                            {etape.commentaire}
                          </p>
                        )}
                        {(etape.admin_prenom || etape.admin_nom) && (
                          <p className="mt-0.5 text-xs text-gray-600">
                            {t('demarches.traitee_par', { nom: `${etape.admin_prenom || ''} ${etape.admin_nom || ''}`.trim() })}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition"
          >
            {t('common.fermer')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DemarcheTimelineModal;
