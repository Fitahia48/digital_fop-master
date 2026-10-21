import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Remet la page en haut à chaque changement de route.
 *
 * Pourquoi : React Router ne touche pas au défilement. En cliquant un lien du
 * pied de page (« Aide / FAQ », « À propos », « Revoir le guide ») alors qu'on
 * est déjà tout en bas, on arrivait sur la nouvelle page *à la même hauteur* :
 * l'utilisateur voyait le bas de la page (et de nouveau le pied de page) au
 * lieu du contenu demandé — d'où l'impression que le clic ne faisait rien.
 *
 * Un `#ancre` reste honoré : on fait défiler jusqu'à la cible si elle existe.
 * Le clic sur un lien vers la page *courante* est traité par le lien lui-même
 * (`scrollToTop`) : on ne dépend donc pas de `location.key`, ce qui préserve la
 * position restaurée par le bouton « Précédent » du navigateur.
 */
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const cible = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (cible) {
        cible.scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
