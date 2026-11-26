import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faKey, faSpinner, faUser } from '@fortawesome/free-solid-svg-icons';
import axiosInstance from './AxiosConfig';
import { userContext } from './Context';
import { logout } from '../features/auth/authSlice';
import { hasErrors, normalizeIdentiteField, validateIdentite } from '../utils/validateIdentite';

/**
 * Profil de l'administrateur connecté (/portail-gestion/profil).
 *
 * - l'identité vient TOUJOURS du jeton côté serveur (/api/v1/profile) ;
 * - un utilisateur ne peut modifier que son propre profil : aucun identifiant
 *   n'est envoyé dans le corps de la requête ;
 * - le rôle est affiché en lecture seule ;
 * - le mot de passe provisoire doit être changé ici : tant qu'il ne l'est pas,
 *   le serveur limite l'accès au profil (403 sur le reste de l'administration).
 */
const MonProfil = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { setUser, setIsAdmin, setIsSuperAdmin } = useContext(userContext);

  const [profil, setProfil] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error' | 'denied'
  const [errorMsg, setErrorMsg] = useState('');

  const [form, setForm] = useState({ nom: '', prenom: '', email: '' });
  const [formErrors, setFormErrors] = useState({});
  const [savingProfil, setSavingProfil] = useState(false);

  const [pwd, setPwd] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axiosInstance.get('/api/v1/profile');
        if (cancelled) return;
        setProfil(res.data);
        setForm({
          nom: res.data?.nom || '',
          prenom: res.data?.prenom || '',
          email: res.data?.email || '',
        });
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 401) {
          setStatus('denied');
        } else if (err.response?.status === 403) {
          setStatus('denied');
        } else {
          setErrorMsg(err.response?.data?.detail || t('profil.erreur_chargement'));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleProfilChange = (e) => {
    const { name, value } = e.target;
    // Nom en majuscules et prénom capitalisé dès la saisie.
    setForm((prev) => ({ ...prev, [name]: normalizeIdentiteField(name, value) }));
    // L'erreur du champ disparaît dès qu'il est corrigé.
    setFormErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const handleProfilSubmit = async (e) => {
    e.preventDefault();
    if (savingProfil) return;

    // Nom en majuscules, prénom commençant par une majuscule, e-mail valide.
    const erreurs = validateIdentite(form, t);
    if (hasErrors(erreurs)) {
      setFormErrors(erreurs);
      return;
    }
    setFormErrors({});

    setSavingProfil(true);
    try {
      const res = await axiosInstance.patch('/api/v1/profile', {
        nom: form.nom,
        prenom: form.prenom,
        email: form.email,
      });
      setProfil(res.data?.profil || profil);
      toast.success(t('profil.mise_a_jour_ok'));
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.response?.data?.email?.[0] ||
        err.response?.data?.nom?.[0] ||
        t('profil.erreur_enregistrement');
      toast.error(message, { toastId: 'profil-erreur' });
    } finally {
      setSavingProfil(false);
    }
  };

  const handlePwdChange = (e) => {
    setPwd((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (pwdError) setPwdError('');
  };

  const handlePwdSubmit = async (e) => {
    e.preventDefault();
    if (savingPwd) return;
    setPwdError('');

    if (pwd.new_password !== pwd.confirm_password) {
      setPwdError(t('profil.mdp_differents'));
      return;
    }
    if (pwd.new_password.length < 10) {
      setPwdError(t('profil.mdp_trop_court'));
      return;
    }
    if (!/[A-Za-z]/.test(pwd.new_password) || !/\d/.test(pwd.new_password)) {
      setPwdError(t('profil.mdp_regles'));
      return;
    }

    setSavingPwd(true);
    try {
      await axiosInstance.post('/api/v1/profile/password', pwd);
      toast.success(t('profil.mdp_change_ok'), { toastId: 'profil-mdp-ok' });
      // Toutes les sessions de rafraîchissement sont invalidées côté serveur :
      // on termine proprement la session locale et on repasse par la connexion.
      dispatch(logout());
      setUser('');
      setIsAdmin(false);
      setIsSuperAdmin(false);
      navigate('/portail-gestion/connexion', { replace: true });
    } catch (err) {
      const message = err.response?.data?.detail || t('profil.erreur_mdp');
      setPwdError(message);
      toast.error(message, { toastId: 'profil-mdp-erreur' });
    } finally {
      setSavingPwd(false);
    }
  };

  if (status === 'denied') {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <h1 className="mb-2 text-xl font-semibold text-gray-800">{t('profil.acces_refuse_titre')}</h1>
          <p className="mb-6 text-gray-600">{t('profil.acces_refuse')}</p>
          <Link
            to="/portail-gestion/connexion"
            className="inline-block rounded-lg bg-blue-800 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {t('auth.se_connecter')}
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gray-50" role="status">
        <span className="mr-3 h-10 w-10 animate-spin rounded-full border-4 border-yellow-500 border-t-transparent" />
        <span className="text-sm text-gray-600">{t('profil.chargement')}</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 text-center" role="alert">
          <p className="mb-4 text-red-700">{errorMsg}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          >
            {t('profil.reessayer')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-2xl font-bold text-gray-800">{t('profil.titre')}</h1>
        <p className="mb-6 text-sm text-gray-500">{t('profil.sous_titre')}</p>

        {profil?.doit_changer_mot_de_passe && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <p className="font-semibold">{t('profil.mot_de_passe_provisoire_titre')}</p>
            <p className="mt-1">{t('profil.mot_de_passe_provisoire_texte')}</p>
          </div>
        )}

        {/* ─── Informations du profil ─────────────────────────────────── */}
        <section className="mb-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <FontAwesomeIcon icon={faUser} className="text-blue-800" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-gray-800">{t('profil.infos_titre')}</h2>
          </div>

          <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <span className="font-semibold text-gray-700">{t('profil.role')} :</span>{' '}
            {profil?.role || '—'}
            {profil?.doit_changer_mot_de_passe && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {t('profil.mot_de_passe_a_changer')}
              </span>
            )}
          </div>

          <form onSubmit={handleProfilSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="profil-nom" className="mb-1 block text-sm font-medium text-gray-700">
                  {t('profil.nom')}
                </label>
                <input
                  id="profil-nom"
                  type="text"
                  name="nom"
                  value={form.nom}
                  onChange={handleProfilChange}
                  required
                  maxLength={100}
                  autoComplete="family-name"
                  aria-invalid={Boolean(formErrors.nom)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 ${
                    formErrors.nom
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-gray-300 focus:border-blue-400 focus:ring-blue-500'
                  }`}
                />
                {formErrors.nom && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {formErrors.nom}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="profil-prenom" className="mb-1 block text-sm font-medium text-gray-700">
                  {t('profil.prenom')}
                </label>
                <input
                  id="profil-prenom"
                  type="text"
                  name="prenom"
                  value={form.prenom}
                  onChange={handleProfilChange}
                  maxLength={100}
                  autoComplete="given-name"
                  aria-invalid={Boolean(formErrors.prenom)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 ${
                    formErrors.prenom
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-gray-300 focus:border-blue-400 focus:ring-blue-500'
                  }`}
                />
                {formErrors.prenom && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {formErrors.prenom}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="profil-email" className="mb-1 block text-sm font-medium text-gray-700">
                {t('profil.email')}
              </label>
              <input
                id="profil-email"
                type="email"
                name="email"
                value={form.email}
                onChange={handleProfilChange}
                required
                autoComplete="email"
                aria-describedby="profil-email-aide"
                aria-invalid={Boolean(formErrors.email)}
                className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 ${
                  formErrors.email
                    ? 'border-red-400 focus:ring-red-400'
                    : 'border-gray-300 focus:border-blue-400 focus:ring-blue-500'
                }`}
              />
              {formErrors.email ? (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {formErrors.email}
                </p>
              ) : (
                <p id="profil-email-aide" className="mt-1 text-xs text-gray-500">
                  {t('profil.email_aide')}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingProfil}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingProfil && <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />}
                {savingProfil ? t('profil.enregistrement') : t('profil.enregistrer')}
              </button>
            </div>
          </form>
        </section>

        {/* ─── Changement de mot de passe ─────────────────────────────── */}
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <FontAwesomeIcon icon={faKey} className="text-yellow-600" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-gray-800">{t('profil.mdp_titre')}</h2>
          </div>

          {pwdError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              {pwdError}
            </div>
          )}

          <form onSubmit={handlePwdSubmit} className="space-y-4">
            <div>
              <label htmlFor="pwd-current" className="mb-1 block text-sm font-medium text-gray-700">
                {t('profil.mdp_actuel')}
              </label>
              <input
                id="pwd-current"
                type="password"
                name="current_password"
                value={pwd.current_password}
                onChange={handlePwdChange}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pwd-new" className="mb-1 block text-sm font-medium text-gray-700">
                  {t('profil.mdp_nouveau')}
                </label>
                <input
                  id="pwd-new"
                  type="password"
                  name="new_password"
                  value={pwd.new_password}
                  onChange={handlePwdChange}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  aria-describedby="pwd-aide"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="pwd-confirm" className="mb-1 block text-sm font-medium text-gray-700">
                  {t('profil.mdp_confirmation')}
                </label>
                <input
                  id="pwd-confirm"
                  type="password"
                  name="confirm_password"
                  value={pwd.confirm_password}
                  onChange={handlePwdChange}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <p id="pwd-aide" className="text-xs text-gray-500">
              {t('profil.mdp_aide')}
            </p>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPwd}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-800 to-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-blue-700 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingPwd && <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />}
                {savingPwd ? t('profil.enregistrement') : t('profil.mdp_bouton')}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

export default MonProfil;
