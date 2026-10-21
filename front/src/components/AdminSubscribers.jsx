import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import axiosInstance from './AxiosConfig';

/**
 * Espace administrateur « Abonnés aux alertes » (/admin/abonnes).
 *
 * - Route protégée (ProtectedRoute dans App.jsx) + VÉRIFICATION ADMIN ici :
 *   la page interroge /api/v1/auth/users/me/ elle-même pour ne pas dépendre du
 *   timing du contexte global, puis chaque appel d'API est en plus contrôlé
 *   côté serveur (403 si non-admin : double verrou).
 * - Seuls des champs sûrs sont affichés : jamais confirm_token /
 *   unsubscribe_token (l'API admin ne les renvoie pas).
 * - Aucune librairie supplémentaire (Tailwind + react-i18next + axios).
 */
const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

const SORTS = ['date_desc', 'date_asc', 'email_asc'];

const AdminSubscribers = () => {
  const { t, i18n } = useTranslation();

  // Vérification admin autonome : 'checking' | 'allowed' | 'denied'
  const [access, setAccess] = useState('checking');

  const [rows, setRows] = useState([]);
  const [counters, setCounters] = useState(null);
  const [meta, setMeta] = useState({ total: 0, page: 1, page_size: PAGE_SIZE, page_count: 1 });
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('tous');
  const [langue, setLangue] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [page, setPage] = useState(1);

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
  const load = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await axiosInstance.get('/api/subscribers/admin/list', {
        params: {
          search: search || undefined,
          statut,
          langue: langue || undefined,
          sort,
          page,
          page_size: PAGE_SIZE,
        },
      });
      setRows(res.data?.data || []);
      setMeta(res.data?.meta || { total: 0, page: 1, page_size: PAGE_SIZE, page_count: 1 });
      setCounters(res.data?.counters || null);
      setStatus('ready');
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || t('abonnes.erreur'));
      setStatus('error');
    }
  }, [search, statut, langue, sort, page, t]);

  useEffect(() => {
    if (access === 'allowed') load();
  }, [access, load]);

  // Recherche avec délai de saisie (~300 ms) — remet la page à 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch((prev) => {
        const next = searchInput.trim();
        if (prev !== next) setPage(1);
        return next;
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ─── Dates : fuseau Indian/Antananarivo, format lisible ───────────────────
  const formatDate = useMemo(() => {
    let formatter = null;
    try {
      formatter = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Indian/Antananarivo',
      });
    } catch {
      formatter = null;
    }
    return (value) => {
      if (!value) return '—';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      try {
        return formatter ? formatter.format(d) : d.toISOString().slice(0, 16).replace('T', ' ');
      } catch {
        return d.toISOString().slice(0, 16).replace('T', ' ');
      }
    };
  }, [i18n.language]);

  // ─── Export CSV (mêmes filtres que l'affichage) ───────────────────────────
  const handleExport = async () => {
    try {
      const res = await axiosInstance.get('/api/subscribers/admin/export', {
        params: {
          search: search || undefined,
          statut,
          langue: langue || undefined,
          sort,
        },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `abonnes-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(t('abonnes.export_ok'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('abonnes.erreur'));
    }
  };

  // ─── Suppression avec confirmation ────────────────────────────────────────
  const openDelete = (row) => setPendingDelete(row);
  const closeDelete = () => setPendingDelete(null);

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await axiosInstance.delete(`/api/subscribers/admin/${pendingDelete.id}`);
      toast.success(t('abonnes.supprime_ok'));
      setPendingDelete(null);
      if (rows.length === 1 && page > 1) {
        setPage(page - 1); // la page courante devient vide : on recule d'une page
      } else {
        await load();
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('abonnes.supprime_ko'));
    } finally {
      setDeleting(false);
    }
  };

  // Focus sur « Annuler » à l'ouverture de la modale + fermeture par Échap
  useEffect(() => {
    if (pendingDelete && cancelDeleteRef.current) cancelDeleteRef.current.focus();
    if (!pendingDelete) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeDelete();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pendingDelete]);

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatut('tous');
    setLangue('');
    setSort('date_desc');
    setPage(1);
  };

  // ─── Refus d'accès (non-admin) ───────────────────────────────────────────
  if (access === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] bg-gray-50 px-4">
        <div className="bg-white shadow-lg rounded-lg p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4" aria-hidden="true">✗</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">{t('abonnes.acces_refuse_titre')}</h1>
          <p className="text-gray-600 mb-6">{t('abonnes.acces_refuse')}</p>
          <Link
            to="/"
            className="inline-block px-5 py-2 bg-blue-800 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {t('abonnes.retour_accueil')}
          </Link>
        </div>
      </div>
    );
  }

  if (access === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-[50vh] bg-gray-50" role="status">
        <span className="animate-spin rounded-full h-10 w-10 border-4 border-yellow-500 border-t-transparent" />
        <span className="sr-only">{t('abonnes.chargement')}</span>
      </div>
    );
  }

  const statutLabel = (confirmed) => (confirmed ? t('abonnes.badge_confirme') : t('abonnes.badge_attente'));

  return (
    <div className="bg-gray-50 min-h-[60vh] py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">{t('abonnes.titre')}</h1>
        <p className="text-sm text-gray-500 mb-6">{t('abonnes.sous_titre')}</p>

        {/* ─── Compteurs ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('abonnes.total')}</p>
            <p className="text-2xl font-bold text-gray-800">{counters ? counters.total : '—'}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('abonnes.confirmes')}</p>
            <p className="text-2xl font-bold text-green-700">{counters ? counters.confirmes : '—'}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('abonnes.en_attente')}</p>
            <p className="text-2xl font-bold text-amber-600">{counters ? counters.en_attente : '—'}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              {t('abonnes.par_langue')}
            </p>
            <p className="text-sm text-gray-700">
              {counters
                ? `FR ${counters.par_langue.fr} · EN ${counters.par_langue.en} · MG ${counters.par_langue.mg}`
                : '—'}
            </p>
          </div>
        </div>

        {/* ─── Recherche + filtres + export ──────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="abonnes-search" className="block text-xs font-semibold text-gray-600 mb-1">
                {t('abonnes.recherche_label')}
              </label>
              <div className="flex gap-2">
                <input
                  id="abonnes-search"
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t('abonnes.recherche_placeholder')}
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                >
                  {t('abonnes.effacer')}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="abonnes-statut" className="block text-xs font-semibold text-gray-600 mb-1">
                {t('abonnes.filtre_statut')}
              </label>
              <select
                id="abonnes-statut"
                value={statut}
                onChange={(e) => {
                  setStatut(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="tous">{t('abonnes.statut_tous')}</option>
                <option value="confirmes">{t('abonnes.statut_confirmes')}</option>
                <option value="en_attente">{t('abonnes.statut_en_attente')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="abonnes-langue" className="block text-xs font-semibold text-gray-600 mb-1">
                {t('abonnes.filtre_langue')}
              </label>
              <select
                id="abonnes-langue"
                value={langue}
                onChange={(e) => {
                  setLangue(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('abonnes.langue_toutes')}</option>
                <option value="fr">FR</option>
                <option value="en">EN</option>
                <option value="mg">MG</option>
              </select>
            </div>

            <div>
              <label htmlFor="abonnes-tri" className="block text-xs font-semibold text-gray-600 mb-1">
                {t('abonnes.tri')}
              </label>
              <select
                id="abonnes-tri"
                value={sort}
                onChange={(e) => {
                  const v = e.target.value;
                  setSort(SORTS.includes(v) ? v : 'date_desc');
                  setPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="date_desc">{t('abonnes.tri_date_desc')}</option>
                <option value="date_asc">{t('abonnes.tri_date_asc')}</option>
                <option value="email_asc">{t('abonnes.tri_email_asc')}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleExport}
              className="px-4 py-2 bg-blue-800 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 whitespace-nowrap"
            >
              {t('abonnes.export')}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-3">{t('abonnes.export_avertissement')}</p>
        </div>

        {/* ─── Nombre de résultats (aria-live) ───────────────────────────── */}
        <p className="text-sm text-gray-600 mb-3" aria-live="polite" id="abonnes-resultats">
          {status === 'ready' ? t('abonnes.resultats', { count: meta.total }) : ''}
        </p>

        {/* ─── États ─────────────────────────────────────────────────────── */}
        {status === 'loading' && (
          <div className="flex items-center justify-center bg-white rounded-lg border border-gray-100 py-12" role="status">
            <span className="animate-spin rounded-full h-8 w-8 border-4 border-yellow-500 border-t-transparent mr-3" />
            <span className="text-gray-600 text-sm">{t('abonnes.chargement')}</span>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-white rounded-lg border border-red-200 p-6 text-center" role="alert">
            <p className="text-red-700 mb-4">{errorMsg}</p>
            <button
              type="button"
              onClick={load}
              className="px-4 py-2 bg-blue-800 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              {t('abonnes.reessayer')}
            </button>
          </div>
        )}

        {status === 'ready' && rows.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-100 p-8 text-center">
            <p className="text-gray-600 mb-4">{t('abonnes.vide')}</p>
            <button
              type="button"
              onClick={resetFilters}
              className="px-4 py-2 bg-blue-800 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              {t('abonnes.reinitialiser')}
            </button>
          </div>
        )}

        {/* ─── Tableau (desktop) ─────────────────────────────────────────── */}
        {status === 'ready' && rows.length > 0 && (
          <>
            <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('abonnes.titre')}</caption>
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th scope="col" className="px-4 py-3">{t('abonnes.col_email')}</th>
                    <th scope="col" className="px-4 py-3">{t('abonnes.col_statut')}</th>
                    <th scope="col" className="px-4 py-3">{t('abonnes.col_langue')}</th>
                    <th scope="col" className="px-4 py-3">{t('abonnes.col_date')}</th>
                    <th scope="col" className="px-4 py-3 text-right">{t('abonnes.col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-800 break-all">{row.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            row.is_confirmed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {/* Pastille + libellé texte : jamais la couleur seule */}
                          {statutLabel(row.is_confirmed)}
                        </span>
                      </td>
                      <td className="px-4 py-3 uppercase text-gray-700">{row.langue_preferee || 'fr'}</td>
                      <td className="px-4 py-3 text-gray-700">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDelete(row)}
                          className="px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                        >
                          {t('abonnes.supprimer')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ─── Cartes empilées (mobile) ─────────────────────────────── */}
            <ul className="md:hidden space-y-3">
              {rows.map((row) => (
                <li key={row.id} className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                  <p className="text-sm font-semibold text-gray-800 break-all">{row.email}</p>
                  <p className="mt-2 text-sm text-gray-600">
                    <span className="font-semibold">{t('abonnes.col_statut')} :</span>{' '}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.is_confirmed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {statutLabel(row.is_confirmed)}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-semibold">{t('abonnes.col_langue')} :</span>{' '}
                    <span className="uppercase">{row.langue_preferee || 'fr'}</span>
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-semibold">{t('abonnes.col_date')} :</span> {formatDate(row.createdAt)}
                  </p>
                  <button
                    type="button"
                    onClick={() => openDelete(row)}
                    className="mt-3 px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                  >
                    {t('abonnes.supprimer')}
                  </button>
                </li>
              ))}
            </ul>

            {/* ─── Pagination ─────────────────────────────────────────────── */}
            <nav className="flex items-center justify-between mt-4" aria-label={t('abonnes.pagination_nav')}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={meta.page <= 1 || status === 'loading'}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                {t('abonnes.precedent')}
              </button>
              <span className="text-sm text-gray-600">
                {t('abonnes.page_sur', { page: meta.page, count: meta.page_count })}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(meta.page_count, p + 1))}
                disabled={meta.page >= meta.page_count || status === 'loading'}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                {t('abonnes.suivant')}
              </button>
            </nav>
          </>
        )}
      </div>

      {/* ─── Modale de confirmation de suppression ────────────────────────── */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="presentation"
          onClick={closeDelete}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="abonnes-delete-title"
            aria-describedby="abonnes-delete-desc"
            className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="abonnes-delete-title" className="text-lg font-semibold text-gray-800 mb-2">
              {t('abonnes.modale_titre')}
            </h2>
            <p id="abonnes-delete-desc" className="text-sm text-gray-600 mb-1">
              {t('abonnes.modale_texte')}
            </p>
            <p className="text-sm text-gray-800 font-medium break-all mb-5">{pendingDelete.email}</p>
            <div className="flex justify-end gap-3">
              <button
                ref={cancelDeleteRef}
                type="button"
                onClick={closeDelete}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                {t('abonnes.annuler')}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
              >
                {deleting ? t('abonnes.chargement') : t('abonnes.confirmer_suppression')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSubscribers;
