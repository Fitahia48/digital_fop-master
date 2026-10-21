import { useEffect, useRef } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { toast } from "react-toastify";

const ONBOARDING_KEY = "onboarding_completed";
const RESTART_KEY = "onboarding_restart_requested";
const RESTART_EVENT = "onboarding:restart";

const markCompleted = () => {
  try {
    localStorage.setItem(ONBOARDING_KEY, "true");
  } catch {
    // localStorage indisponible (navigation privée) : le guide se relançera à chaque visite
  }
};

export const hasCompletedOnboarding = () => {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    return false;
  }
};

/** La demande de relance est-elle en attente ? (lecture sans consommation) */
const isRestartRequested = () => {
  try {
    return sessionStorage.getItem(RESTART_KEY) === "true";
  } catch {
    return false;
  }
};

/** Efface la demande de relance (une fois le tour réellement démarré). */
const clearRestartRequest = () => {
  try {
    sessionStorage.removeItem(RESTART_KEY);
  } catch {
    // sessionStorage indisponible : rien à effacer
  }
};

/**
 * Consomme (une seule fois) la demande de relance issue de « Revoir le guide ».
 * Réservé au clic traité sans remontage (on est déjà sur l'accueil).
 */
const consumeRestartRequest = () => {
  const requested = isRestartRequested();
  if (requested) clearRestartRequest();
  return requested;
};

/**
 * Demandé par Footer.jsx / Menu.jsx / HelpPage.jsx : mémorise la demande puis
 * ramène sur l’accueil où le tour redémarre (montage ou événement).
 */
export const requestOnboardingRestart = (navigate) => {
  try {
    sessionStorage.setItem(RESTART_KEY, "true");
  } catch {
    // sessionStorage indisponible : l’événement suffit si on est déjà sur l’accueil
  }
  navigate("/");
  window.dispatchEvent(new Event(RESTART_EVENT));
};

/**
 * Visite guidée d’accueil (driver.js) — 4 étapes courtes (~30 s) :
 * barre de recherche, filtres, actualités, notation de l’app.
 * Les 4 éléments cibles sont présents sur la page d’accueil (la barre de
 * recherche est rendue par <Documents />), aucune navigation n’est requise.
 * Lancement automatique à la première visite uniquement (flag localStorage),
 * puis sur demande explicite via « Revoir le guide ».
 */
const OnboardingTour = () => {
  const timerRef = useRef(null);

  useEffect(() => {
    const driverObj = driver({
      showProgress: true,
      progressText: "{{current}} sur {{total}}",
      nextBtnText: "Suivant",
      prevBtnText: "Précédent",
      doneBtnText: "Terminer",
      allowClose: true,
      smoothScroll: true,
      // Ignore silencieusement une étape dont l’élément serait absent
      skipMissingElement: true,
      onDestroyed: () => {
        markCompleted();
        toast.info("Guide terminé. Retrouvez-le à tout moment via « Revoir le guide » (menu ou pied de page).");
      },
      steps: [
        {
          element: "#global-search-input",
          popover: {
            title: "Rechercher un document",
            description:
              "Tapez un mot-clé, un numéro ou choisissez un critère (type, date, Journal Officiel). Astuce : le raccourci « / » ou Ctrl+K place le curseur directement dans la recherche.",
          },
        },
        {
          element: ".search-filters",
          popover: {
            title: "Filtres de recherche",
            description:
              "Combinez type de document, domaine et statut juridique (en vigueur, abrogé, modifié) pour affiner vos résultats.",
          },
        },
        {
          element: "#onboarding-news",
          popover: {
            title: "Suivre les actualités",
            description:
              "Les dernières informations du ministère s’affichent ici. Abonnez-vous plus bas pour recevoir les alertes de publication par email.",
          },
        },
        {
          element: ".apprating",
          popover: {
            title: "Noter l’application",
            description:
              "Votre avis compte : attribuez une note en quelques secondes pour nous aider à améliorer la bibliothèque numérique.",
          },
        },
      ],
    });

    const startTour = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Laisse le slider d’accueil se poser avant d’afficher l’overlay
      timerRef.current = setTimeout(() => {
        // La demande n'est consommée qu'ici, quand le tour démarre vraiment :
        // en développement, React.StrictMode monte l'effet deux fois (montage →
        // nettoyage qui annule le minuteur → remontage). Consommer la demande
        // au montage la perdait donc au premier passage et le guide ne se
        // relançait jamais ; elle survit maintenant au premier nettoyage.
        clearRestartRequest();
        if (!driverObj.isActive()) driverObj.drive(0);
      }, 600);
    };

    // Première visite OU demande explicite de relance (lue sans la consommer)
    if (!hasCompletedOnboarding() || isRestartRequested()) {
      startTour();
    }

    // « Revoir le guide » cliqué alors qu’on est déjà sur l’accueil
    const handleRestart = () => {
      if (consumeRestartRequest()) startTour();
    };
    window.addEventListener(RESTART_EVENT, handleRestart);

    return () => {
      window.removeEventListener(RESTART_EVENT, handleRestart);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (driverObj.isActive()) driverObj.destroy();
    };
  }, []);

  return null;
};

export default OnboardingTour;
