import axiosInstance from '../../components/AxiosConfig'

// Login user — POST /api/v1/auth/jwt/create/ (auth-compat → Users & Permissions)
// Réponse : { access, refresh, redirect_url } (forme legacy conservée côté Strapi).
const login = async (userData) => {
    const response = await axiosInstance.post("/api/v1/auth/jwt/create/", userData);

    if (response.data) {
      localStorage.setItem("user", JSON.stringify(response.data));
    }
    return response.data;
};

// Inscription publique — crée un compte admin en_attente
// POST /api/v1/auth/users/ crée un compte rôle admin, statut en_attente
// Le compte ne peut pas se connecter avant confirmation par super-admin
// Le serveur ignore le champ role (toujours "admin")
// Réponse : { user, confirmation_message }
const register = async (userData) => {
    const response = await axiosInstance.post("/api/v1/auth/users/", userData);
    return response.data;
};

//Logout — retire le storage local et révoque la session Strapi (best effort)
const logout = ()=> {
    // Le refresh token doit être lu AVANT de purger le storage : l'appel est
    // envoyé avec (sans quoi la session reste active côté Strapi). Le cookie
    // httpOnly fait aussi office de repli.
    let refreshToken;
    try {
        refreshToken = JSON.parse(localStorage.getItem("user") || "null")?.refresh;
    } catch {
        refreshToken = undefined;
    }
    // Best effort : le storage local est de toute façon vidé, ce qui déconnecte
    // l'usager côté front quoi qu'il arrive.
    axiosInstance.post("/api/v1/auth/logout/", { refreshToken }).catch(() => {});
    return localStorage.removeItem("user")
}

//reset Password
const resetPassword = async (userData) => {
    const config = {
        headers: {
            "Content-type": "application/json"
        }
    }
    const response = await axiosInstance.post('/api/v1/auth/users/reset_password/', userData, config)
    return response.data
}

//reset Password Confirm
const resetPasswordConfirm = async (userData) => {
    const config = {
        headers: {
            "Content-type": "application/json"
        }
    }
    const response = await axiosInstance.post('/api/v1/auth/users/reset_password_confirm/', userData, config)
    return response.data
}

const authService = { login, logout, register, resetPassword, resetPasswordConfirm }
export default authService
