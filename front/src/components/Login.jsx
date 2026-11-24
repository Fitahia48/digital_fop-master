import { useState, useEffect, useContext, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faEnvelope,
    faEye,
    faEyeSlash,
    faExternalLinkAlt,
    faLock,
    faSpinner,
    faUser,
    faCheckCircle,
} from '@fortawesome/free-solid-svg-icons';
import axiosInstance from './AxiosConfig';
import { useDispatch, useSelector } from 'react-redux';
import { login, reset } from '../features/auth/authSlice';
import { toast } from 'react-toastify';
import { userContext } from './Context';
import LanguageSwitcher from './LanguageSwitcher';
import logoMadagascar from '../assets/logo-madagascar.webp';
import MTEFOP from '../assets/MTEFOP.png';
import DEAJ from '../assets/DEAJ.png';

/**
 * Page de connexion (/portail-gestion/connexion).
 *
 * Écran autonome : l'en-tête et le menu publics sont masqués sur cette route
 * (cf. App.jsx), le pied de page et l'assistant le sont déjà. La mise en page
 * est donc un panneau de marque + formulaire, centré sur fond sombre.
 *
 * Permet également la création de compte administrateur ("Pas de compte ?")
 * avec envoi automatique d'un e-mail d'activation.
 */
function Login() {
    const { t, i18n } = useTranslation();
    const [isRegister, setIsRegister] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });
    const [showPassword, setShowPassword] = useState(false);

    // Données d'inscription administrateur
    const [registerData, setRegisterData] = useState({
        nom: '',
        prenom: '',
        email: '',
        password: '',
        re_password: '',
    });
    const [showRegisterPassword, setShowRegisterPassword] = useState(false);
    const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
    const [registerLoading, setRegisterLoading] = useState(false);
    const [registerSuccessMsg, setRegisterSuccessMsg] = useState('');
    const [registerErrorMsg, setRegisterErrorMsg] = useState('');

    const { setUser, setIsAdmin } = useContext(userContext);
    // Une seule redirection + un seul toast par « session » de la page :
    // sans cette garde, l'effet se relance (reset(), changements de contexte)
    // et le toast de bienvenue s'affichait 2 à 3 fois empilés.
    const redirectionFaite = useRef(false);

    const { email, password } = formData;

    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { user, isLoading, isError, isSuccess, message } = useSelector((state) => state.auth);

    const handleChange = (e) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
    };

    const handleRegisterChange = (e) => {
        setRegisterData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
        if (registerErrorMsg) setRegisterErrorMsg('');
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const userData = {
            email,
            password,
        };
        dispatch(login(userData));
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setRegisterErrorMsg('');

        if (registerData.password !== registerData.re_password) {
            const err = t('auth.mdp_differents') || 'Les mots de passe ne correspondent pas.';
            setRegisterErrorMsg(err);
            toast.error(err, { toastId: 'reg-mdp' });
            return;
        }

        if (registerData.password.length < 8) {
            const err = 'Le mot de passe doit contenir au moins 8 caractères.';
            setRegisterErrorMsg(err);
            toast.error(err, { toastId: 'reg-len' });
            return;
        }

        setRegisterLoading(true);
        try {
            const res = await axiosInstance.post('/api/v1/auth/users', {
                nom: registerData.nom,
                prenom: registerData.prenom,
                email: registerData.email,
                password: registerData.password,
                re_password: registerData.re_password,
                langue_preferee: i18n.language || 'fr',
            });

            const successMsg =
                res.data?.detail ||
                t('auth.compte_cree') ||
                'Compte créé avec succès ! Un e-mail de confirmation a été envoyé à votre adresse.';
            setRegisterSuccessMsg(successMsg);
            toast.success(t('auth.compte_cree') || 'Compte créé ! Vérifiez votre boîte mail.', {
                toastId: 'register-success',
            });
        } catch (err) {
            const errMsg =
                err.response?.data?.detail ||
                err.response?.data?.email?.[0] ||
                err.response?.data?.password?.[0] ||
                t('auth.inscription_erreur') ||
                'Erreur lors de la création du compte.';
            setRegisterErrorMsg(errMsg);
            toast.error(errMsg, { toastId: 'register-error' });
        } finally {
            setRegisterLoading(false);
        }
    };

    useEffect(() => {
        if (isError) {
            // toastId : même en cas de double déclenchement, un seul affichage.
            const errDetail = message || t('auth.identifiants_invalides');
            toast.error(errDetail, { toastId: 'login-erreur' });
        }

        if ((isSuccess || user) && !redirectionFaite.current) {
            if (JSON.parse(localStorage.getItem('user'))) {
                redirectionFaite.current = true;
                // Toast réservé à une connexion fraîche (isSuccess) : rouvrir la
                // page de connexion avec un token déjà en localStorage redirige
                // sans rejouer « Bienvenue… ».
                const notifierBienvenue = isSuccess;
                setUser(JSON.parse(localStorage.getItem('user')));
                // Redirection différenciée : admin → dashboard, usager standard → accueil
                const redirectAfterLogin = async () => {
                    try {
                        // Pas d'en-tête Authorization en dur : l'intercepteur
                        // d'AxiosConfig attache le token à jour depuis le
                        // localStorage et le renouvelle au besoin.
                        const res = await axiosInstance.get('/api/v1/auth/users/me/');
                        const isAdminUser = Boolean(res.data.is_staff || res.data.is_superuser);
                        // Alimenter aussi le contexte : sans cela, un login « à chaud »
                        // laisse isAdmin=false (App ne recharge le profil qu'au montage
                        // si un token existait déjà) et les entrées de menu adminOnly
                        // (ex. « Abonnés ») resteraient invisibles jusqu'au rechargement.
                        setIsAdmin(isAdminUser);
                        // Design du toast de bienvenue : message centré, gras,
                        // largeur suffisante pour éviter le retour à la ligne du « ! ».
                        const optionsBienvenue = {
                            style: { maxWidth: '28rem', textAlign: 'center', fontWeight: 600 },
                        };
                        if (isAdminUser) {
                            navigate('/dashboard');
                            if (notifierBienvenue) {
                                toast.success(t('auth.bienvenue_dashboard'), {
                                    ...optionsBienvenue,
                                    toastId: 'bienvenue-dashboard',
                                });
                            }
                        } else {
                            navigate('/');
                            if (notifierBienvenue) {
                                toast.success(t('auth.bienvenue_usager'), {
                                    ...optionsBienvenue,
                                    toastId: 'bienvenue-usager',
                                });
                            }
                        }
                    } catch {
                        // En cas d'échec du profil, comportement historique par prudence
                        navigate('/dashboard');
                    }
                };
                redirectAfterLogin();
            }
        }

        dispatch(reset());
    }, [isError, isSuccess, user, message, navigate]);

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a1626] px-4 py-8 sm:px-6">
            {/* Décor : deux halos discrets, purement visuels */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-40 -left-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-48 -right-24 h-[28rem] w-[28rem] rounded-full bg-teal-500/20 blur-3xl"
            />

            <div className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 lg:grid-cols-[1.05fr_1fr]">
                {/* ─── Panneau de marque (desktop) ─────────────────────────── */}
                <section className="relative hidden flex-col justify-between bg-gradient-to-br from-[#0b2a49] via-[#0f3c63] to-teal-700 p-10 text-white lg:flex">
                    <div className="flex items-center gap-4 rounded-xl bg-white/95 p-3 shadow-sm">
                        <img
                            src={MTEFOP}
                            alt="Logo du Ministère du Travail, de l'Emploi et de la Fonction Publique"
                            className="h-14 w-auto"
                        />
                        <img
                            src={logoMadagascar}
                            alt="Emblème de la République de Madagascar"
                            className="h-14 w-auto"
                        />
                        <img
                            src={DEAJ}
                            alt="Logo de la Direction des Études et des Affaires Juridiques"
                            className="h-14 w-auto"
                        />
                    </div>

                    <div className="my-10">
                        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-teal-100">
                            MTeFOP
                        </p>
                        <h2 className="text-3xl font-bold leading-tight text-white">
                            {t('menu.bibliotheque')}
                        </h2>
                        <p className="mt-3 max-w-sm text-sm leading-relaxed text-blue-100">
                            {t('auth.brand_sous_titre')}
                        </p>
                    </div>

                    <a
                        href="https://www.mtefpls.gov.mg"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-blue-100 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    >
                        {t('header.visiter_site')}
                        <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xs" aria-hidden="true" />
                    </a>
                </section>

                {/* ─── Formulaire ──────────────────────────────────────────── */}
                <section className="p-7 sm:p-10">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 lg:hidden">
                            <img src={MTEFOP} alt="" className="h-10 w-auto" />
                            <img src={DEAJ} alt="" className="h-10 w-auto" />
                        </div>
                        <LanguageSwitcher className="ml-auto" />
                    </div>

                    {!isRegister ? (
                        <>
                            {/* ─── Mode Connexion ─── */}
                            <div className="mt-8 sm:mt-10">
                                <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                                    {t('auth.se_connecter')}
                                </h1>
                                <p className="mt-2 text-sm text-gray-500">{t('auth.connexion_sous_titre')}</p>
                            </div>

                            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                                <div>
                                    <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-gray-700">
                                        {t('auth.email')}
                                    </label>
                                    <div className="relative">
                                        <span
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-gray-400"
                                        >
                                            <FontAwesomeIcon icon={faEnvelope} />
                                        </span>
                                        <input
                                            id="login-email"
                                            type="email"
                                            name="email"
                                            value={email}
                                            onChange={handleChange}
                                            required
                                            autoComplete="email"
                                            placeholder="nom@mtefop.mg"
                                            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-11 pr-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-1.5 flex items-center justify-between gap-3">
                                        <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">
                                            {t('auth.mot_de_passe')}
                                        </label>
                                        <Link
                                            to="/resetpassword"
                                            className="text-xs font-medium text-teal-700 underline-offset-4 hover:text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                                        >
                                            {t('auth.mot_de_passe_oublie')}
                                        </Link>
                                    </div>
                                    <div className="relative">
                                        <span
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-gray-400"
                                        >
                                            <FontAwesomeIcon icon={faLock} />
                                        </span>
                                        <input
                                            id="login-password"
                                            type={showPassword ? 'text' : 'password'}
                                            name="password"
                                            value={password}
                                            onChange={handleChange}
                                            required
                                            autoComplete="current-password"
                                            placeholder="••••••••"
                                            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-11 pr-12 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((v) => !v)}
                                            aria-label={
                                                showPassword
                                                    ? t('auth.masquer_mot_de_passe')
                                                    : t('auth.afficher_mot_de_passe')
                                            }
                                            aria-pressed={showPassword}
                                            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-gray-400 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                                        >
                                            <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-800 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {isLoading && (
                                        <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />
                                    )}
                                    {isLoading ? t('auth.connexion_en_cours') : t('auth.se_connecter')}
                                </button>
                            </form>

                            {/* Bascule vers Inscription ("Pas de compte ?") */}
                            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-600">
                                <span>{t('auth.pas_encore_compte') || 'Pas de compte ?'}</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsRegister(true);
                                        setRegisterErrorMsg('');
                                        setRegisterSuccessMsg('');
                                    }}
                                    className="font-semibold text-teal-700 underline-offset-4 hover:text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                                >
                                    {t('auth.creer_compte') || 'Créer un compte'}
                                </button>
                            </div>

                            <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">
                                {t('auth.acces_reserve')}
                            </p>
                        </>
                    ) : (
                        <>
                            {/* ─── Mode Inscription Administrateur ─── */}
                            <div className="mt-6 sm:mt-8">
                                <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                                    {t('auth.titre_inscription') || 'Créer un compte'}
                                </h1>
                                <p className="mt-2 text-sm text-gray-500">
                                    Créez un compte administrateur. Un e-mail de confirmation vous sera envoyé pour l'activer.
                                </p>
                            </div>

                            {registerSuccessMsg ? (
                                <div className="mt-6 rounded-xl border border-teal-200 bg-teal-50/80 p-6 text-center">
                                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-600">
                                        <FontAwesomeIcon icon={faCheckCircle} className="text-2xl" />
                                    </div>
                                    <h2 className="text-lg font-bold text-teal-900">
                                        Compte administrateur créé !
                                    </h2>
                                    <p className="mt-2 text-sm text-teal-800">
                                        Un e-mail de confirmation a été envoyé à l'adresse :
                                    </p>
                                    <p className="mt-1 font-semibold text-teal-950">
                                        {registerData.email}
                                    </p>
                                    <p className="mt-3 text-xs text-teal-700">
                                        Veuillez cliquer sur le lien d'activation reçu pour activer votre compte avant de vous connecter.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormData((prev) => ({ ...prev, email: registerData.email }));
                                            setIsRegister(false);
                                            setRegisterSuccessMsg('');
                                        }}
                                        className="mt-5 inline-flex items-center justify-center rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                                    >
                                        {t('auth.se_connecter') || 'Se connecter'}
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleRegisterSubmit} className="mt-6 space-y-4">
                                    {registerErrorMsg && (
                                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                            {registerErrorMsg}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div>
                                            <label htmlFor="register-nom" className="mb-1 block text-sm font-medium text-gray-700">
                                                {t('auth.nom') || 'Nom'}
                                            </label>
                                            <div className="relative">
                                                <span
                                                    aria-hidden="true"
                                                    className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-gray-400"
                                                >
                                                    <FontAwesomeIcon icon={faUser} />
                                                </span>
                                                <input
                                                    id="register-nom"
                                                    type="text"
                                                    name="nom"
                                                    value={registerData.nom}
                                                    onChange={handleRegisterChange}
                                                    required
                                                    placeholder="Rakoto"
                                                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label htmlFor="register-prenom" className="mb-1 block text-sm font-medium text-gray-700">
                                                {t('auth.prenom') || 'Prénom'}
                                            </label>
                                            <div className="relative">
                                                <span
                                                    aria-hidden="true"
                                                    className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-gray-400"
                                                >
                                                    <FontAwesomeIcon icon={faUser} />
                                                </span>
                                                <input
                                                    id="register-prenom"
                                                    type="text"
                                                    name="prenom"
                                                    value={registerData.prenom}
                                                    onChange={handleRegisterChange}
                                                    required
                                                    placeholder="Jean"
                                                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="register-email" className="mb-1 block text-sm font-medium text-gray-700">
                                            {t('auth.email') || 'Email'}
                                        </label>
                                        <div className="relative">
                                            <span
                                                aria-hidden="true"
                                                className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-gray-400"
                                            >
                                                <FontAwesomeIcon icon={faEnvelope} />
                                            </span>
                                            <input
                                                id="register-email"
                                                type="email"
                                                name="email"
                                                value={registerData.email}
                                                onChange={handleRegisterChange}
                                                required
                                                autoComplete="email"
                                                placeholder="nom@mtefop.mg"
                                                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="mb-1 flex items-center justify-between">
                                            <label htmlFor="register-password" className="block text-sm font-medium text-gray-700">
                                                {t('auth.mot_de_passe') || 'Mot de passe'}
                                            </label>
                                            <span className="text-xs text-gray-400">
                                                {t('auth.mot_de_passe_aide') || '(au moins 8 caractères)'}
                                            </span>
                                        </div>
                                        <div className="relative">
                                            <span
                                                aria-hidden="true"
                                                className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-gray-400"
                                            >
                                                <FontAwesomeIcon icon={faLock} />
                                            </span>
                                            <input
                                                id="register-password"
                                                type={showRegisterPassword ? 'text' : 'password'}
                                                name="password"
                                                value={registerData.password}
                                                onChange={handleRegisterChange}
                                                required
                                                minLength={8}
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-11 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowRegisterPassword((v) => !v)}
                                                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-gray-400 hover:text-gray-700"
                                            >
                                                <FontAwesomeIcon icon={showRegisterPassword ? faEyeSlash : faEye} />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="register-re-password" className="mb-1 block text-sm font-medium text-gray-700">
                                            {t('auth.confirmer_mot_de_passe') || 'Confirmer le mot de passe'}
                                        </label>
                                        <div className="relative">
                                            <span
                                                aria-hidden="true"
                                                className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-gray-400"
                                            >
                                                <FontAwesomeIcon icon={faLock} />
                                            </span>
                                            <input
                                                id="register-re-password"
                                                type={showRegisterConfirmPassword ? 'text' : 'password'}
                                                name="re_password"
                                                value={registerData.re_password}
                                                onChange={handleRegisterChange}
                                                required
                                                minLength={8}
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-11 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowRegisterConfirmPassword((v) => !v)}
                                                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-gray-400 hover:text-gray-700"
                                            >
                                                <FontAwesomeIcon icon={showRegisterConfirmPassword ? faEyeSlash : faEye} />
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={registerLoading}
                                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-800 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                        {registerLoading && (
                                            <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />
                                        )}
                                        {registerLoading ? 'Création en cours…' : (t('auth.creer_mon_compte') || 'Créer mon compte')}
                                    </button>
                                </form>
                            )}

                            {/* Bascule vers Connexion */}
                            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-600">
                                <span>{t('auth.deja_compte') || 'Vous avez déjà un compte ?'}</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsRegister(false);
                                        setRegisterErrorMsg('');
                                    }}
                                    className="font-semibold text-teal-700 underline-offset-4 hover:text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                                >
                                    {t('auth.se_connecter') || 'Se connecter'}
                                </button>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}

export default Login;
