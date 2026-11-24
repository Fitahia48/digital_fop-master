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
 * Les identifiants des champs (`name="email"` / `name="password"`) et le
 * bouton `type="submit"` sont conservés : les parcours de connexion existants
 * (tests Playwright, redirection admin/usager) ne changent pas.
 */
function Login() {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });
    const [showPassword, setShowPassword] = useState(false);
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

    const handleSubmit = (e) => {
        e.preventDefault();
        const userData = {
            email,
            password,
        };
        dispatch(login(userData));
    };

    useEffect(() => {
        if (isError) {
            // toastId : même en cas de double déclenchement, un seul affichage.
            toast.error(t('auth.identifiants_invalides'), { toastId: 'login-erreur' });
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

                    <p className="mt-8 text-center text-xs leading-relaxed text-gray-400">
                        {t('auth.acces_reserve')}
                    </p>
                </section>
            </div>
        </div>
    );
}

export default Login;
