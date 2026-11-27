import { notifyDocumentPublication } from '../../../../utils/notify';

/**
 * Alertes de publication d'un document.
 *
 * - afterCreate  : toute notice créée est publiée immédiatement (plus d'état
 *   éditorial ni de brouillon) → l'alerte part à la création ;
 * - anti-doublon : `notifie_le` (posé dans notify.ts) ; il n'est libéré qu'en
 *   cas d'échec TOTAL de l'envoi (aucun abonné servi), pour permettre une
 *   reprise sans doublon ;
 * - scripts : aucun envoi (pas de contexte HTTP, ou en-tête x-no-notify).
 *
 * Un échec d'envoi ne bloque jamais la création.
 */
export default {
  async afterCreate(event: any) {
    const { result } = event;
    if (!result || result.notifie_le) return;
    try {
      await notifyDocumentPublication(result);
    } catch (err: any) {
      console.error('Document publication notification error:', err?.message);
    }
  },
};
