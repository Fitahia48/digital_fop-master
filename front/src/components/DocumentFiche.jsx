import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import axiosInstance from './AxiosConfig';
import { resolveFileUrl, statusLabel, normalizeStatus } from './Utils';
import { documentTypeLabel } from '../utils/documentTypes';
import { fileAvailability } from '../utils/fileAvailability';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faDownload,
  faBookOpen,
  faCalendarAlt,
  faBan,
  faPen,
  faCircleCheck,
  faTriangleExclamation,
  faLink,
} from '@fortawesome/free-solid-svg-icons';

/**
 * P1 — Fiche documentaire à URL stable : /documents/:id
 *
 * Remplace la modale de détail comme point d'entrée partageable :
 * - fonctionne au chargement direct et au rechargement (route React Router) ;
 * - affiche « document introuvable » pour un id inexistant ou non publié
 *   (le serveur renvoie 404 pour un brouillon — aucune fuite par devinette) ;
 * - présente métadonnées, résumé, vie juridique et disponibilité du fichier ;
 * - « retour aux résultats » préserve la recherche (state.location) quand
 *   l'usager arrive depuis la liste, sinon retour simple à la liste.
 */

const ETAT_BADGES = {
  brouillon: {
    icon: faTriangleExclamation,
    style: 'bg-gray-100 text-gray-700 border-gray-300',
    key: 'fiche.etat_brouillon',
  },
  a_valider: {
    icon: faTriangleExclamation,
    style: 'bg-amber-100 text-amber-800 border-amber-300',
    key: 'fiche.etat_a_valider',
  },
  validee: {
    icon: faCircleCheck,
    style: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    key: 'fiche.etat_validee',
  },
};

