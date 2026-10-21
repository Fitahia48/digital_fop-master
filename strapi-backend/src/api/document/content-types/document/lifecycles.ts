import { notifyDocumentPublication } from '../../../../utils/notify';

/**
 * Alertes de publication d'un document.
 *
 * - afterCreate  : uniquement si la notice est créée DÉJÀ « validée »
 *   (formulaire admin du front) ; un brouillon créé via le panneau Strapi
 *   ne déclenche RIEN ;
 * - afterUpdate  : uniquement lors d'un passage EXPLICITE vers « validée »
 *   (`params.data.etat_notice === 'validee'` — route etat-notice ou panneau) ;
 * - anti-doublon : `notifie_le` (posé dans notify.ts, jamais réinitialisé) —
 *   retour brouillon puis « validée » → AUCUN second envoi ;
 * - scripts : aucun envoi (pas de contexte HTTP, ou en-tête x-no-notify).
 *
 * Un échec d'envoi ne bloque jamais la création ni la mise à jour.
 */
export default {
  async afterCreate(event: any) {
    const { result } = event;
    if (!result || result.etat_notice !== 'validee' || result.notifie_le) return;
    try {
      await notifyDocumentPublication(result);
    } catch (err: any) {
      console.error('Document publication notification error:', err?.message);
    }
  },

  async afterUpdate(event: any) {
    const { result, params } = event;
    if (!result || result.etat_notice !== 'validee' || result.notifie_le) return;
    // Seul un écrit EXPLICITE de l'état « validée » déclenche l'alerte :
    // modifier le titre, les visites ou le statut d'une notice déjà publiée
    // ne re-notifie pas.
    if (params?.data?.etat_notice !== 'validee') return;
    try {
      await notifyDocumentPublication(result);
    } catch (err: any) {
      console.error('Document publication notification error:', err?.message);
    }
  },
};
