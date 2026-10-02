export const getCsrfToken = () => {
    const cookies = document.cookie.split("; ");
    const csrfCookie = cookies.find(cookie => cookie.startsWith("csrftoken="));
    return csrfCookie ? csrfCookie.split("=")[1] : null;
};

/**
 * Construit l'URL complète d'un fichier média.
 * Étape 7 : les médias sont servis par Strapi (URL /uploads/... renvoyées par
 * les réponses legacy-compat). Les anciens chemins legacy (documents/xxx.pdf)
 * sont résolus vers la base Strapi ; les URL absolues sont retournées telles quelles.
 */
export const resolveFileUrl = (path, backendBase) => {
    if (!path) return null;
    let p = String(path).trim().replace(/\\/g, "/");
    if (/^https?:\/\//i.test(p)) return p;
    // URL relative Strapi ("/uploads/...") → préfixer par la base Strapi
    if (/^\/?uploads\//i.test(p)) {
        const strapiBase = (backendBase || import.meta.env.VITE_API_URL || "http://localhost:1337").replace(/\/+$/, "");
        return `${strapiBase}/${p.replace(/^\/+/, "")}`;
    }
    p = p.replace(/^\/+/, "");
    const mediaIndex = p.toLowerCase().indexOf("media/");
    if (mediaIndex !== -1) {
        p = p.slice(mediaIndex);
    } else if (p.toLowerCase().startsWith("documents/") || p.toLowerCase().startsWith("corps/")) {
        p = "media/" + p;
    }
    const base = (backendBase || import.meta.env.VITE_API_URL || "http://localhost:1337").replace(/\/+$/, "");
    return `${base}/${p}`;
};

/**
 * Libellés français des statuts juridiques. Indexés par la clé normalisée
 * (minuscules, sans diacritiques) : couvre à la fois les valeurs canoniques
 * de l'enum Strapi (en_vigueur/abroge/modifie) et les anciennes valeurs
 * accentuées ou capitalisées encore présentes en base.
 */
export const STATUS_LABELS = {
    non_verifie: "Non vérifié",
    en_vigueur: "En vigueur",
    abroge: "Abrogé",
    modifie: "Modifié",
};

/** Ramène un statut brut à sa clé canonique (minuscules, sans diacritiques). */
export const normalizeStatus = (status) =>
    String(status ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_");

/** Libellé affichable d'un statut (repli : valeur brute ou tiret). */
export const statusLabel = (status) => STATUS_LABELS[normalizeStatus(status)] || status || "—";

