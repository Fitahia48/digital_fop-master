/**
 * Middleware Document Service (P1) sur api::demarche.demarche.
 *
 * Toute écriture (controller custom OU panneau d'administration Strapi) passe
 * par strapi.documents() → ce middleware garantit :
 *   1. la création d'une entrée timeline append-only à la création ;
 *   2. une entrée timeline à chaque changement de statut / affectation /
 *      direction (avant → après) ;
 *   3. l'email de notification au propriétaire (fire-and-forget).
 *
 * L'acteur est déduit via strapi.requestContext (util utils/request-actor),
 * jamais du corps de la requête.
 */
import { getCurrentActor } from '../utils/request-actor';
import { sendDemarcheStatusEmail } from '../utils/mailer';
import { resolveLang } from '../utils/email-templates';

const UID = 'api::demarche.demarche';
const TIMELINE_UID = 'api::demarche-timeline.demarche-timeline';

export const registerDemarcheLifecycle = (strapi: any): void => {
  strapi.documents.use(async (context: any, next: () => Promise<any>) => {
    if (context.uid !== UID) return next();
    if (!['create', 'update'].includes(context.action)) return next();

    const isCreate = context.action === 'create';
    const actor = getCurrentActor();

    // Avant : état courant (update) pour la comparaison avant/après
    let before: any = null;
    if (!isCreate && context.params?.documentId) {
      try {
        before = await strapi.documents(UID).findOne({
          documentId: context.params.documentId,
          populate: ['user', 'direction', 'agent_affecte'],
        });
      } catch {
        before = null;
      }
    }

    const result = await next();

    try {
      if (isCreate && result) {
        // ─── Création : entrée initiale « soumise » ────────────────────────
        await strapi.documents(TIMELINE_UID).create({
          data: {
            demarche: result.documentId,
            statut: result.statut ?? 'soumise',
            commentaire: 'Demande enregistrée.',
            modifie_par: actor?.id ?? null,
          },
        });

        // Email accusé de création (fire-and-forget)
        const ownerEmail = result?.user?.email;
        if (ownerEmail) {
          sendDemarcheStatusEmail(
            ownerEmail,
            result?.type_demarche ?? 'demarche',
            result?.statut ?? 'soumise',
            'Votre demande a été enregistrée.',
            resolveLang(result?.user?.langue_preferee)
          ).catch(() => {});
        }
      } else if (before && result) {
        // ─── Mise à jour : timeline si statut / direction / agent changés ──
        const changes: string[] = [];

        if (before.statut !== result.statut) {
          changes.push(`Statut : ${before.statut} → ${result.statut}`);
        }
        const dirChanged =
          (before.direction?.documentId ?? null) !== (result.direction?.documentId ?? null);
        if (dirChanged) {
          changes.push(
            `Direction : ${before.direction?.nom ?? '(aucune)'} → ${result.direction?.nom ?? '(aucune)'}`
          );
        }
        const agentChanged =
          (before.agent_affecte?.id ?? null) !== (result.agent_affecte?.id ?? null);
        if (agentChanged) {
          changes.push(
            `Agent : ${before.agent_affecte?.username ?? '(personne)'} → ${result.agent_affecte?.username ?? '(personne)'}`
          );
        }

        if (changes.length > 0) {
          await strapi.documents(TIMELINE_UID).create({
            data: {
              demarche: result.documentId,
              statut: result.statut,
              commentaire: changes.join(' · '),
              modifie_par: actor?.id ?? null,
            },
          });

          // Email au propriétaire si le statut a changé (fire-and-forget)
          const ownerEmail = result?.user?.email;
          if (ownerEmail && before.statut !== result.statut) {
            sendDemarcheStatusEmail(
              ownerEmail,
              result?.type_demarche ?? 'demarche',
              result.statut,
              changes.join(' · '),
              resolveLang(result?.user?.langue_preferee)
            ).catch(() => {});
          }
        }
      }
    } catch (err) {
      // L'échec de journalisation ne doit JAMAIS faire échouer l'écriture métier
      strapi.log.error('[demarche-lifecycle] timeline/email error:', (err as Error).message);
    }

    return result;
  });
};

export default { registerDemarcheLifecycle };
