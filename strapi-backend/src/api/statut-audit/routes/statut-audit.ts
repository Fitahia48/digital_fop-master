/**
 * Routes statut-audit : AUCUNE route exposée.
 *
 * Le journal est écrit et lu uniquement par le contrôleur `document.updateStatus`
 * (code serveur). Pas de route core, pas de route custom : le content-type
 * n'existe que pour porter la table SQL.
 */
export default {
  routes: [],
};
