/**
 * Contrôleur « visites » — point d'entrée unique du comptage de visite de
 * l'application.
 *
 * POST /api/visites/ping (public, sans corps)
 *  - appelé une seule fois au montage de l'application (front/App.jsx) ;
 *  - « 1 visiteur (empreinte) = 1 par jour », jour à Madagascar ;
 *  - réponse minimale `{ counted: boolean }` : JAMAIS d'erreur bloquante
 *    pour l'usager (les erreurs de comptage sont loguées côté serveur) ;
 *  - limitation de débit en mémoire (aucune librairie externe) : au plus
 *    `LIMITE_PING_PAR_MINUTE` appels par empreinte et par minute — un abus
 *    ne surcompte pas (l'unicité est garantie par la base) mais évite de
 *    noyer la base d'écritures inutiles.
 */
import { comptageActif, estCheminSante, estRobot, visiteurHash } from '../../../utils/visitor-id';
import { enregistrerVisiteApplication } from '../../../utils/comptage';

/** Fenêtre glissante : appels de ping acceptés par empreinte et par minute. */
const LIMITE_PING_PAR_MINUTE = 20;
const FENETRE_MS = 60_000;

/** empreinte → horodatages (ms) des appels récents (mémoire éphémère). */
const appelsRecents = new Map<string, number[]>();

/** Taille max du cache : au-delà, purge complète (scénario d'abus). */
const TAILLE_MAX = 5000;

const depasseLimite = (cle: string): boolean => {
  const maintenant = Date.now();
  const fenetre = (appelsRecents.get(cle) || []).filter((t) => maintenant - t < FENETRE_MS);
  const depasse = fenetre.length >= LIMITE_PING_PAR_MINUTE;
  if (!depasse) fenetre.push(maintenant);
  appelsRecents.set(cle, fenetre);
  if (appelsRecents.size > TAILLE_MAX) appelsRecents.clear();
  return depasse;
};

export const ping = async (ctx: any) => {
  try {
    // Robots / contrôles de santé / comptage désactivé → 200 neutre, non compté.
    if (estCheminSante(ctx?.request?.path) || estRobot(ctx) || !comptageActif()) {
      ctx.body = { counted: false };
      return;
    }

    const cle = visiteurHash(ctx) ?? 'anonyme';
    if (depasseLimite(cle)) {
      ctx.body = { counted: false };
      return;
    }

    const counted = await enregistrerVisiteApplication(ctx);
    ctx.body = { counted };
  } catch (err) {
    // Jamais d'erreur bloquante pour l'usager.
    strapi.log.error(`[visites] ping non traité : ${(err as Error).message}`);
    ctx.body = { counted: false };
  }
};

export default { ping };
