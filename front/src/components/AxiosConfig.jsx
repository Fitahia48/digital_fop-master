import axios from "axios";
import { getCsrfToken } from "./Utils";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const axiosInstance = axios.create({
  baseURL,
  withCredentials: true, // Permet d'envoyer les cookies
});

// Ajouter un intercepteur pour inclure le token CSRF et le token JWT si disponible
axiosInstance.interceptors.request.use((config) => {
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    config.headers["X-CSRFToken"] = csrfToken;
  }

  if (!config.headers["Authorization"]) {
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        const token = user?.access || user?.access_token;
        if (token) {
          config.headers["Authorization"] = `Bearer ${token}`;
        }
      }
    } catch (e) {
      // Ignorer l'erreur de parse
    }
  }

  return config;
});

export default axiosInstance;
