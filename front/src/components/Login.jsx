import { useState, useEffect, useContext, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleExclamation,
  faEnvelope,
  faEye,
  faEyeSlash,
  faExternalLinkAlt,
  faLock,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import axiosInstance from "./AxiosConfig";
import {
  hasErrors,
  normalizeIdentiteField,
  validateIdentite,
} from "../utils/validateIdentite";
import { useDispatch, useSelector } from "react-redux";
import { login, reset } from "../features/auth/authSlice";
import { toast } from "react-toastify";
import { userContext } from "./Context";
import LanguageSwitcher from "./LanguageSwitcher";
import logoMadagascar from "../assets/logo-madagascar.webp";
import MTEFOP from "../assets/MTEFOP.png";
import DEAJ from "../assets/DEAJ.png";

/**
 * Page de connexion (/portail-gestion/connexion).
 *
 * Écran autonome : l'en-tête et le menu publics sont masqués sur cette route
 * (cf. App.jsx), le pied de page et l'assistant le sont déjà. La mise en page
 * est donc un panneau de marque + formulaire, centré sur fond sombre.
 *
 * L'inscription publique estouverte : un lien « Créer un compte » permet de soumettre
 * une demande qui sera validée par un super-administrateur. Les comptes sont créés
 * avec le statut « en_attente » et ne peuvent pas se connecter avant confirmation.
 * Le lien « Mot de passe oublié » resteinchangé.
 */
function Login() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [registerData, setRegisterData] = useState({
    prenom: "",
    nom: "",
    email: "",
    password: "",
  });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [registerErrors, setRegisterErrors] = useState({});
  const [loginError, setLoginError] = useState("");
  const passwordInputRef = useRef(null);

  const { setUser, setIsAdmin, setIsSuperAdmin } = useContext(userContext);
  // Une seule redirection + un seul toast par « session » de la page :
  // sans cette garde, l'effet se relance (reset(), changements de contexte)
  // et le toast de bienvenue s'affichait 2 à 3 fois empilés.
  const redirectionFaite = useRef(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, isLoading, isError, isSuccess, message } = useSelector(
    (state) => state.auth,
  );

  const handleChange = (e) => {
    if (loginError) setLoginError("");
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleRegisterChange = (e) => {
    const { name, value } = e.target;
    // Nom en majuscules et prénom capitalisé dès la saisie.
    setRegisterData((prev) => ({
      ...prev,
      [name]: normalizeIdentiteField(name, value),
    }));
    // L'erreur du champ disparaît dès qu'il est corrigé.
    setRegisterErrors((prev) =>
      prev[name] ? { ...prev, [name]: undefined } : prev,
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoginError("");
    dispatch(login({ email: formData.email, password: formData.password }));
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();

    // Nom en majuscules, prénom commençant par une majuscule, e-mail valide.
    const erreurs = validateIdentite(registerData, t);
    if (hasErrors(erreurs)) {
      setRegisterErrors(erreurs);
      return;
    }
    setRegisterErrors({});

    setRegisterLoading(true);
    setRegisterError("");
    try {
      // Demande de compte : le serveur crée le compte au statut
      // « en_attente », sans connexion possible avant confirmation.
      await axiosInstance.post("/api/v1/auth/users/", {
        prenom: registerData.prenom.trim(),
        nom: registerData.nom.trim(),
        email: registerData.email.trim(),
        password: registerData.password,
      });
      setShowRegister(false);
      setRegisterSuccess(true);
      setRegisterData({ prenom: "", nom: "", email: "", password: "" });
    } catch (err) {
      const data = err.response?.data;
      const errorMsg =
        data?.detail ||
        data?.prenom?.[0] ||
        data?.nom?.[0] ||
        data?.email?.[0] ||
        data?.password?.[0] ||
        t("auth.inscription_echec");
      setRegisterError(errorMsg);
    } finally {
      setRegisterLoading(false);
    }
  };

  useEffect(() => {
    if (isError) {
      const status = message?.status;
      const detail = typeof message?.detail === "string" ? message.detail : "";
      const isNetworkError = Boolean(message?.isNetworkError);
      const normalizedDetail = detail.toLowerCase();

      const isInvalidCredentials =
        status === 401 ||
        status === 400 ||
        /invalid identifier or password|identifiants incorrects|mot de passe incorrect|utilisateur inconnu/.test(
          normalizedDetail,
        );
      const isPendingAccount = /en attente de confirmation/.test(
        normalizedDetail,
      );
      const isRejectedAccount =
        /demande de création de compte a été rejetée|demande de creation de compte a ete rejetee/.test(
          normalizedDetail,
        );
      const isBlockedAccount = /compte désactivé|compte desactive/.test(
        normalizedDetail,
      );
      const isInactiveAccount =
        /compte non activé|compte non active|vérifier vos e-mails|verifier vos e-mails/.test(
          normalizedDetail,
        );

      let errDetail = t("auth.login_identifiants_incorrects");
      if (status === 429) {
        errDetail = t("auth.trop_tentatives");
      } else if (
        isNetworkError ||
        (typeof status === "number" && status >= 500)
      ) {
        errDetail = t("auth.connexion_impossible");
      } else if (isPendingAccount) {
        errDetail = t("auth.compte_en_attente_connexion");
      } else if (isRejectedAccount) {
        errDetail = t("auth.compte_rejete_connexion");
      } else if (isBlockedAccount) {
        errDetail = t("auth.compte_bloque");
      } else if (isInactiveAccount) {
        errDetail = t("auth.compte_non_active");
      } else if (isInvalidCredentials) {
        errDetail = t("auth.login_identifiants_incorrects");
      } else {
        errDetail = t("auth.connexion_impossible");
      }

      setLoginError(errDetail);
      setFormData((prev) => ({ ...prev, password: "" }));
      requestAnimationFrame(() => {
        passwordInputRef.current?.focus();
      });
    }

    if ((isSuccess || user) && !redirectionFaite.current) {
      if (JSON.parse(localStorage.getItem("user"))) {
        redirectionFaite.current = true;
        const notifierBienvenue = isSuccess;
        setUser(JSON.parse(localStorage.getItem("user")));
        const redirectAfterLogin = async () => {
          try {
            const res = await axiosInstance.get("/api/v1/auth/users/me/");
            const isAdminUser = Boolean(
              res.data.is_staff || res.data.is_superuser,
            );
            const mustChangePassword = Boolean(
              res.data.doit_changer_mot_de_passe,
            );
            setIsAdmin(isAdminUser);
            setIsSuperAdmin(Boolean(res.data.is_superadmin));
            const optionsBienvenue = {
              style: {
                maxWidth: "28rem",
                textAlign: "center",
                fontWeight: 600,
              },
            };
            if (mustChangePassword) {
              navigate("/portail-gestion/profil");
              if (notifierBienvenue) {
                toast.info(t("profil.mot_de_passe_provisoire_titre"), {
                  ...optionsBienvenue,
                  toastId: "bienvenue-mot-de-passe-provisoire",
                  autoClose: 8000,
                });
              }
            } else if (isAdminUser) {
              navigate("/dashboard");
              if (notifierBienvenue) {
                toast.success(t("auth.bienvenue_dashboard"), {
                  ...optionsBienvenue,
                  toastId: "bienvenue-dashboard",
                });
              }
            } else {
              navigate("/");
              if (notifierBienvenue) {
                toast.success(t("auth.bienvenue_usager"), {
                  ...optionsBienvenue,
                  toastId: "bienvenue-usager",
                });
              }
            }
          } catch {
            navigate("/dashboard");
          }
        };
        redirectAfterLogin();
      }
    }

    dispatch(reset());
  }, [
    dispatch,
    isError,
    isSuccess,
    message,
    navigate,
    setIsAdmin,
    setIsSuperAdmin,
    setUser,
    t,
    user,
  ]);

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
              {t("menu.bibliotheque")}
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-blue-100">
              {t("auth.brand_sous_titre")}
            </p>
          </div>

          <a
            href="https://www.mtefpls.gov.mg"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-blue-100 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            {t("header.visiter_site")}
            <FontAwesomeIcon
              icon={faExternalLinkAlt}
              className="text-xs"
              aria-hidden="true"
            />
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
              {t("auth.se_connecter")}
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {t("auth.connexion_sous_titre")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                {t("auth.email")}
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
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                  placeholder="nom@mtefop.mg"
                  aria-invalid={loginError ? "true" : undefined}
                  aria-describedby={
                    loginError ? "login-password-error" : undefined
                  }
                  className={`w-full rounded-lg border bg-white py-2.5 pl-11 pr-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:outline-none focus:ring-2 ${
                    loginError
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500/30"
                      : "border-gray-300 focus:border-teal-600 focus:ring-teal-600/30"
                  }`}
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t("auth.mot_de_passe")}
                </label>
                <Link
                  to="/resetpassword"
                  className="text-xs font-medium text-teal-700 underline-offset-4 hover:text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                >
                  {t("auth.mot_de_passe_oublie")}
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
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={loginError ? "true" : undefined}
                  aria-describedby={
                    loginError ? "login-password-error" : undefined
                  }
                  className={`w-full rounded-lg border bg-white py-2.5 pl-11 pr-12 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:outline-none focus:ring-2 ${
                    loginError
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500/30"
                      : "border-gray-300 focus:border-teal-600 focus:ring-teal-600/30"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword
                      ? t("auth.masquer_mot_de_passe")
                      : t("auth.afficher_mot_de_passe")
                  }
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-white px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 focus-visible:ring-offset-white shadow-sm"
                >
                  <FontAwesomeIcon
                    icon={showPassword ? faEyeSlash : faEye}
                    className="h-4 w-4"
                  />
                </button>
              </div>
              <div className="mt-1.5 min-h-[1.25rem]">
                {loginError && (
                  <p
                    id="login-password-error"
                    className="flex items-start gap-1.5 text-sm text-red-700"
                    role="alert"
                  >
                    <FontAwesomeIcon
                      icon={faCircleExclamation}
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{loginError}</span>
                  </p>
                )}
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
              {isLoading
                ? t("auth.connexion_en_cours")
                : t("auth.se_connecter")}
            </button>
          </form>

          {/* Lien "Créer un compte" */}
          <p className="mt-2 text-center text-xs leading-relaxed text-gray-400">
            <Link
              to="#"
              onClick={() => {
                setShowRegister(true);
                setRegisterSuccess(false);
                setRegisterError("");
              }}
              className="underline text-teal-600 hover:text-teal-800"
            >
              {t("auth.creer_compte") || "Créer un compte"}
            </Link>
          </p>

          {showRegister ? (
            <div className="mt-4 p-6 rounded-lg bg-blue-50 border border-blue-200">
              <h3 className="mb-4 text-lg font-semibold text-blue-800">
                {t("auth.inscription_title") || "Créer un compte"}
              </h3>
              <p className="mb-4 text-sm text-blue-700">
                {t("auth.inscription_subtitle") ||
                  "Votre demande sera validée par le super administrateur. Vous recevrez un e-mail une fois votre compte confirmé."}
              </p>
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="register-prenom"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      {t("auth.prenom")}
                    </label>
                    <input
                      id="register-prenom"
                      type="text"
                      name="prenom"
                      value={registerData.prenom}
                      onChange={handleRegisterChange}
                      required
                      autoComplete="given-name"
                      aria-invalid={Boolean(registerErrors.prenom)}
                      className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:outline-none focus:ring-2 ${
                        registerErrors.prenom
                          ? "border-red-400 focus:ring-red-400"
                          : "border-gray-300 focus:border-teal-600 focus:ring-teal-600/30"
                      }`}
                    />
                    {registerErrors.prenom && (
                      <p className="mt-1.5 text-xs text-red-600" role="alert">
                        {registerErrors.prenom}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="register-nom"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      {t("auth.nom")}
                    </label>
                    <input
                      id="register-nom"
                      type="text"
                      name="nom"
                      value={registerData.nom}
                      onChange={handleRegisterChange}
                      required
                      autoComplete="family-name"
                      aria-invalid={Boolean(registerErrors.nom)}
                      className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:outline-none focus:ring-2 ${
                        registerErrors.nom
                          ? "border-red-400 focus:ring-red-400"
                          : "border-gray-300 focus:border-teal-600 focus:ring-teal-600/30"
                      }`}
                    />
                    {registerErrors.nom && (
                      <p className="mt-1.5 text-xs text-red-600" role="alert">
                        {registerErrors.nom}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="register-email"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    {t("auth.email")}
                  </label>
                  <input
                    id="register-email"
                    type="email"
                    name="email"
                    value={registerData.email}
                    onChange={handleRegisterChange}
                    required
                    autoComplete="email"
                    placeholder="nom@mtefop.mg"
                    aria-invalid={Boolean(registerErrors.email)}
                    className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:outline-none focus:ring-2 ${
                      registerErrors.email
                        ? "border-red-400 focus:ring-red-400"
                        : "border-gray-300 focus:border-teal-600 focus:ring-teal-600/30"
                    }`}
                  />
                  {registerErrors.email && (
                    <p className="mt-1.5 text-xs text-red-600" role="alert">
                      {registerErrors.email}
                    </p>
                  )}
                </div>
                <div className="relative">
                  <label
                    htmlFor="register-password"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    {t("auth.mot_de_passe")}
                  </label>
                  <input
                    id="register-password"
                    type={showRegisterPassword ? "text" : "password"}
                    name="password"
                    value={registerData.password}
                    onChange={handleRegisterChange}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder={showRegisterPassword ? "••••••••" : "••••••••"}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegisterPassword((v) => !v)}
                    aria-label={
                      showRegisterPassword
                        ? t("auth.masquer_mot_de_passe")
                        : t("auth.afficher_mot_de_passe")
                    }
                    aria-pressed={showRegisterPassword}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-white px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 focus-visible:ring-offset-white shadow-sm"
                  >
                    <FontAwesomeIcon
                      icon={showRegisterPassword ? faEyeSlash : faEye}
                      className="h-4 w-4"
                    />
                  </button>
                  <p className="mt-1.5 text-xs text-gray-500">
                    {t("auth.mdp_min_6")}
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={registerLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-800 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {registerLoading && (
                    <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />
                  )}
                  {registerLoading
                    ? t("auth.inscription_en_cours")
                    : t("auth.inscription")}
                </button>
              </form>
              {registerError && (
                <p className="mt-3 text-sm text-red-600">{registerError}</p>
              )}
            </div>
          ) : null}

          {registerSuccess ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm text-green-700">
                {t("auth.inscription_success")}
              </p>
            </div>
          ) : null}

          {/* L'inscription publique estouverte : comptes créés par super-admin */}
          <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">
            {t("auth.acces_reserve") ||
              "Accès réservé aux utilisateurs autorisés."}
          </p>
          <p className="mt-2 text-center text-xs leading-relaxed text-gray-400">
            {t("auth.compte_sur_invitation") ||
              "Les comptes sont créés par un administrateur autorisé."}
          </p>
        </section>
      </div>
    </div>
  );
}

export default Login;
