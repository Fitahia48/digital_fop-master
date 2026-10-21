import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPenToSquare, faPlus, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import axiosInstance from './AxiosConfig';

/**
 * Espace administrateur « Thèmes » (/admin/themes).
 *
 * Les thèmes sont les `domaines` Strapi : ils alimentent le select « Accès par
 * thème » du menu (Menu.jsx), les filtres de recherche (SearchBar.jsx) et le
 * champ « Domaine » des formulaires document.
 *
 * - Route protégée (ProtectedRoute dans App.jsx) + VÉRIFICATION ADMIN ici :
 *   comme AdminSubscribers, la page interroge /api/v1/auth/users/me/ pour ne
 *   pas dépendre du timing du contexte global ; le serveur refuse aussi les
 *   écritures non-admin (403 : seuls les rôles Public/Authenticated ont find).
 * - API legacy : GET /api/domaines/ → { count, results } (documents_count
 *   inclus), POST/PUT `{ nom }`, DELETE `?force=true` quand des documents sont
 *   rattachés (ils sont détachés, jamais supprimés).
 */
const NOM_MAX = 120;

/** Message d'erreur lisible : corps texte (ctx.badRequest) ou enveloppe Strapi. */
const lireErreur = (err, t) => {
  const data = err?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  if (typeof data?.error?.message === 'string' && data.error.message.trim()) return data.error.message;
  return t('admin_themes.erreur_generique');
};

const normalizeNom = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Prévient le menu (select « Accès par thème ») qu'un thème a changé. */
const annoncerChangement = () => window.dispatchEvent(new Event('domaines:updated'));

