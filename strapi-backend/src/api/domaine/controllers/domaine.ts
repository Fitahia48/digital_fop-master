/**
 * Controller domaine — forme de réponse legacy.
 *
 * Portage de `getDomaines` / `createDomaine` / `deleteDomaine` de
 * backend/src/controllers/documents.controller.js.
 *
 * Le front historique (Menu.jsx, SearchBar.jsx, AddDocs.jsx, EditDoc.jsx)
 * appelle `GET /api/domaines/` et lit `response.data.results` : on surcharge
 * donc `find` (au lieu de l'enveloppe core Strapi `{ data, meta }`).
 *
 * Les routes et handlers core (`/domaines`) sont conservés à l'identique, donc
 * les permissions déjà attribuées (Public : find/findOne ; Administrateur : tout)
 * restent valides — aucune route custom n'est ajoutée.
 *
 * Ajouts de la page d'administration « Thèmes » (/admin/themes) :
 *  - `documents_count` sur chaque domaine (l'interface prévient avant une
 *    suppression qui détacherait des documents) ;
 *  - `update` (renommage) en forme legacy `{ nom }` ;
 *  - noms uniques y compris à la casse (« Droit foncier » ≠ « droit foncier »
 *    pour PostgreSQL, d'où le contrôle applicatif) ;
 *  - suppression refusée (409) tant que des documents sont rattachés, sauf
 *    `?force=true` : les documents ne sont alors PAS supprimés, seulement
 *    détachés du thème.
 */
import { factories } from '@strapi/strapi';
import { findOneByRef } from '../../../utils/by-ref';

const UID = 'api::domaine.domaine';
const DOCUMENT_UID = 'api::document.document';
const NOM_MAX = 120;

/** Nom nettoyé : espaces multiples réduits, début/fin rognés. */
const normalizeNom = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** Nombre de documents rattachés au domaine (0 si le comptage échoue). */
const compteDocuments = async (domaineId: number): Promise<number> => {
  try {
    return (await (strapi.documents as any)(DOCUMENT_UID).count({
      filters: { domaine: { id: domaineId } },
    })) as number;
  } catch (err) {
    console.error('[domaine] count documents:', (err as Error).message);
    return 0;
  }
};

/** Attache `documents_count` à une ligne domaine (forme legacy conservée). */
const avecCompteur = async (row: any): Promise<any> => ({
  ...row,
  documents_count: await compteDocuments(row.id),
});

/**
 * Un AUTRE domaine porte-t-il déjà ce nom ?
 * Comparaison insensible à la casse : la contrainte `unique` de la base est
 * binaire et laisserait coexister « Droit foncier » et « droit foncier ».
 */
const nomDejaPris = async (nom: string, saufId?: number): Promise<boolean> => {
  const rows = (await (strapi.documents as any)(UID).findMany({
    limit: -1,
  })) as any[];
  const cible = normalizeNom(nom).toLocaleLowerCase('fr');
  return rows.some(
    (row) =>
      row.id !== saufId &&
      normalizeNom(row.nom).toLocaleLowerCase('fr') === cible
  );
};

/** Valide le nom reçu ; renvoie le message d'erreur ou null. */
const erreurNom = (nom: string): string | null => {
  if (!nom) return 'Le nom du domaine est obligatoire.';
  if (nom.length > NOM_MAX) {
    return `Le nom du domaine ne peut pas dépasser ${NOM_MAX} caractères.`;
  }
  return null;
};

const reponseConflit = (ctx: any, message: string, documents?: number) => {
  ctx.status = 409;
  ctx.body = documents === undefined ? { message } : { message, documents_count: documents };
};

export default factories.createCoreController(UID, () => ({
  // GET /api/domaines/ (?with_counts=true pour les compteurs de documents)
  // Les compteurs coûtent une requête par thème : le menu public, qui n'en a
  // pas besoin, garde une seule requête ; seule la page d'admin les demande.
  async find(ctx: any) {
    try {
      const rows = (await strapi.documents(UID).findMany({
        sort: [{ id: 'desc' }],
        limit: -1,
      })) as any[];
      const withCounts = String(ctx.query?.with_counts ?? '') === 'true';
      ctx.body = {
        count: rows.length,
        results: withCounts ? await Promise.all(rows.map(avecCompteur)) : rows,
      };
    } catch (err) {
      console.error('[domaine] find:', (err as Error).message);
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/domaines/:id/
  async findOne(ctx: any) {
    try {
      const row = await findOneByRef(UID, ctx.params.id);
      if (!row) return ctx.notFound('Domaine non trouvé.');
      ctx.body = await avecCompteur(row);
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // POST /api/domaines/ (admin)
  async create(ctx: any) {
    try {
      const body = ctx.request.body || {};
      const nom = normalizeNom(body.nom ?? body.data?.nom);
      const erreur = erreurNom(nom);
      if (erreur) return ctx.badRequest(erreur);
      if (await nomDejaPris(nom)) {
        return reponseConflit(ctx, `Un domaine nommé « ${nom} » existe déjà.`);
      }

      const created = (await strapi.documents(UID).create({
        data: { nom },
      })) as any;

      ctx.status = 201;
      ctx.body = { ...created, documents_count: 0 };
    } catch (err) {
      console.error('[domaine] create:', (err as Error).message);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // PUT/PATCH /api/domaines/:id/ (admin) — renommage
  async update(ctx: any) {
    try {
      const current = await findOneByRef(UID, ctx.params.id);
      if (!current) return ctx.notFound('Domaine non trouvé.');

      const body = ctx.request.body || {};
      const nom = normalizeNom(body.nom ?? body.data?.nom);
      const erreur = erreurNom(nom);
      if (erreur) return ctx.badRequest(erreur);

      // Nom inchangé : rien à écrire, on renvoie simplement la ligne à jour.
      if (nom === normalizeNom(current.nom)) {
        ctx.body = await avecCompteur(current);
        return;
      }
      if (await nomDejaPris(nom, current.id)) {
        return reponseConflit(ctx, `Un domaine nommé « ${nom} » existe déjà.`);
      }

      const updated = (await strapi.documents(UID).update({
        documentId: current.documentId,
        data: { nom },
      })) as any;

      ctx.body = await avecCompteur({ ...current, ...updated });
    } catch (err) {
      console.error('[domaine] update:', (err as Error).message);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // DELETE /api/domaines/:id/ (admin) — ?force=true pour détacher les documents
  async delete(ctx: any) {
    try {
      const row = await findOneByRef(UID, ctx.params.id);
      if (!row) return ctx.notFound('Domaine non trouvé.');

      const documents = await compteDocuments(row.id);
      const force = String(ctx.query?.force ?? '') === 'true';

      if (documents > 0 && !force) {
        return reponseConflit(
          ctx,
          `Ce thème est utilisé par ${documents} document(s). Supprimez-le avec « force » pour les détacher.`,
          documents
        );
      }

      await strapi.documents(UID).delete({ documentId: row.documentId });
      ctx.status = 204;
    } catch (err) {
      console.error('[domaine] delete:', (err as Error).message);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },
}));
