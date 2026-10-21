import { notifyActualitePublication } from '../../../../utils/notify';

/**
 * Alertes de publication d'une actualité.
 *
 * Les actualités n'ont pas de brouillon (draftAndPublish désactivé) :
 * la création EST la publication → envoi à la création uniquement,
 * une seule fois grâce à l'anti-doublon `notifie_le`.
 * Les éditions ne déclenchent rien (pas d'afterUpdate).
 * Scripts : aucun envoi (pas de contexte HTTP, ou en-tête x-no-notify).
 */
export default {
  async afterCreate(event: any) {
    const { result } = event;
    if (!result || !result.titre || result.notifie_le) return;
    try {
      await notifyActualitePublication(result);
    } catch (err: any) {
      console.error('Actualite publication notification error:', err?.message);
    }
  },
};
