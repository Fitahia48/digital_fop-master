/**
 * Remonte la fenêtre en haut, sans animation.
 *
 * Partagé par <ScrollToTop /> (changement de route) et par les liens du pied de
 * page quand on clique vers la page où l'on se trouve déjà : sans cela, le
 * clic ne produit aucun effet visible et l'utilisateur croit qu'il est cassé.
 */
export const scrollToTop = () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
};

export default scrollToTop;