const AdminThemes = () => {
  const { t } = useTranslation();

  // Vérification admin autonome : 'checking' | 'allowed' | 'denied'
  const [access, setAccess] = useState('checking');

  const [themes, setThemes] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [savingId, setSavingId] = useState(null);

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const cancelDeleteRef = useRef(null);

  // ─── Vérification admin (autonome, sans dépendre du contexte) ─────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axiosInstance.get('/api/v1/auth/users/me/');
        if (cancelled) return;
        const admin = Boolean(res.data?.is_staff || res.data?.is_superuser);
        setAccess(admin ? 'allowed' : 'denied');
      } catch {
        if (!cancelled) setAccess('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Chargement de la liste ───────────────────────────────────────────────
  const charger = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      // with_counts : la page affiche le nombre de documents rattachés (et
      // prévient avant une suppression qui les détacherait).
      const res = await axiosInstance.get('/api/domaines/', { params: { with_counts: 'true' } });
      setThemes(Array.isArray(res.data?.results) ? res.data.results : []);
      setStatus('ready');
    } catch (err) {
      setErrorMsg(lireErreur(err, t));
      setStatus('error');
    }
  }, [t]);

  useEffect(() => {
    if (access === 'allowed') charger();
  }, [access, charger]);

  // Focus sur le champ de renommage dès l'ouverture (les deux mises en page
  // — tableau bureau et cartes mobile — sont montées : on cible la visible).
  useEffect(() => {
    if (!editingId) return;
    const inputs = document.querySelectorAll(`input[data-theme-edit="${editingId}"]`);
    const visible = Array.from(inputs).find((el) => el.offsetParent !== null);
    if (visible) {
      visible.focus();
      visible.select();
    }
  }, [editingId]);

  // ─── Création ─────────────────────────────────────────────────────────────
  const creer = async (e) => {
    e.preventDefault();
    if (creating) return;
    const nom = normalizeNom(newName);
    if (!nom) {
      toast.error(t('admin_themes.nom_obligatoire'));
      return;
    }
    if (nom.length > NOM_MAX) {
      toast.error(t('admin_themes.nom_trop_long', { max: NOM_MAX }));
      return;
    }

    setCreating(true);
    try {
      await axiosInstance.post('/api/domaines/', { nom });
      toast.success(t('admin_themes.creation_succes'));
      setNewName('');
      annoncerChangement();
      await charger();
    } catch (err) {
      toast.error(lireErreur(err, t));
    } finally {
      setCreating(false);
    }
  };

  // ─── Renommage en ligne ───────────────────────────────────────────────────
  const commencerRenommage = (theme) => {
    setEditingId(theme.id);
    setEditName(theme.nom || '');
  };

  const annulerRenommage = () => {
    setEditingId(null);
    setEditName('');
  };

  const renommer = async (theme) => {
    if (savingId) return;
    const nom = normalizeNom(editName);
    if (!nom) {
      toast.error(t('admin_themes.nom_obligatoire'));
      return;
    }
    if (nom.length > NOM_MAX) {
      toast.error(t('admin_themes.nom_trop_long', { max: NOM_MAX }));
      return;
    }
    if (nom === normalizeNom(theme.nom)) {
      annulerRenommage();
      return;
    }

    setSavingId(theme.id);
    try {
      await axiosInstance.put(`/api/domaines/${theme.documentId || theme.id}`, { nom });
      toast.success(t('admin_themes.maj_succes'));
      annulerRenommage();
      annoncerChangement();
      await charger();
    } catch (err) {
      toast.error(lireErreur(err, t));
    } finally {
      setSavingId(null);
    }
  };

  // ─── Suppression avec confirmation ────────────────────────────────────────
  const openDelete = (theme) => {
    setEditingId(null);
    setPendingDelete(theme);
  };
  const closeDelete = () => setPendingDelete(null);

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    const nbDocuments = Number(pendingDelete.documents_count) || 0;
    setDeleting(true);
    try {
      await axiosInstance.delete(
        `/api/domaines/${pendingDelete.documentId || pendingDelete.id}`,
        { params: nbDocuments > 0 ? { force: 'true' } : undefined }
      );
      toast.success(t('admin_themes.suppression_succes'));
      setPendingDelete(null);
      annoncerChangement();
      await charger();
    } catch (err) {
      // Compteur périmé (documents rattachés entre-temps) : on rafraîchit la
      // modale avec le vrai nombre, l'admin doit reconfirmer.
      const serveurNb = Number(err.response?.data?.documents_count);
      if (err.response?.status === 409 && Number.isFinite(serveurNb)) {
        setPendingDelete((prev) => (prev ? { ...prev, documents_count: serveurNb } : prev));
      }
      toast.error(lireErreur(err, t));
    } finally {
      setDeleting(false);
    }
  };

  // Focus sur « Annuler » à l'ouverture + fermeture par Échap
  useEffect(() => {
    if (pendingDelete && cancelDeleteRef.current) cancelDeleteRef.current.focus();
    if (!pendingDelete) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeDelete();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pendingDelete]);

  // ─── Refus d'accès (non-admin) ───────────────────────────────────────────
  if (access === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] bg-gray-50 px-4">
        <div className="bg-white shadow-lg rounded-lg p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4" aria-hidden="true">✗</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">{t('admin_themes.acces_refuse_titre')}</h1>
          <p className="text-gray-600 mb-6">{t('admin_themes.acces_refuse')}</p>
          <Link
            to="/"
            className="inline-block px-5 py-2 bg-blue-800 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {t('admin_themes.retour_accueil')}
          </Link>
        </div>
      </div>
    );
  }

  if (access === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-[50vh] bg-gray-50" role="status">
        <span className="animate-spin rounded-full h-10 w-10 border-4 border-yellow-500 border-t-transparent" />
        <span className="sr-only">{t('admin_themes.chargement')}</span>
      </div>
    );
  }

  const nbDocumentsModal = pendingDelete ? Number(pendingDelete.documents_count) || 0 : 0;

  return (
    <div className="bg-gray-50 min-h-[60vh] py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">{t('admin_themes.titre')}</h1>
        <p className="text-sm text-gray-500 mb-6">{t('admin_themes.intro')}</p>

        {/* ─── Création ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('admin_themes.nouveau_titre')}</h2>
          <form onSubmit={creer} className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="theme-nom" className="block text-xs font-semibold text-gray-600 mb-1">
                {t('admin_themes.nom_label')}
              </label>
              <input
                id="theme-nom"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={NOM_MAX}
                placeholder={t('admin_themes.nom_placeholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
                aria-describedby="theme-nom-aide"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !normalizeNom(newName)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-800 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
              {creating ? t('admin_themes.creation_en_cours') : t('admin_themes.creer')}
            </button>
          </form>
          <p id="theme-nom-aide" className="text-xs text-gray-400 mt-2">{t('admin_themes.nom_aide')}</p>
        </div>

        {/* ─── Nombre de résultats (aria-live) ───────────────────────────── */}
        <p className="text-sm text-gray-600 mb-3" aria-live="polite" id="themes-resultats">
          {status === 'ready' ? t('admin_themes.total', { count: themes.length }) : ''}
        </p>

        {/* ─── États ─────────────────────────────────────────────────────── */}
        {status === 'loading' && (
          <div className="flex items-center justify-center bg-white rounded-lg border border-gray-100 py-12" role="status">
            <span className="animate-spin rounded-full h-8 w-8 border-4 border-yellow-500 border-t-transparent mr-3" />
            <span className="text-gray-600 text-sm">{t('admin_themes.chargement')}</span>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-white rounded-lg border border-red-200 p-6 text-center" role="alert">
            <p className="text-red-700 mb-4">{errorMsg}</p>
            <button
              type="button"
              onClick={charger}
              className="px-4 py-2 bg-blue-800 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              {t('admin_themes.reessayer')}
            </button>
          </div>
        )}

        {status === 'ready' && themes.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-100 p-8 text-center">
            <p className="text-gray-600">{t('admin_themes.aucun')}</p>
          </div>
        )}

        {/* ─── Tableau (desktop) ─────────────────────────────────────────── */}
        {status === 'ready' && themes.length > 0 && (
          <>
            <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('admin_themes.titre')}</caption>
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th scope="col" className="px-4 py-3">{t('admin_themes.col_nom')}</th>
                    <th scope="col" className="px-4 py-3">{t('admin_themes.col_documents')}</th>
                    <th scope="col" className="px-4 py-3 text-right">{t('admin_themes.col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {themes.map((theme) => {
                    const enEdition = editingId === theme.id;
                    const nbDocuments = Number(theme.documents_count) || 0;
                    return (
                      <tr key={theme.id} data-theme-id={theme.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 text-gray-800">
                          {enEdition ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                renommer(theme);
                              }}
                              className="flex items-center gap-2"
                            >
                              <label htmlFor={`theme-renommer-${theme.id}`} className="sr-only">
                                {t('admin_themes.nom_label')}
                              </label>
                              <input
                                id={`theme-renommer-${theme.id}`}
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                maxLength={NOM_MAX}
                                data-theme-edit={theme.id}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') annulerRenommage();
                                }}
                                className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
                              />
                              <button
                                type="submit"
                                disabled={savingId === theme.id}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-md disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                              >
                                {t('admin_themes.enregistrer')}
                              </button>
                              <button
                                type="button"
                                onClick={annulerRenommage}
                                title={t('admin_themes.annuler')}
                                aria-label={t('admin_themes.annuler')}
                                className="px-2 py-1.5 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                              >
                                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                              </button>
                            </form>
                          ) : (
                            <span className="font-medium break-words">{theme.nom}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              nbDocuments > 0 ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {nbDocuments > 0
                              ? t('admin_themes.documents_count', { count: nbDocuments })
                              : t('admin_themes.documents_aucun')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {!enEdition && (
                            <button
                              type="button"
                              onClick={() => commencerRenommage(theme)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 mr-2 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                            >
                              <FontAwesomeIcon icon={faPenToSquare} aria-hidden="true" />
                              {t('admin_themes.modifier')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openDelete(theme)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                          >
                            <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                            {t('admin_themes.supprimer')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ─── Cartes empilées (mobile) ─────────────────────────────── */}
            <ul className="md:hidden space-y-3">
              {themes.map((theme) => {
                const enEdition = editingId === theme.id;
                const nbDocuments = Number(theme.documents_count) || 0;
                return (
                  <li key={theme.id} data-theme-id={theme.id} className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                    {enEdition ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          renommer(theme);
                        }}
                        className="space-y-2"
                      >
                        <label htmlFor={`theme-renommer-m-${theme.id}`} className="block text-xs font-semibold text-gray-600">
                          {t('admin_themes.nom_label')}
                        </label>
                        <input
                          id={`theme-renommer-m-${theme.id}`}
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={NOM_MAX}
                          data-theme-edit={theme.id}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') annulerRenommage();
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={savingId === theme.id}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-700 rounded-lg disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                          >
                            {t('admin_themes.enregistrer')}
                          </button>
                          <button
                            type="button"
                            onClick={annulerRenommage}
                            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                          >
                            {t('admin_themes.annuler')}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-gray-800 break-words">{theme.nom}</p>
                        <p className="mt-1 text-xs text-gray-600">
                          {nbDocuments > 0
                            ? t('admin_themes.documents_count', { count: nbDocuments })
                            : t('admin_themes.documents_aucun')}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => commencerRenommage(theme)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                          >
                            <FontAwesomeIcon icon={faPenToSquare} aria-hidden="true" />
                            {t('admin_themes.modifier')}
                          </button>
                          <button
                            type="button"
                            onClick={() => openDelete(theme)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                          >
                            <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                            {t('admin_themes.supprimer')}
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* ─── Modale de confirmation de suppression ──────────────────────── */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          {/* Fond cliquable : élément interactif réel (fermeture au clic),
              le dialogue reste au-dessus et n'hérite d'aucun gestionnaire. */}
          <button
            type="button"
            aria-label={t('common.fermer')}
            tabIndex={-1}
            onClick={closeDelete}
            className="absolute inset-0 h-full w-full cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="themes-delete-title"
            aria-describedby="themes-delete-desc"
            className="relative bg-white rounded-xl shadow-xl p-6 max-w-md w-full"
          >
            <h2 id="themes-delete-title" className="text-lg font-semibold text-gray-800 mb-2">
              {t('admin_themes.confirmer_suppression')}
            </h2>
            <p id="themes-delete-desc" className="text-sm text-gray-600 mb-1">
              {t('admin_themes.suppression_texte', { nom: pendingDelete.nom })}
            </p>
            {nbDocumentsModal > 0 && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 mb-1">
                {t('admin_themes.suppression_docs_avertissement', { count: nbDocumentsModal })}
              </p>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <button
                ref={cancelDeleteRef}
                type="button"
                onClick={closeDelete}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                {t('admin_themes.annuler')}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
              >
                {deleting
                  ? t('admin_themes.suppression_en_cours')
                  : nbDocumentsModal > 0
                    ? t('admin_themes.supprimer_detacher')
                    : t('admin_themes.supprimer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminThemes;
