import axios from "axios";
import { getCsrfToken } from "./Utils";

// Le front est branché sur le backend Strapi (:1337), surchargeable via VITE_API_URL.
const baseURL = import.meta.env.VITE_API_URL || "http://localhost:1337";

const axiosInstance = axios.create({
  baseURL,
  withCredentials: true, // Envoie le cookie httpOnly de refresh (U&P) + credentials CORS
});

// ─── Rafraîchissement automatique du token d'accès ─────────────────────────
// Strapi 5 (jwtManagement: refresh) : l'access token vit ~7 jours par défaut,
// le refresh token vit dans un cookie httpOnly (strapi_up_refresh). Le front
// garde son storage historique (« user » → { access, refresh }) : le refresh
// part en body (refreshToken) OU repose sur le cookie, selon ce qui existe.
const REFRESH_URL = "/api/v1/auth/jwt/refresh/";
const REFRESH_MARGIN_MS = 4 * 60 * 1000; // renouvelle 4 min avant l'expiration

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

const decodeExp = (token) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

/**
 * Persiste les tokens en une seule écriture.
 * ⚠️ Ne jamais écrire deux fois à partir du même instantané : le refresh token
 * est pivoté par Strapi, donc réécrire `{...user, refresh}` avec un `user`
 * capturé avant la réponse effacerait le nouvel access token juste stocké et
 * laisserait un token expiré en base (boucle de refresh → déconnexion).
 */
const storeTokens = ({ access, refresh }) => {
  const user = readStoredUser();
  if (!user) return;
  const next = { ...user };
  if (access) next.access = access;
  if (refresh) next.refresh = refresh;
  localStorage.setItem("user", JSON.stringify(next));
};

/**
 * Ouvre la session locale. Indispensable : Strapi répond 401 dès qu'un Bearer
 * invalide est présent, y compris sur les routes publiques — sans cette purge,
 * un `user` périmé dans le localStorage casse la totalité du site (domaines,
 * documents, actualités, notes…) au lieu de déconnecter proprement l'usager.
 */
const clearStoredSession = () => {
  localStorage.removeItem("user");
  window.dispatchEvent(new Event("auth:session-expired"));
};

// File d'attente : les requêtes simultanées qui tombent sur un token expiré
// partagent un seul appel de refresh au lieu d'en déclencher plusieurs.
let refreshPromise = null;

const refreshAccessToken = async () => {
  const user = readStoredUser();
  const refreshToken = user?.refresh || user?.refresh_token;

  // Aucun refresh token : inutile d'aller expenses un 401 réseau sur chaque
  // requête d'un visiteur anonyme.
  if (!refreshToken) return null;

  // Un seul refresh à la fois
  if (!refreshPromise) {
    refreshPromise = axios
      .post(
        `${baseURL}${REFRESH_URL}`,
        // Le contrôleur legacy-compat lit « refresh » ; U&P natif lit
        // « refreshToken » : on envoie les deux.
        { refreshToken, refresh: refreshToken },
        { withCredentials: true }
      )
      .then((res) => {
        const access = res.data?.access || res.data?.jwt;
        // Rotation du refresh : Strapi renvoie un nouveau refresh token.
        // Les deux écritures sont fusionnées (cf. storeTokens).
        const refresh = res.data?.refreshToken || res.data?.refresh;
        storeTokens({ access, refresh });
        return access;
      })
      .catch((err) => {
        // Refresh refusé/expiré : on purge la session locale, sinon le Bearer
        // mort continuerait d'être envoyé et toute l'API répondrait 401.
        if (err.response?.status === 401) {
          clearStoredSession();
          return null;
        }
        console.error("Refresh du token échoué :", err.response?.data || err.message);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// ─── Intercepteurs ──────────────────────────────────────────────────────────

// Requête : inclut le Bearer JWT (Strapi ignore le CSRF, on le garde sans effet).
// Si le token d'accès est absent ou expiré, un refresh est tenté d'abord
// (await) pour éviter un aller-retour 401 inutile. Si le refresh échoue, on
// n'attache AUCUN Bearer : la requête repart en anonyme et les endpoints
// publics répondent 200 au lieu de 401.
axiosInstance.interceptors.request.use(async (config) => {
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    config.headers["X-CSRFToken"] = csrfToken;
  }

  if (!config.headers["Authorization"]) {
    const user = readStoredUser();
    let token = user?.access || user?.access_token;

    if (token) {
      const exp = decodeExp(token);
      const isExpired = exp !== null && exp <= Date.now();
      const isExpiringSoon = exp !== null && exp - Date.now() < REFRESH_MARGIN_MS;

      if (isExpiringSoon) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          token = newToken;
        } else if (isExpired) {
          // Refresh impossible et token périmé : on dégrade en anonyme plutôt
          // que de faire échouer une route qui est pourtant publique.
          token = null;
        }
      }
      if (token) {
        config.headers["Authorization"] = `Bearer ${token}`;
      }
    }
  }

  return config;
});

// Réponse : sur 401, tente un refresh puis rejoue la requête. Si aucun token
// n'est disponible, la requête est rejouée une fois SANS Bearer (une route
// publique ne doit pas rester en 401 à cause d'une session périmée).
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isRefreshCall = original?.url?.includes(REFRESH_URL);

    if (status === 401 && original && !original._retried && !isRefreshCall) {
      original._retried = true;

      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers["Authorization"] = `Bearer ${newToken}`;
        return axiosInstance(original);
      }

      // Pas de token récupérable : dernière chance en anonyme.
      delete original.headers["Authorization"];
      return axiosInstance(original);
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
