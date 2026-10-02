import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import axiosInstance from './AxiosConfig';
import HelpTooltip from './HelpTooltip';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileArrowDown, faCircleCheck } from '@fortawesome/free-solid-svg-icons';

/**
 * Formulaire dynamique branché sur le catalogue backend :
 * GET /api/types-demarche?lang=fr|en|mg → types actifs avec pièces requises,
 * champs spécifiques, direction compétente et délai cible.
 *
 * Les 4 types legacy (copie_certifiee, attestation, demande_information, autre)
 * utilisent i18n ; les types spécialisés utilisent le libellé traduit du
 * catalogue (libelles trilingues JSON côté backend).
 *
 * Envoi : multipart/form-data
 * - type_code : code du catalogue
 * - objet : texte
 * - document_id : optionnel
 * - donnees_specifiques : JSON sérialisé des champs spécifiques
 * - pieces_<code> : fichiers des pièces requises
 * - fichier : pièce jointe libre (optionnelle)
 *
 * Réponse : { detail, demarche: { numero_dossier, documentId, … } } →
 * écran de confirmation avec n° de dossier + téléchargement accusé de réception.
 */

const LEGACY_TYPES = ['copie_certifiee', 'attestation', 'demande_information', 'autre'];

const typeLabel = (code, t) => (LEGACY_TYPES.includes(code) ? t(`demarches.${code}`) : code);

