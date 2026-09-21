export const getCsrfToken = () => {
    const cookies = document.cookie.split("; ");
    const csrfCookie = cookies.find(cookie => cookie.startsWith("csrftoken="));
    return csrfCookie ? csrfCookie.split("=")[1] : null;
};

/**
 * Construit l'URL complète d'un fichier média stocké en base.
 * Gère les deux formats présents en DB :
 *  - nouveau format relatif  : "documents/xxx.pdf"
 *  - format legacy Django    : "/media/documents/xxx.pdf" ou "media/documents/xxx.pdf"
 *  - URL absolue déjà formée : "http://..." / "https://..." (retournée telle quelle)
 */
export const resolveFileUrl = (path, backendBase) => {
    if (!path) return null;
    let p = String(path).trim().replace(/\\/g, "/");
    if (/^https?:\/\//i.test(p)) return p;
    p = p.replace(/^\/+/, "");
    const mediaIndex = p.toLowerCase().indexOf("media/");
    if (mediaIndex !== -1) {
        p = p.slice(mediaIndex);
    } else if (p.toLowerCase().startsWith("documents/") || p.toLowerCase().startsWith("corps/")) {
        p = "media/" + p;
    }
    const base = (backendBase || "http://localhost:8000").replace(/\/+$/, "");
    return `${base}/${p}`;
};

