/**
 * Comptage « 1 visiteur = 1 par jour » (fuseau Indian/Antananarivo).
 *
 * Toutes les écritures de comptage passent par ce module — une seule
 * implémentation partagée par :
 *  - POST /api/visites/ping            (visite de l'application)
 *  - POST /api/documents/:id/visit     (consultation d'un texte)
 *  - POST /api/corps/:id/visit         (consultation d'un corps professionnel)
 *
 * Garanties :
 *  - l'unicité est portée par la BASE (clé unique + `ON CONFLICT DO NOTHING`),
 *    jamais par un SELECT préalable : deux requêtes simultanées pour le même
 *    visiteur/cible/jour n'insèrent qu'UNE ligne → un seul incrément ;
 *  - le nombre de lignes réellement insérées est lu sur le résultat SQL
 *    (`changes` sous sqlite, `rowCount` sous postgres) ;
 *  - les compteurs cibles sont incrémentés en UNE opération SQL atomique
 *    (`SET visits = visits + 1`), pas « lire puis écrire » ;
 *  - aucune IP en clair n'est écrite, journalisée ou renvoyée : uniquement
 *    l'empreinte HMAC tronquée (utils/visitor-id.ts).
 *
 * Les anciens cumuls (`documents.visits`, `corps.visits`, `daily_stats`) sont
 * PRÉSERVÉS : les nouveaux comptages s'ajoutent à l'existant (décision
 * validée — les anciens totaux contiennent des doublons, voir IMPLEMENTATION.md).
 */
import {
  comptageActif,
  estCheminSante,
  estRobot,
  jourCourant,
  visiteurHash,
} from './visitor-id';
import { dateJourMadagascar } from './dates';

/** Type de cible comptée (liste courte, contrainte CHECK absente volontairement). */
export type TypeCible = 'document' | 'corps';

/**
 * Nombre de lignes réellement insérées par un `INSERT … ON CONFLICT DO NOTHING`.
 *
 *  - sqlite (better-sqlite3 via knex) : `{ changes, lastInsertRowid }`
 *  - postgres (knex)                   : `{ rows, rowCount }`
 *  - valeur inconnue                   : 0 (comptage non affirmé → on préfère
 *    ne PAS compter à tort plutôt que de surcompter ; vérifié en Étape 8).
 */
export const lignesInserees = (raw: any): number => {
  if (raw == null) return 0;
  if (typeof raw === 'number') return raw;
  if (typeof raw.changes === 'number') return raw.changes;
  if (typeof raw.rowCount === 'number') return raw.rowCount;
  if (Array.isArray(raw)) {
    const premier = raw[0];
    if (premier && typeof premier === 'object') return lignesInserees(premier);
    return 0;
  }
  if (typeof raw.rows === 'object' && raw.rows !== null) return 0;
  return 0;
};

/** Garde commune : la requête doit-elle être comptée du tout ? */
const comptable = (ctx: any): boolean => {
  if (!comptageActif()) return false;
  if (estCheminSante(ctx?.request?.path)) return false;
  if (estRobot(ctx)) return false;
  return true;
};

// ─── Totaux journaliers (conservés après purge des empreintes) ───────────────

const ajouteVisiteurDuJour = async (jour: string) =>
  strapi.db.connection.raw(
    `
    INSERT INTO totaux_jour (jour, visiteurs, consultations)
    VALUES (?, 1, 0)
    ON CONFLICT (jour) DO UPDATE SET visiteurs = totaux_jour.visiteurs + 1;
    `,
    [jour]
  );

const ajouteConsultationDuJour = async (jour: string) =>
  strapi.db.connection.raw(
    `
    INSERT INTO totaux_jour (jour, visiteurs, consultations)
    VALUES (?, 0, 1)
    ON CONFLICT (jour) DO UPDATE SET consultations = totaux_jour.consultations + 1;
    `,
    [jour]
  );

// ─── Visite de l'application ─────────────────────────────────────────────────

/**
 * Enregistre « ce visiteur a visité l'application aujourd'hui ».
 *
 * @returns true si c'est un NOUVEL enregistrement (visiteur déjà compté ce
 *          jour → false). Ne lève jamais : une erreur de comptage ne doit pas
 *          casser la navigation.
 */
export const enregistrerVisiteApplication = async (ctx: any): Promise<boolean> => {
  try {
    if (!comptable(ctx)) return false;
    const jour = jourCourant();
    const hash = visiteurHash(ctx, jour);
    if (!hash) return false;

    const insertion = await strapi.db.connection.raw(
      'INSERT INTO visites_visiteurs (jour, visiteur_hash) VALUES (?, ?) ON CONFLICT DO NOTHING',
      [jour, hash]
    );
    const nouveau = lignesInserees(insertion) > 0;

    // « Visites » (courbe grise des statistiques) = ouvertures de l'application
    // (un ping par montage de l'app), conservé dans daily_stats sans purge.
    await strapi.db.connection.raw(
      `
      INSERT INTO daily_stats (visit_date, total_visits)
      VALUES (?, 1)
      ON CONFLICT (visit_date) DO UPDATE SET total_visits = daily_stats.total_visits + 1;
      `,
      [jour]
    );

    if (nouveau) {
      // Visiteur distinct du jour (deux compteurs : lecture directe des
      // empreintes + agrégat journalier conservé après purge).
      await strapi.db.connection.raw(
        `
        INSERT INTO daily_stats (visit_date, unique_visitors)
        VALUES (?, 1)
        ON CONFLICT (visit_date) DO UPDATE SET unique_visitors = daily_stats.unique_visitors + 1;
        `,
        [jour]
      );
      await ajouteVisiteurDuJour(jour);
    }
    return nouveau;
  } catch (err) {
    strapi.log.error(`[comptage] visite application non enregistrée : ${(err as Error).message}`);
    return false;
  }
};

