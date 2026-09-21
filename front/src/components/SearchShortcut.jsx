import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const SEARCH_INPUT_ID = "global-search-input";
const SEARCH_ROUTE = "/AfficherDoc";

const isTypingInField = (element) => {
    if (!element) return false;
    const tag = element.tagName?.toLowerCase();
    return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        element.isContentEditable === true
    );
};

/**
 * Raccourci clavier global pour la recherche : « / » ou Ctrl+K (⌘+K).
 * - si la barre de recherche est déjà affichée → focus direct
 * - sinon → redirection vers la page de recherche, qui prend le focus au montage
 */
const SearchShortcut = () => {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const handleKeyDown = (event) => {
            const key = (event.key || "").toLowerCase();
            const isCtrlK = (event.ctrlKey || event.metaKey) && key === "k";
            const isSlash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey;

            if (!isCtrlK && !isSlash) return;
            // « / » est un caractère normal dans un champ de saisie
            if (isSlash && isTypingInField(event.target)) return;

            event.preventDefault();

            const input = document.getElementById(SEARCH_INPUT_ID);
            if (input) {
                input.focus();
                input.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
            }

            if (location.pathname !== SEARCH_ROUTE) {
                navigate(SEARCH_ROUTE, { state: { focusSearch: true } });
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [location.pathname, navigate]);

    return null;
};

export default SearchShortcut;