const DemarcheForm = () => {
  const { t, i18n } = useTranslation();
  const [types, setTypes] = useState([]);
  const [formData, setFormData] = useState({
    type_code: '',
    objet: '',
    document_id: '',
  });
  const [champsSpec, setChampsSpec] = useState({}); // { code: valeur }
  const [pieces, setPieces] = useState({}); // { code: File|File[] }
  const [fichier, setFichier] = useState(null); // pièce jointe libre
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null); // démarche créée
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const estConnecte = Boolean(user?.access);

  const lang = ['fr', 'en', 'mg'].includes(i18n.language) ? i18n.language : 'fr';

  // Redirection vers login si non connecté (comme ProtectedRoute)
  useEffect(() => {
    if (!estConnecte) {
      toast.info(t('demarches.login_requis'));
      navigate('/login', { state: { from: '/demarches/nouvelle' } });
    }
  }, [estConnecte, navigate, t]);

  // Catalogue des types de démarches (public, libellés traduits côté API)
  useEffect(() => {
    axiosInstance
      .get('/api/types-demarche', { params: { lang } })
      .then((res) => setTypes(res.data.results || []))
      .catch((err) => console.error('Erreur catalogue types de démarches :', err));
  }, [lang]);

  // Liste des documents pour le lien optionnel
  useEffect(() => {
    if (!estConnecte) return;
    axiosInstance
      .get('/api/documents/?page_size=100')
      .then((res) => setDocuments(res.data.results || []))
      .catch((err) => console.error('Erreur lors du chargement des documents :', err));
  }, [estConnecte]);

  const typeChoisi = useMemo(
    () => types.find((tp) => tp.code === formData.type_code) || null,
    [types, formData.type_code]
  );

  // Réinitialise champs spécifiques + pièces quand le type change
  useEffect(() => {
    setChampsSpec({});
    setPieces({});
  }, [formData.type_code]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleChampSpec = (code, value) => {
    setChampsSpec((prev) => ({ ...prev, [code]: value }));
  };

  const handlePieceChange = (code, e) => {
    const files = Array.from(e.target.files || []);
    setPieces((prev) => ({ ...prev, [code]: files }));
  };

  const handleFileChange = (e) => setFichier(e.target.files[0] || null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    data.append('type_code', formData.type_code);
    data.append('objet', formData.objet);
    if (formData.document_id) data.append('document_id', formData.document_id);
    if (fichier) data.append('fichier', fichier);

    const spec = typeChoisi?.champs_specifiques || [];
    if (spec.length > 0) {
      const donnees = {};
      for (const c of spec) {
        const v = champsSpec[c.code];
        if (v !== undefined && v !== '') donnees[c.code] = c.type === 'number' ? Number(v) : v;
      }
      data.append('donnees_specifiques', JSON.stringify(donnees));
    }

    for (const [code, files] of Object.entries(pieces)) {
      for (const f of files) data.append(`pieces_${code}`, f);
    }

    setLoading(true);
    try {
      const res = await axiosInstance.post('/api/demarches/', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setConfirmation(res.data?.demarche || null);
      toast.success(t('demarches.succes'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.response?.data?.detail;
      toast.error(detail || t('demarches.erreur'));
    } finally {
      setLoading(false);
    }
  };

  // ─── Écran de confirmation : n° de dossier + accusé de réception ──────────
  if (confirmation) {
    const telechargerAr = async () => {
      try {
        const res = await axiosInstance.get(
          `/api/demarches/${confirmation.documentId}/accuse-reception/`,
          { responseType: 'blob' }
        );
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `accuse-reception-${confirmation.numero_dossier || confirmation.documentId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        toast.error(t('demarches.ar_erreur'));
      }
    };

    return (
      <div className="flex items-center justify-center min-h-screen bg-transparent mt-40">
        <div className="w-full lg:w-2/3 bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mb-4">
            <FontAwesomeIcon icon={faCircleCheck} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">{t('demarches.confirmation_titre')}</h1>
          <p className="text-sm text-gray-600 mb-6">{t('demarches.confirmation_intro')}</p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6 inline-block">
            <p className="text-xs uppercase tracking-wider text-blue-800 font-semibold mb-1">
              {t('demarches.numero_dossier')}
            </p>
            <p className="text-2xl font-mono font-bold text-blue-900">
              {confirmation.numero_dossier || '—'}
            </p>
          </div>

          <p className="text-sm text-gray-600 mb-2">{t('demarches.conserver_numero')}</p>
          {confirmation.date_limite && (
            <p className="text-sm text-gray-600 mb-6">
              {t('demarches.delai_confirmation', {
                date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
                  new Date(confirmation.date_limite)
                ),
              })}
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            {confirmation.numero_dossier && (
              <button
                type="button"
                onClick={telechargerAr}
                className="inline-flex items-center gap-2 bg-blue-900 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition"
              >
                <FontAwesomeIcon icon={faFileArrowDown} />
                {t('demarches.telecharger_ar')}
              </button>
            )}
            <Link
              to="/mes-demarches"
              className="inline-flex items-center bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-100 transition"
            >
              {t('demarches.voir_mes_demarches')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-transparent mt-40">
      <div className="w-full lg:w-2/3 bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">{t('demarches.nouvelle')}</h1>
        <p className="text-sm text-gray-600 text-center mb-6">
          {t('demarches.intro')}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Type de démarche (catalogue dynamique) */}
          <div>
            <label htmlFor="demarche-type" className="block text-gray-700 font-medium mb-2">
              {t('demarches.type')}
              <HelpTooltip text={t('demarches.type_aide')} />
            </label>
            <select
              id="demarche-type"
              name="type_code"
              value={formData.type_code}
              onChange={handleChange}
              required
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('demarches.choisir_type')}</option>
              {types.map((tp) => (
                <option key={tp.code} value={tp.code}>
                  {typeLabel(tp.code, t) !== tp.code ? typeLabel(tp.code, t) : tp.libelle}
                </option>
              ))}
            </select>
            {typeChoisi?.direction?.nom && (
              <p className="mt-1.5 text-xs text-gray-600">
                {t('demarches.direction_competente')} : {typeChoisi.direction.nom}
                {typeChoisi.delai_cible_jours
                  ? ` — ${t('demarches.delai_cible', { jours: typeChoisi.delai_cible_jours })}`
                  : ''}
              </p>
            )}
          </div>

          {/* Pièces requises du type (affichées avant l'objet) */}
          {typeChoisi?.pieces_requises?.length > 0 && (
            <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
              <p className="text-sm font-medium text-gray-700 mb-3">{t('demarches.pieces_requises')}</p>
              <div className="flex flex-col gap-3">
                {typeChoisi.pieces_requises.map((p) => (
                  <div key={p.code}>
                    <label htmlFor={`piece-${p.code}`} className="block text-sm text-gray-600 mb-1">
                      {p.libelle}
                      {p.obligatoire ? (
                        <span className="text-red-600 ml-1">*</span>
                      ) : (
                        <span className="text-gray-400 ml-1">({t('demarches.facultatif')})</span>
                      )}
                    </label>
                    <input
                      id={`piece-${p.code}`}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => handlePieceChange(p.code, e)}
                      required={p.obligatoire}
                      className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Champs spécifiques du type */}
          {typeChoisi?.champs_specifiques?.length > 0 && (
            <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
              <p className="text-sm font-medium text-gray-700 mb-3">{t('demarches.champs_specifiques')}</p>
              <div className="flex flex-col gap-3">
                {typeChoisi.champs_specifiques.map((c) => (
                  <div key={c.code}>
                    <label htmlFor={`champ-${c.code}`} className="block text-sm text-gray-600 mb-1">
                      {c.libelle}
                      {c.obligatoire && <span className="text-red-600 ml-1">*</span>}
                    </label>
                    {c.type === 'number' ? (
                      <input
                        id={`champ-${c.code}`}
                        type="number"
                        value={champsSpec[c.code] || ''}
                        onChange={(e) => handleChampSpec(c.code, e.target.value)}
                        required={c.obligatoire}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <input
                        id={`champ-${c.code}`}
                        type="text"
                        value={champsSpec[c.code] || ''}
                        onChange={(e) => handleChampSpec(c.code, e.target.value)}
                        required={c.obligatoire}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Objet */}
          <div>
            <label htmlFor="demarche-objet" className="block text-gray-700 font-medium mb-2">
              {t('demarches.objet')}
              <HelpTooltip text={t('demarches.objet_aide')} />
            </label>
            <textarea
              id="demarche-objet"
              name="objet"
              value={formData.objet}
              onChange={handleChange}
              required
              rows={4}
              maxLength={2000}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder={t('demarches.objet_placeholder')}
            />
          </div>

          {/* Document lié optionnel */}
          <div>
            <label htmlFor="demarche-document" className="block text-gray-700 font-medium mb-2">
              {t('demarches.document_lie')}
              <HelpTooltip text={t('demarches.document_lie_aide')} />
            </label>
            <select
              id="demarche-document"
              name="document_id"
              value={formData.document_id}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('demarches.aucun_document')}</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.numero ? `N° ${doc.numero} — ` : ''}{doc.objet?.slice(0, 80)}
                </option>
              ))}
            </select>
          </div>

          {/* Pièce jointe libre */}
          <div>
            <label htmlFor="demarche-fichier" className="block text-gray-700 font-medium mb-2">
              {t('demarches.piece_jointe')}
              <HelpTooltip text={t('demarches.piece_jointe_aide')} />
            </label>
            <input
              id="demarche-fichier"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-900 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition duration-200 disabled:opacity-60"
          >
            {loading ? t('demarches.envoi_cours') : t('demarches.envoyer')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default DemarcheForm;
