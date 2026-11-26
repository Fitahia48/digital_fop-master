import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBan,
  faCheck,
  faCopy,
  faSpinner,
  faTrash,
  faUserPlus,
  faUsers,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import axiosInstance from './AxiosConfig';
import {
  hasErrors,
  normalizeIdentiteField,
  validateIdentite,
} from '../utils/validateIdentite';

/**
 * Gestion des comptes administrateurs (/portail-gestion/administrateurs).
 *
 * - Réservé au rôle « Super-administrateur » : vérification ici (redirection /
 *   refus visuel) ET côté serveur (403 sur /api/v1/admin-accounts) — double
 *   verrou, la sécurité réelle est serveur.
 * - Aucun sélecteur de rôle : le rôle est affiché en lecture seule.
 * - Le mot de passe provisoire n'est affiché qu'UNE FOIS, à la création, avec
 *   un bouton « Copier » ; il n'est jamais rechargé depuis l'API.
 * - Désactivation par défaut ; suppression définitive uniquement après
 *   confirmation, et refusée par le serveur si des contenus sont liés.
 */
const DEBOUNCE_MS = 300;

const roleLabel = (compte, t) =>
  compte?.is_superadmin ? t('administrateurs.role_super_admin') : t('administrateurs.role_admin');

const AdminAccounts = () => {
  const { t, i18n } = useTranslation();

  const [access, setAccess] = useState('checking'); // checking | allowed | denied | must_change
  const [me, setMe] = useState(null);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0 });
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMsg, setErrorMsg] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ nom: '', prenom: '', email: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createErrors, setCreateErrors] = useState({});
  const [createdInfo, setCreatedInfo] = useState(null); // { compte, temporary_password }
  const [copied, setCopied] = useState(false);

  const [pendingStatus, setPendingStatus] = useState(null); // compte
  const [savingStatus, setSavingStatus] = useState(false);

  // Demande de compte à confirmer ou rejeter : { compte, statut }
  const [decision, setDecision] = useState(null);
  const [savingDecision, setSavingDecision] = useState(false);

  const [pendingDelete, setPendingDelete] = useState(null); // compte
  const [deleting, setDeleting] = useState(false);

  const cancelRef = useRef(null);
  const closeCreateRef = useRef(null);

  // ─── Vérification du rôle (autonome) ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axiosInstance.get('/api/v1/profile');
        if (cancelled) return;
        setMe(res.data);
        if (res.data?.doit_changer_mot_de_passe) setAccess('must_change');
        else if (res.data?.is_superadmin) setAccess('allowed');
        else setAccess('denied');
      } catch {
        if (!cancelled) setAccess('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Liste ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await axiosInstance.get('/api/v1/admin-accounts', {
        params: { search: search || undefined },
      });
      setRows(res.data?.data || []);
      setMeta(res.data?.meta || { total: 0 });
      setStatus('ready');
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || t('administrateurs.erreur'));
      setStatus('error');
    }
  }, [search, t]);

  useEffect(() => {
    if (access === 'allowed') load();
  }, [access, load]);

  // Recherche différée (~300 ms).
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ─── Dates (fuseau Indian/Antananarivo) ──────────────────────────────────
  const formatDate = useMemo(() => {
    let formatter = null;
    try {
      formatter = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
        dateStyle: 'medium',
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
        return formatter ? formatter.format(d) : d.toISOString().slice(0, 10);
      } catch {
        return d.toISOString().slice(0, 10);
      }
    };
  }, [i18n.language]);

  // ─── Création ─────────────────────────────────────────────────────────────
  const openCreate = () => {
    setCreateForm({ nom: '', prenom: '', email: '' });
    setCreateError('');
    setCreateErrors({});
    setCreatedInfo(null);
    setCopied(false);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreatedInfo(null);
    setCopied(false);
  };

  const handleCreateChange = (e) => {
    const { name, value } = e.target;
    // Nom en majuscules et prénom capitalisé dès la saisie.
    setCreateForm((prev) => ({ ...prev, [name]: normalizeIdentiteField(name, value) }));
    // L'erreur du champ disparaît dès qu'il est corrigé.
    setCreateErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (creating) return;

    // Nom en majuscules, prénom commençant par une majuscule, e-mail valide.
    const erreurs = validateIdentite(createForm, t);
    if (hasErrors(erreurs)) {
      setCreateErrors(erreurs);
      return;
    }
    setCreateErrors({});

    setCreateError('');
    setCreating(true);
    try {
      const res = await axiosInstance.post('/api/v1/admin-accounts', {
        nom: createForm.nom,
        prenom: createForm.prenom,
        email: createForm.email,
      });
      setCreatedInfo({
        compte: res.data?.compte,
        temporary_password: res.data?.temporary_password,
        detail: res.data?.detail,
      });
      await load();
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.response?.data?.email?.[0] ||
        err.response?.data?.nom?.[0] ||
        t('administrateurs.erreur_creation');
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    const value = createdInfo?.temporary_password;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(t('administrateurs.copie_ok'));
    } catch {
      toast.error(t('administrateurs.copie_ko'));
    }
  };

  // Focus initial des modales + fermeture par Échap.
  useEffect(() => {
    const modalOpen = Boolean(pendingStatus || pendingDelete || createOpen || decision);
    if (!modalOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (createdInfo) return; // le mot de passe doit être noté avant fermeture
      if (pendingStatus) setPendingStatus(null);
      else if (pendingDelete) setPendingDelete(null);
      else if (decision) setDecision(null);
      else if (createOpen) closeCreate();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pendingStatus, pendingDelete, createOpen, createdInfo, decision]);

  useEffect(() => {
    if (pendingDelete && cancelRef.current) cancelRef.current.focus();
    if (createOpen && !createdInfo && closeCreateRef.current) closeCreateRef.current.focus();
  }, [pendingDelete, createOpen, createdInfo]);

  // ─── Désactivation / réactivation ────────────────────────────────────────
  const confirmStatus = async () => {
    if (!pendingStatus || savingStatus) return;
    setSavingStatus(true);
    try {
      const target = pendingStatus;
      const res = await axiosInstance.patch(`/api/v1/admin-accounts/${target.id}/status`, {
        blocked: !target.blocked,
      });
      toast.success(
        res.data?.compte?.blocked
          ? t('administrateurs.desactive_ok')
          : t('administrateurs.reactive_ok')
      );
      setPendingStatus(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('administrateurs.erreur'));
    } finally {
      setSavingStatus(false);
    }
  };

  // ─── Confirmation / rejet d'une demande de compte ────────────────────────
  const confirmDecision = async () => {
    if (!decision || savingDecision) return;
    setSavingDecision(true);
    try {
      // `blocked: false` est nécessaire pour que le serveur envoie l'e-mail de
      // confirmation (nouveau statut « actif »).
      const res = await axiosInstance.patch(`/api/v1/admin-accounts/${decision.compte.id}/status`, {
        statut_compte: decision.statut,
        blocked: false,
      });
      toast.success(
        res.data?.detail ||
          (decision.statut === 'actif'
            ? t('administrateurs.confirme_ok')
            : t('administrateurs.rejete_ok'))
      );
      setDecision(null);
      await load();
    } catch (err) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.detail ||
          t('administrateurs.erreur'),
        { autoClose: 7000 }
      );
    } finally {
      setSavingDecision(false);
    }
  };

  // ─── Suppression définitive ──────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await axiosInstance.delete(`/api/v1/admin-accounts/${pendingDelete.id}`);
      toast.success(t('administrateurs.supprime_ok'));
      setPendingDelete(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('administrateurs.erreur_suppression'), {
        autoClose: 7000,
      });
    } finally {
      setDeleting(false);
    }
  };

  // ─── Accès refusé ─────────────────────────────────────────────────────────
  if (access === 'denied') {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <div className="mb-4 text-5xl text-red-500" aria-hidden="true">✗</div>
          <h1 className="mb-2 text-xl font-semibold text-gray-800">
            {t('administrateurs.acces_refuse_titre')}
          </h1>
          <p className="mb-6 text-gray-600">{t('administrateurs.acces_refuse')}</p>
          <Link
            to="/"
            className="inline-block rounded-lg bg-blue-800 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {t('abonnes.retour_accueil')}
          </Link>
        </div>
      </div>
    );
  }

  if (access === 'must_change') {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-8 text-center shadow-lg">
          <h1 className="mb-2 text-xl font-semibold text-gray-800">
            {t('profil.mot_de_passe_provisoire_titre')}
          </h1>
          <p className="mb-6 text-gray-600">{t('administrateurs.mdp_provisoire')}</p>
          <Link
            to="/portail-gestion/profil"
            className="inline-block rounded-lg bg-blue-800 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {t('administrateurs.aller_profil')}
          </Link>
        </div>
      </div>
    );
  }

  if (access === 'checking') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gray-50" role="status">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-yellow-500 border-t-transparent" />
        <span className="sr-only">{t('administrateurs.chargement')}</span>
      </div>
    );
  }

  const isSelf = (compte) => compte?.id === me?.id;

  // Statut affiché : le statut de la demande prime sur les champs U&P.
  const statutBadge = (compte) => {
    if (compte?.statut_compte === 'en_attente') {
      return { label: t('administrateurs.statut_en_attente'), className: 'bg-amber-100 text-amber-800' };
    }
    if (compte?.statut_compte === 'rejete') {
      return { label: t('administrateurs.statut_rejete'), className: 'bg-red-100 text-red-700' };
    }
    return compte?.is_active
      ? { label: t('administrateurs.statut_actif'), className: 'bg-green-100 text-green-800' }
      : { label: t('administrateurs.statut_inactif'), className: 'bg-amber-100 text-amber-800' };
  };

  const isPendingDecision = (compte) =>
    compte?.statut_compte === 'en_attente' || compte?.statut_compte === 'rejete';

  return (
    <div className="min-h-[60vh] bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-gray-800">
              <FontAwesomeIcon icon={faUsers} className="text-blue-800" aria-hidden="true" />
              {t('administrateurs.titre')}
            </h1>
            <p className="text-sm text-gray-500">{t('administrateurs.sous_titre')}</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <FontAwesomeIcon icon={faUserPlus} aria-hidden="true" />
            {t('administrateurs.nouveau')}
          </button>
        </div>

        {/* ─── Recherche ─────────────────────────────────────────────── */}
        <div className="mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <label htmlFor="admins-search" className="mb-1 block text-xs font-semibold text-gray-600">
            {t('administrateurs.recherche_label')}
          </label>
          <div className="flex gap-2">
            <input
              id="admins-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('administrateurs.recherche_placeholder')}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              {t('administrateurs.effacer')}
            </button>
          </div>
        </div>

        <p className="mb-3 text-sm text-gray-600" aria-live="polite">
          {status === 'ready' ? t('administrateurs.resultats', { count: meta.total }) : ''}
        </p>

        {status === 'loading' && (
          <div className="flex items-center justify-center rounded-xl border border-gray-100 bg-white py-12" role="status">
            <span className="mr-3 h-8 w-8 animate-spin rounded-full border-4 border-yellow-500 border-t-transparent" />
            <span className="text-sm text-gray-600">{t('administrateurs.chargement')}</span>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-xl border border-red-200 bg-white p-6 text-center" role="alert">
            <p className="mb-4 text-red-700">{errorMsg}</p>
            <button
              type="button"
              onClick={load}
              className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              {t('administrateurs.reessayer')}
            </button>
          </div>
        )}

        {status === 'ready' && rows.length === 0 && (
          <div className="rounded-xl border border-gray-100 bg-white p-8 text-center">
            <p className="text-gray-600">{t('administrateurs.vide')}</p>
          </div>
        )}

        {status === 'ready' && rows.length > 0 && (
          <>
            {/* ─── Tableau (desktop) ──────────────────────────────────── */}
            <div className="hidden overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('administrateurs.titre')}</caption>
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th scope="col" className="px-4 py-3">{t('administrateurs.col_nom')}</th>
                    <th scope="col" className="px-4 py-3">{t('administrateurs.col_email')}</th>
                    <th scope="col" className="px-4 py-3">{t('administrateurs.col_role')}</th>
                    <th scope="col" className="px-4 py-3">{t('administrateurs.col_statut')}</th>
                    <th scope="col" className="px-4 py-3">{t('administrateurs.col_date')}</th>
                    <th scope="col" className="px-4 py-3 text-right">{t('administrateurs.col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((compte) => (
                    <tr key={compte.id} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {[compte.prenom, compte.nom].filter(Boolean).join(' ') || '—'}
                        {isSelf(compte) && (
                          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                            {t('administrateurs.vous')}
                          </span>
                        )}
                      </td>
                      <td className="break-all px-4 py-3 text-gray-700">{compte.email}</td>
                      <td className="px-4 py-3 text-gray-700">{roleLabel(compte, t)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            statutBadge(compte).className
                          }`}
                        >
                          {statutBadge(compte).label}
                        </span>
                        {compte.doit_changer_mot_de_passe && (
                          <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            {t('profil.mot_de_passe_a_changer')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDate(compte.date_joined)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {isPendingDecision(compte) && (
                            <>
                              <button
                                type="button"
                                onClick={() => setDecision({ compte, statut: 'actif' })}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1"
                              >
                                <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                                {t('administrateurs.confirmer_compte')}
                              </button>
                              {compte.statut_compte === 'en_attente' && (
                                <button
                                  type="button"
                                  onClick={() => setDecision({ compte, statut: 'rejete' })}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                                >
                                  <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                                  {t('administrateurs.rejeter')}
                                </button>
                              )}
                            </>
                          )}
                          {compte.statut_compte === 'actif' && (
                            <button
                              type="button"
                              onClick={() => setPendingStatus(compte)}
                              disabled={isSelf(compte)}
                              title={isSelf(compte) ? t('administrateurs.auto_action') : undefined}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FontAwesomeIcon icon={compte.blocked ? faCheck : faBan} aria-hidden="true" />
                              {compte.blocked
                                ? t('administrateurs.reactiver')
                                : t('administrateurs.desactiver')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPendingDelete(compte)}
                            disabled={isSelf(compte)}
                            title={isSelf(compte) ? t('administrateurs.auto_action') : undefined}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                            {t('administrateurs.supprimer')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ─── Cartes empilées (mobile, lisible à 375 px) ─────────── */}
            <ul className="space-y-3 md:hidden">
              {rows.map((compte) => (
                <li key={compte.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-800">
                    {[compte.prenom, compte.nom].filter(Boolean).join(' ') || '—'}
                    {isSelf(compte) && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {t('administrateurs.vous')}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 break-all text-sm text-gray-600">{compte.email}</p>
                  <p className="mt-2 text-sm text-gray-600">
                    <span className="font-semibold">{t('administrateurs.col_role')} :</span>{' '}
                    {roleLabel(compte, t)}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-semibold">{t('administrateurs.col_statut')} :</span>{' '}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        statutBadge(compte).className
                      }`}
                    >
                      {statutBadge(compte).label}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-semibold">{t('administrateurs.col_date')} :</span>{' '}
                    {formatDate(compte.date_joined)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isPendingDecision(compte) && (
                      <>
                        <button
                          type="button"
                          onClick={() => setDecision({ compte, statut: 'actif' })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1"
                        >
                          <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                          {t('administrateurs.confirmer_compte')}
                        </button>
                        {compte.statut_compte === 'en_attente' && (
                          <button
                            type="button"
                            onClick={() => setDecision({ compte, statut: 'rejete' })}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                          >
                            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                            {t('administrateurs.rejeter')}
                          </button>
                        )}
                      </>
                    )}
                    {compte.statut_compte === 'actif' && (
                      <button
                        type="button"
                        onClick={() => setPendingStatus(compte)}
                        disabled={isSelf(compte)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <FontAwesomeIcon icon={compte.blocked ? faCheck : faBan} aria-hidden="true" />
                        {compte.blocked ? t('administrateurs.reactiver') : t('administrateurs.desactiver')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPendingDelete(compte)}
                      disabled={isSelf(compte)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                      {t('administrateurs.supprimer')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* ─── Modale de création ──────────────────────────────────────────── */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          role="presentation"
          onClick={() => {
            if (!createdInfo) closeCreate();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admins-create-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="admins-create-title" className="mb-2 text-lg font-semibold text-gray-800">
              {t('administrateurs.creation_titre')}
            </h2>

            {createdInfo ? (
              <>
                <p className="mb-3 text-sm text-gray-600">{createdInfo.detail}</p>
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                    {t('administrateurs.mdp_provisoire_titre')}
                  </p>
                  <p className="mt-2 break-all rounded-md bg-white px-3 py-2 font-mono text-base text-gray-900">
                    {createdInfo.temporary_password}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                    >
                      <FontAwesomeIcon icon={faCopy} aria-hidden="true" />
                      {copied ? t('administrateurs.copie_fait') : t('administrateurs.copier')}
                    </button>
                    <span className="text-xs text-amber-900">{t('administrateurs.affiche_une_fois')}</span>
                  </div>
                </div>
                <p className="mb-4 text-sm text-gray-600">
                  {createdInfo.compte?.email} — {roleLabel(createdInfo.compte, t)}
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeCreate}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                  >
                    {t('administrateurs.fermer')}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                    {createError}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="create-prenom" className="mb-1 block text-sm font-medium text-gray-700">
                      {t('administrateurs.prenom')}
                    </label>
                    <input
                      id="create-prenom"
                      type="text"
                      name="prenom"
                      value={createForm.prenom}
                      onChange={handleCreateChange}
                      maxLength={100}
                      aria-invalid={Boolean(createErrors.prenom)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 ${
                        createErrors.prenom
                          ? 'border-red-400 focus:ring-red-400'
                          : 'border-gray-300 focus:border-blue-400 focus:ring-blue-500'
                      }`}
                    />
                    {createErrors.prenom && (
                      <p className="mt-1 text-xs text-red-600" role="alert">
                        {createErrors.prenom}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="create-nom" className="mb-1 block text-sm font-medium text-gray-700">
                      {t('administrateurs.nom')}
                    </label>
                    <input
                      id="create-nom"
                      type="text"
                      name="nom"
                      value={createForm.nom}
                      onChange={handleCreateChange}
                      required
                      maxLength={100}
                      aria-invalid={Boolean(createErrors.nom)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 ${
                        createErrors.nom
                          ? 'border-red-400 focus:ring-red-400'
                          : 'border-gray-300 focus:border-blue-400 focus:ring-blue-500'
                      }`}
                    />
                    {createErrors.nom && (
                      <p className="mt-1 text-xs text-red-600" role="alert">
                        {createErrors.nom}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="create-email" className="mb-1 block text-sm font-medium text-gray-700">
                    {t('administrateurs.email')}
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    name="email"
                    value={createForm.email}
                    onChange={handleCreateChange}
                    required
                    autoComplete="off"
                    aria-invalid={Boolean(createErrors.email)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 ${
                      createErrors.email
                        ? 'border-red-400 focus:ring-red-400'
                        : 'border-gray-300 focus:border-blue-400 focus:ring-blue-500'
                    }`}
                  />
                  {createErrors.email && (
                    <p className="mt-1 text-xs text-red-600" role="alert">
                      {createErrors.email}
                    </p>
                  )}
                </div>

                <p className="text-xs text-gray-500">{t('administrateurs.creation_aide')}</p>

                <div className="flex justify-end gap-3">
                  <button
                    ref={closeCreateRef}
                    type="button"
                    onClick={closeCreate}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                  >
                    {t('administrateurs.annuler')}
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creating && <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />}
                    {creating ? t('administrateurs.creation_en_cours') : t('administrateurs.creer')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── Modale désactivation / réactivation ─────────────────────────── */}
      {pendingStatus && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="presentation"
          onClick={() => setPendingStatus(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admins-status-title"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="admins-status-title" className="mb-2 text-lg font-semibold text-gray-800">
              {pendingStatus.blocked
                ? t('administrateurs.confirmer_reactivation')
                : t('administrateurs.confirmer_desactivation')}
            </h2>
            <p className="mb-1 text-sm text-gray-600">
              {pendingStatus.blocked
                ? t('administrateurs.texte_reactivation')
                : t('administrateurs.texte_desactivation')}
            </p>
            <p className="mb-5 break-all text-sm font-medium text-gray-800">{pendingStatus.email}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingStatus(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                {t('administrateurs.annuler')}
              </button>
              <button
                type="button"
                onClick={confirmStatus}
                disabled={savingStatus}
                className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                {savingStatus ? t('administrateurs.chargement') : t('administrateurs.confirmer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modale confirmation / rejet d'une demande de compte ─────────── */}
      {decision && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="presentation"
          onClick={() => setDecision(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admins-decision-title"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="admins-decision-title" className="mb-2 text-lg font-semibold text-gray-800">
              {decision.statut === 'actif'
                ? t('administrateurs.confirmer_confirmation')
                : t('administrateurs.confirmer_rejet')}
            </h2>
            <p className="mb-1 text-sm text-gray-600">
              {decision.statut === 'actif'
                ? t('administrateurs.texte_confirmation')
                : t('administrateurs.texte_rejet')}
            </p>
            <p className="mb-5 break-all text-sm font-medium text-gray-800">{decision.compte.email}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDecision(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                {t('administrateurs.annuler')}
              </button>
              <button
                type="button"
                onClick={confirmDecision}
                disabled={savingDecision}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                  decision.statut === 'actif'
                    ? 'bg-green-700 hover:bg-green-600 focus-visible:ring-green-500'
                    : 'bg-red-600 hover:bg-red-500 focus-visible:ring-red-400'
                }`}
              >
                {savingDecision
                  ? t('administrateurs.chargement')
                  : decision.statut === 'actif'
                    ? t('administrateurs.confirmer_compte')
                    : t('administrateurs.rejeter')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modale suppression définitive ──────────────────────────────── */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="presentation"
          onClick={() => setPendingDelete(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admins-delete-title"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="admins-delete-title" className="mb-2 text-lg font-semibold text-gray-800">
              {t('administrateurs.confirmer_suppression')}
            </h2>
            <p className="mb-1 text-sm text-gray-600">{t('administrateurs.texte_suppression')}</p>
            <p className="mb-5 break-all text-sm font-medium text-gray-800">{pendingDelete.email}</p>
            <div className="flex justify-end gap-3">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                {t('administrateurs.annuler')}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
              >
                {deleting ? t('administrateurs.chargement') : t('administrateurs.supprimer_definitivement')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAccounts;
