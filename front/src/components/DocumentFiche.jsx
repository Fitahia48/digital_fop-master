import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import axiosInstance from './AxiosConfig';
import { resolveFileUrl, statusLabel, normalizeStatus } from './Utils';
import { documentTypeLabel } from '../utils/documentTypes';
import { fileAvailability } from '../utils/fileAvailability';
import downloadFile from '../utils/downloadFile';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faDownload,
  faBookOpen,
  faCalendarAlt,
  faPen,
  faCircleCheck,
  faTriangleExclamation,
  faLink,
} from '@fortawesome/free-solid-svg-icons';

/** P1 — Fiche documentaire à URL stable : /documents/:id */

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
  vise: {
    label: 'fiche.rel_vise',
    label_inverse: 'fiche.rel_vise_par',
    style: 'bg-purple-50 text-purple-700 border-purple-200',
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

  useEffect(() => {
    document.title = t('fiche.page_titre', { defaultValue: 'Fiche document — Bibliothèque numérique' });
    return () => {
      document.title = t('fiche.page_titre_base', { defaultValue: 'Bibliothèque numérique' });
    };
  }, [t]);

  // « Consulter » doit afficher la fiche directement depuis le haut, comme la
  // maquette : le navigateur conserve le défilement de la liste, ce qui laissait
  // le titre et le badge masqués derrière l'en-tête fixe (et le bouton de retour
  // hors écran). On réinitialise le scroll à chaque fiche ouverte.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    axiosInstance
      .get(`/api/documents/${id}/`)
      .then((res) => {
        if (!cancelled) {
          setDoc(res.data);
          axiosInstance.post(`/api/documents/${id}/visit/`).catch(() => {});
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 404) setNotFound(true);
        else toast.error(t('common.erreur_generique'));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id, t]);

  useEffect(() => {
    if (doc) {
      const ref = doc.numero ? `n° ${doc.numero}` : '';
      document.title = `${doc.type || ''} ${ref} — ${doc.objet || t('fiche.page_titre_base', { defaultValue: 'Bibliothèque numérique' })}`.trim();
    }
  }, [doc, t]);

  const backTarget = location.key !== 'default' ? -1 : '/AfficherDoc';

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 mt-48 pb-16 text-center text-gray-500">
        {t('common.chargement')}
      </div>
    );
  }

  if (notFound || !doc) {
    return (
      <div className="max-w-2xl mx-auto px-4 mt-48 pb-16 text-center">
        <div className="bg-white rounded-lg shadow-md p-8">
          <p className="text-4xl mb-4" aria-hidden>🔍</p>
          <h1 className="text-xl font-bold text-gray-800 mb-2">{t('fiche.introuvable_titre')}</h1>
          <p className="text-sm text-gray-600 mb-6">{t('fiche.introuvable_detail')}</p>
          <Link to="/AfficherDoc" className="inline-flex items-center gap-2 bg-blue-900 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition">
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
    modifie: 'bg-amber-100 text-amber-700 border-amber-300',
    non_verifie: 'bg-gray-100 text-gray-700 border-gray-400',
  };
  const motsCles = Array.isArray(doc.mots_cles) ? doc.mots_cles : [];

  const telechargeable = doc.telechargeable !== false;

  const handleDownload = async () => {
    if (!file.available) return;
    try {
      // Helper avec repli sur le lien direct si le XHR est bloqué (CORS/IDM).
      await downloadFile(file.url, `document-${doc.numero || doc.id}.pdf`);
    } catch {
      toast.error(t('documents.telechargement_erreur'));
      return;
    }
    // Comptage du téléchargement : un échec du compteur ne doit pas afficher
    // une fausse erreur alors que le fichier est parti.
    try {
      await axiosInstance.post(`/api/documents/${doc.id}/telechargement/`);
    } catch (error) {
      console.error("Erreur lors de l'enregistrement du téléchargement :", error);
    }
  };

  const formatDate = (d) =>
    d ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date(d)) : '—';

  return (
    <div className="max-w-4xl mx-auto px-4 mt-48 pb-16">
      <button
        type="button"
        onClick={() => (backTarget === -1 ? navigate(-1) : navigate(backTarget))}
        className="mb-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-blue-900 shadow-md ring-1 ring-gray-200 hover:bg-blue-50 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <FontAwesomeIcon icon={faArrowLeft} />
        {t('fiche.retour_resultats')}
      </button>

      <article className="bg-white rounded-lg shadow-lg p-6 sm:p-8" aria-labelledby="fiche-titre">
        <div className="flex items-center gap-3 mb-4">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold \n            ${doc.status === "en_vigueur" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}\n          `}>
            {statusLabel(doc.status)}
          </span>
        </div>

        <h1 id="fiche-titre" className="text-3xl font-bold text-gray-900 mb-2 leading-snug">
          {doc.type} {doc.numero ? `n°${doc.numero}` : ''} {doc.objet}
        </h1>

        <div className="text-sm text-gray-600 mb-4">
          {[
            doc.inclus_journal && doc.date_journal ? (
              <>
                <span>Journal officiel </span>
                <span>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeZone: 'Indian/Antananarivo' }).format(new Date(doc.date_journal))}</span>
                <span> • </span>
              </>
            ) : null,
            doc.domaine_nom ? (
              <>
                <span>Domaine : </span>
                <span>{doc.domaine_nom}</span>
                <span> • </span>
              </>
            ) : null,
            doc.conseil ? (
              <>
                <span>Conseil : </span>
                <span>{doc.conseil}</span>
                <span> • </span>
              </>
            ) : null,
            doc.organisme_emetteur ? (
              <>
                <span>Organisme : </span>
                <span>{doc.organisme_emetteur}</span>
                <span> • </span>
              </>
            ) : null,
            doc.langue ? (
              <>
                <span>Langue : </span>
                <span>{t(`fiche.langue_${doc.langue}`)}</span>
                <span> • </span>
              </>
            ) : null,
            doc.date ? (
              <>
                <span>Date du texte : </span>
                <span>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeZone: 'Indian/Antananarivo' }).format(new Date(doc.date))}</span>
                <span> • </span>
              </>
            ) : null
          ].filter(Boolean).map((item, index) => (
            <React.Fragment key={index}>{item}</React.Fragment>
          ))}
        </div>

        <div className="mb-4">
          {[
            doc.numero_journal && doc.page_journal ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">Journal officiel :</span>
                  <span>n° {doc.numero_journal}, p. {doc.page_journal}</span>
                </div>
              </>
            ) : null,
            doc.lieu_signature ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">Lieu de signature :</span>
                  <span>{doc.lieu_signature}</span>
                </div>
              </>
            ) : null,
            doc.signataires ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">Signataire(s) :</span>
                  <span>{doc.signataires}</span>
                </div>
              </>
            ) : null
          ].filter(Boolean).map((item, index) => (
            <React.Fragment key={index}>{item}</React.Fragment>
          ))}
        </div>



        {/* Action buttons : téléchargeable → « Télécharger » ; sinon → « Lire » (nouvel onglet) */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-6">
          {file.available && !telechargeable && (
            <span className="text-xs font-medium text-gray-500">{t('telechargeable.option_non')}</span>
          )}
          {file.available && telechargeable ? (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
              aria-label={t('common.telecharger')}
            >
              <FontAwesomeIcon icon={faDownload} />
              <span>{t('common.telecharger')}</span>
            </button>
          ) : null}
          {file.available && !telechargeable ? (
            <a
              href={resolveFileUrl(file.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-blue-800 text-white rounded-md hover:bg-blue-700 transition-colors"
              aria-label={t('telechargeable.lire_aria')}
            >
              <FontAwesomeIcon icon={faBookOpen} />
              <span>{t('telechargeable.lire')}</span>
              <span className="text-xs opacity-80">({t('documents.ouvrir_nouvel_onglet')})</span>
            </a>
          ) : null}
          <button
            onClick={() => (backTarget === -1 ? navigate(-1) : navigate(backTarget))}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
          >
            <span>{t('common.fermer')}</span>
          </button>
        </div>

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
                    <Link to={`/documents/${rel.document_cible_id}`} className="text-blue-800 hover:underline">
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
                    <Link to={`/documents/${rel.document_source_id}`} className="text-blue-800 hover:underline">
                      {rel.type ? `${rel.type} ` : ''}
                      {rel.numero ? `n° ${rel.numero}` : ''} — {rel.objet}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </article>
    </div>
  );
};

export default DocumentFiche;