const relationBadge = (type) => ({
  abroge: {
    label: 'fiche.rel_abroge',
    label_inverse: 'fiche.rel_abroge_par',
    style: 'bg-red-50 text-red-700 border-red-200',
  },
  modifie: {
    label: 'fiche.rel_modifie',
    label_inverse: 'fiche.rel_modifie_par',
    style: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  complete: {
    label: 'fiche.rel_complete',
    label_inverse: 'fiche.rel_complete_par',
    style: 'bg-blue-50 text-blue-700 border-blue-200',
  },
}[type] || {
  label: 'fiche.rel_complete',
  label_inverse: 'fiche.rel_complete_par',
  style: 'bg-blue-50 text-blue-700 border-blue-200',
});

const DocumentFiche = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Titre de page accessible (onglet navigateur / lecteurs d'écran)
  useEffect(() => {
    document.title = t('fiche.page_titre', { defaultValue: 'Fiche document — Bibliothèque numérique' });
    return () => {
      document.title = t('fiche.page_titre_base', { defaultValue: 'Bibliothèque numérique' });
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    axiosInstance
      .get(`/api/documents/${id}/`)
      .then((res) => {
        if (!cancelled) {
          setDoc(res.data);
          // Le texte est lu directement, on incrémente la vue
          axiosInstance.post(`/api/documents/${id}/visit/`).catch(() => {});
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 404) setNotFound(true);
        else toast.error(t('common.erreur_generique'));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  // Titre de page avec référence du document (une fois chargé)
  useEffect(() => {
    if (doc) {
      const ref = doc.numero ? `n° ${doc.numero}` : '';
      document.title = `${doc.type || ''} ${ref} — ${doc.objet || t('fiche.page_titre_base', { defaultValue: 'Bibliothèque numérique' })}`.trim();
    }
  }, [doc, t]);

  // Retour : vers la recherche si l'usager en provient (contexte conservé
  // via history back), sinon vers la liste des documents.
  const backTarget = location.key !== 'default' ? -1 : '/AfficherDoc';

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 mt-40 pb-16 text-center text-gray-500">
        {t('common.chargement')}
      </div>
    );
  }

  if (notFound || !doc) {
    return (
      <div className="max-w-2xl mx-auto px-4 mt-40 pb-16 text-center">
        <div className="bg-white rounded-lg shadow-md p-8">
          <p className="text-4xl mb-4" aria-hidden>🔍</p>
          <h1 className="text-xl font-bold text-gray-800 mb-2">{t('fiche.introuvable_titre')}</h1>
          <p className="text-sm text-gray-600 mb-6">{t('fiche.introuvable_detail')}</p>
          <Link
            to="/AfficherDoc"
            className="inline-flex items-center gap-2 bg-blue-900 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            {t('fiche.retour_liste')}
          </Link>
        </div>
      </div>
    );
  }

  const file = fileAvailability(doc);
  const statut = normalizeStatus(doc.status);
  const etat = ETAT_BADGES[doc.etat_notice] || ETAT_BADGES.brouillon;
  const statutStyles = {
    en_vigueur: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    abroge: 'bg-red-100 text-red-800 border-red-300',
    modifie: 'bg-amber-100 text-amber-800 border-amber-300',
    non_verifie: 'bg-gray-100 text-gray-700 border-gray-400',
  };
  const motsCles = Array.isArray(doc.mots_cles) ? doc.mots_cles : [];


  const handleDownload = async () => {
    if (!file.available) return;
    try {
      const res = await axiosInstance.get(resolveFileUrl(file.url), { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `document-${doc.numero || doc.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await axiosInstance.post(`/api/documents/${doc.id}/telechargement/`);
    } catch {
      toast.error(t('documents.telechargement_erreur'));
    }
  };

  const formatDate = (d) =>
    d
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date(d))
      : '—';

  return (
    <div className="max-w-4xl mx-auto px-4 mt-40 pb-16">
      {/* Retour : conserve le contexte de recherche via l'historique navigateur */}
      <button
        type="button"
        onClick={() => (backTarget === -1 ? navigate(-1) : navigate(backTarget))}
        className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white hover:underline mb-4"
      >
        <FontAwesomeIcon icon={faArrowLeft} />
        {t('fiche.retour_resultats')}
      </button>

      <article className="bg-white rounded-lg shadow-lg p-6 sm:p-8" aria-labelledby="fiche-titre">
        {/* En-tête : type, numéro, statuts */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-800 bg-blue-100 px-2.5 py-1 rounded">
            {documentTypeLabel(doc.type, t)}
          </span>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${statutStyles[statut] || statutStyles.non_verifie}`}>
            {statut === 'non_verifie' && <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1.5" />}
            {statut === 'abroge' && <FontAwesomeIcon icon={faBan} className="mr-1.5" />}
            {statut === 'modifie' && <FontAwesomeIcon icon={faPen} className="mr-1.5" />}
            {statut === 'en_vigueur' && <FontAwesomeIcon icon={faCircleCheck} className="mr-1.5" />}
            {t(`fiche.statut_${statut}`, { defaultValue: statusLabel(doc.status) })}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${etat.style}`}>
            <FontAwesomeIcon icon={etat.icon} />
            {t(etat.key)}
          </span>
        </div>

        <h1 id="fiche-titre" className="text-2xl font-bold text-gray-900 leading-snug">
          {doc.numero ? `${t('fiche.numero_prefixe')} ${doc.numero} : ` : ''}
          {doc.objet}
        </h1>

        {/* Références officielles */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-700 mt-5 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faCalendarAlt} className="text-gray-400" />
            <dt className="font-medium">{t('fiche.date_signature')}</dt>
            <dd>{formatDate(doc.date)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faCalendarAlt} className="text-emerald-600" />
            <dt className="font-medium">{t('fiche.entree_vigueur')}</dt>
            <dd>{doc.date_entree_vigueur ? formatDate(doc.date_entree_vigueur) : t('documents.non_renseignee')}</dd>
          </div>
          <div>
            <dt className="inline font-medium">{t('fiche.domaine')} : </dt>
            <dd className="inline">{doc.domaine_nom || '—'}</dd>
          </div>
          {doc.organisme_emetteur && (
            <div>
              <dt className="inline font-medium">{t('fiche.organisme')} : </dt>
              <dd className="inline">{doc.organisme_emetteur}</dd>
            </div>
          )}
          {doc.inclus_journal && (
            <div className="sm:col-span-2 text-gray-600">
              <dt className="inline font-medium">{t('fiche.journal')} : </dt>
              <dd className="inline">
                {t('fiche.journal_ref', {
                  numero: doc.numero_journal || '-',
                  date: doc.date_journal ? formatDate(doc.date_journal) : '-',
                  page: doc.page_journal || '-',
                })}
              </dd>
            </div>
          )}
          {doc.langue && (
            <div>
              <dt className="inline font-medium">{t('fiche.langue')} : </dt>
              <dd className="inline">{t(`fiche.langue_${doc.langue}`)}</dd>
            </div>
          )}
        </dl>

        {/* Mots-clés */}
        {motsCles.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {motsCles.map((m) => (
              <span key={m} className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-700">
                {m}
              </span>
            ))}
          </div>
        )}

        {/* Résumé en langage clair */}
        {doc.resume_simplifie && (
          <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 rounded-r-md p-4">
            <p className="flex items-center gap-2 font-semibold text-blue-900 mb-2">
              <FontAwesomeIcon icon={faBookOpen} /> {t('documents.en_resume')}
            </p>
            <p className="text-gray-800 leading-relaxed whitespace-pre-line">{doc.resume_simplifie}</p>
            <p className="text-xs text-blue-700 mt-3">{t('documents.le_resume_est_aide')}</p>
          </div>
        )}

        {/* Texte intégral — jamais de lien si le fichier manque */}
        <div className="mt-6">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
              {t('fiche.texte_integral')}
            </h2>
            {file.available && (
              <button
                type="button"
                onClick={handleDownload}
                className="bg-gray-700 text-white px-4 py-2 rounded-md hover:bg-gray-500 transition text-sm"
              >
                <FontAwesomeIcon icon={faDownload} className="mr-2" />
                {t('common.telecharger')}
              </button>
            )}
          </div>
          
          {file.available ? (
            <div className="w-full h-[600px] sm:h-[800px] border border-gray-300 rounded-md overflow-hidden bg-gray-50">
              <iframe 
                src={resolveFileUrl(file.url)} 
                width="100%" 
                height="100%" 
                title="Visionneuse PDF"
                className="w-full h-full"
              />
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic border border-dashed border-gray-300 rounded-md p-4">
              {t('fiche.fichier_indisponible')}
            </p>
          )}
        </div>

        {/* Vie juridique : relations (lecture seule ici, détail dans la modale) */}
        {(doc.relations_actives?.length > 0 || doc.relations_passives?.length > 0) && (
          <div className="mt-8">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3 flex items-center gap-2">
              <FontAwesomeIcon icon={faLink} className="text-blue-700" />
              {t('documents.vie_juridique')}
            </h2>
            <ul className="space-y-2">
              {(doc.relations_actives || []).map((rel) => {
                const b = relationBadge(rel.type_relation);
                return (
                  <li key={`a-${rel.id}`} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded border ${b.style}`}>
                      {t(b.label)}
                    </span>
                    <Link
                      to={`/documents/${rel.document_cible_id}`}
                      className="text-blue-800 hover:underline"
                    >
                      {rel.type ? `${rel.type} ` : ''}
                      {rel.numero ? `n° ${rel.numero}` : ''} — {rel.objet}
                    </Link>
                  </li>
                );
              })}
              {(doc.relations_passives || []).map((rel) => {
                const b = relationBadge(rel.type_relation);
                return (
                  <li key={`p-${rel.id}`} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded border ${b.style}`}>
                      {t(b.label_inverse)}
                    </span>
                    <Link
                      to={`/documents/${rel.document_source_id}`}
                      className="text-blue-800 hover:underline"
                    >
                      {rel.type ? `${rel.type} ` : ''}
                      {rel.numero ? `n° ${rel.numero}` : ''} — {rel.objet}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Traçabilité et limites de vérification */}
        <footer className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500 space-y-1">
          {doc.last_modified_at && (
            <p>{t('fiche.derniere_maj', { date: formatDate(doc.last_modified_at) })}</p>
          )}
          {statut === 'non_verifie' && <p>{t('fiche.avertissement_non_verifie')}</p>}
          {doc.etat_notice !== 'validee' && <p>{t('fiche.avertissement_notice')}</p>}
        </footer>
      </article>
    </div>
  );
};

export default DocumentFiche;