// ─── Consultation d'un texte / d'un corps ────────────────────────────────────

/** Nom réel de la table d'un content-type (via métadonnées Strapi). */
const tableDe = (uid: string): string => {
  const meta = strapi.db.metadata.get(uid);
  const nom = meta?.tableName;
  if (!nom) throw new Error(`Table inconnue pour ${uid}`);
  return nom;
};

/**
 * Enregistre « ce visiteur a consulté cette cible aujourd'hui » et, si (et
 * seulement si) c'est un nouvel enregistrement, incrémente le compteur de la
 * cible (atomique) + le total journalier des consultations.
 *
 * @param type     'document' | 'corps'
 * @param cibleId  id NUMÉRIQUE de la ligne (strapi_documents / strapi_corps)
 * @returns true si le compteur a été incrémenté.
 */
export const enregistrerConsultation = async (
  ctx: any,
  type: TypeCible,
  cibleId: number
): Promise<boolean> => {
  try {
    if (!comptable(ctx)) return false;
    const jour = jourCourant();
    const hash = visiteurHash(ctx, jour);
    if (!hash) return false;

    const insertion = await strapi.db.connection.raw(
      `INSERT INTO consultations_visiteurs (jour, visiteur_hash, type_cible, cible_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [jour, hash, type, cibleId]
    );
    if (lignesInserees(insertion) <= 0) return false; // déjà consulté aujourd'hui

    // Incrément ATOMIQUE (pas de lecture-écriture) sur le compteur existant.
    const uid = type === 'document' ? 'api::document.document' : 'api::corps.corps';
    await strapi.db.connection.raw(
      `UPDATE ${tableDe(uid)} SET visits = COALESCE(visits, 0) + 1 WHERE id = ?`,
      [cibleId]
    );
    await ajouteConsultationDuJour(jour);
    return true;
  } catch (err) {
    strapi.log.error(`[comptage] consultation ${type}#${cibleId} non enregistrée : ${(err as Error).message}`);
    return false;
  }
};

// ─── Statistiques (lectures partagées) ──────────────────────────────────────

/** `knex.raw()` → tableau (sqlite) ou `{ rows }` (postgres). */
export const rowsOf = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.rows)) return raw.rows;
  return [];
};

/** Compteur d'une requête `COUNT(*)`. */
export const countOf = (raw: any): number => {
  const v = rowsOf(raw)[0]?.count ?? rowsOf(raw)[0]?.total ?? 0;
  return parseInt(String(v), 10) || 0;
};

/**
 * Durée de conservation des empreintes détaillées (jours) — les totaux
 * journaliers (`totaux_jour`) ne sont JAMAIS purgés.
 */
export const retentionEmpreintesJours = (): number => {
  const n = parseInt(process.env.VISITOR_RETENTION_DAYS || '35', 10);
  return Number.isFinite(n) && n > 0 ? n : 35;
};

/**
 * Purge des empreintes plus vieilles que la rétention.
 *
 * Journalise UNIQUEMENT des compteurs et une date (aucune empreinte, aucune
 * IP) : `strapi.log.info('[retention] … lignes supprimées (jour < AAAA-MM-JJ)')`.
 */
export const purgerEmpreintes = async (
  jours: number = retentionEmpreintesJours()
): Promise<{ jours: number; limite: string; visites: number; consultations: number }> => {
  const limite = dateJourMadagascar(new Date(Date.now() - jours * 24 * 3600 * 1000));
  const resVisites = await strapi.db.connection.raw(
    'DELETE FROM visites_visiteurs WHERE jour < ?',
    [limite]
  );
  const resConsultations = await strapi.db.connection.raw(
    'DELETE FROM consultations_visiteurs WHERE jour < ?',
    [limite]
  );
  const visites =
    typeof resVisites?.changes === 'number'
      ? resVisites.changes
      : typeof resVisites?.rowCount === 'number'
        ? resVisites.rowCount
        : 0;
  const consultations =
    typeof resConsultations?.changes === 'number'
      ? resConsultations.changes
      : typeof resConsultations?.rowCount === 'number'
        ? resConsultations.rowCount
        : 0;
  return { jours, limite, visites, consultations };
};

/** Nombre de visiteurs distincts pour un jour (empreintes conservées). */
export const visiteursDuJour = async (jour: string): Promise<number> =>
  countOf(
    await strapi.db.connection.raw('SELECT COUNT(*) AS count FROM visites_visiteurs WHERE jour = ?', [
      jour,
    ])
  );

export default {
  enregistrerVisiteApplication,
  enregistrerConsultation,
  visiteursDuJour,
  purgerEmpreintes,
  retentionEmpreintesJours,
  lignesInserees,
  rowsOf,
  countOf,
};
