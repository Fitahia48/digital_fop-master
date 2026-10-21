/**
 * Controller document.
 *
 * Deux blocs :
 *  1. CRUD en **forme legacy** (portage de documents.controller.js) : le front
 *     appelle `/api/documents/` (avec ou sans slash final) et lit
 *     `{ count, results }`, des objets plats, les médias en URL, etc.
 *     Le chemin legacy coïncide avec le chemin core (`/documents`) : on
 *     surcharge donc directement les handlers core (`find`, `findOne`,
 *     `create`, `update`, `delete`) — mêmes routes, mêmes actions, donc
 *     permissions inchangées. Aucune collision inter-modules.
 *  2. Endpoints non-CRUD (visit, téléchargement, stats, suggestions, statut).
 *
 * ⚠️ L'upload de fichier utilise le service officiel
 * `strapi.plugin('upload').service('upload').upload()` — `uploadToEntity`
 * n'existe pas en Strapi 5.
 */
import { factories } from '@strapi/strapi';
import { estPeriodeValide, sommeStatistiques } from '../../../utils/analytics';
import {
  ValidationError,
  ForbiddenError,
  getRequestUser,
  isAdminUser,
} from '../../../utils/errors';
import { findOneByRef } from '../../../utils/by-ref';
import { enregistrerConsultation } from '../../../utils/comptage';

const UID = 'api::document.document';
const REL_UID = 'api::document-relation.document-relation';
const AUDIT_UID = 'api::statut-audit.statut-audit';

/**
 * Rôles habilités à confirmer/modifier le STATUT JURIDIQUE d'un texte.
 * Décision ministérielle attendue (audit P1) : en attendant la création d'un
 * rôle dédié, l'Administrateur seul est habilité — le circuit est côté serveur
 * (permission + contrôle ici), jamais dans le seul front.
 */
const canValidateLegalStatus = (user: any): boolean => isAdminUser(user);

const STATUS_MAP: Record<string, string> = {
  en_vigueur: 'en_vigueur',
  'en vigueur': 'en_vigueur',
  vigueur: 'en_vigueur',
  abroge: 'abroge',
  'abrogé': 'abroge',
  modifie: 'modifie',
  'modifié': 'modifie',
  non_verifie: 'non_verifie',
  'non vérifié': 'non_verifie',
  'non verifie': 'non_verifie',
};

/**
 * Normalise un statut juridique vers les valeurs de l'enum Strapi
 * (`en_vigueur` / `abroge` / `modifie`). Tolère les libellés legacy
 * accentués ou capitalisés ; renvoie `fallback` si la valeur est inconnue
 * (plutôt que de laisser Strapi rejeter l'écriture).
 */
const normalizeStatus = (raw: unknown, fallback: string): string => {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const key = String(raw).toLowerCase().trim();
  return STATUS_MAP[key] ?? (STATUS_MAP[key.replace(/[éèê]/g, 'e')] as string) ?? fallback;
};

/** URL absolue d'un média Strapi (objet populate) ou valeur brute (chaîne legacy). */
const mediaUrl = (media: any): string | null => {
  if (!media) return null;
  if (typeof media === 'object') return media.url ?? null;
  return String(media);
};

const parsePagination = (query: any) => {
  const page = Math.max(1, parseInt(query?.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query?.page_size, 10) || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
};

/**
 * P1 — Contrôle de publication côté serveur.
 *
 * Seules les notices « validees » sont visibles du public (visiteur anonyme ou
 * simple usager). Les notices en brouillon / à valider ne sont lisibles que par
 * l'Administrateur (rôle habilité), quel que soit le paramétrage des permissions
 * U&P : le contrôle est ici, pas seulement dans le front.
 *
 * @returns le fragment de filtre à appliquer, ou `null` pour « pas de filtre ».
 */
const publicationFilter = async (ctx: any): Promise<Record<string, any> | null> => {
  const user = getRequestUser(ctx);
  if (isAdminUser(user)) return null; // admin : tout
  return { etat_notice: 'validee' };
};

/** Fusionne un filtre existant avec la contrainte de publication. */
const withPublicationFilter = (
  filters: Record<string, any>,
  pub: Record<string, any> | null
): Record<string, any> =>
  pub
    ? {
        $and: [
          ...((filters.$and as any[]) || []),
          pub,
          ...((filters.$or ? [] : []) as any[]),
        ],
        ...(filters.$or ? { $or: filters.$or } : {}),
      }
    : filters;

/** Forme legacy d'une ligne document (médias en URL, domaine_nom dérivé). */
const legacyDocument = (doc: any) => ({
  ...doc,
  fichier: mediaUrl(doc.fichier),
  pdf_file: mediaUrl(doc.pdf_file),
  domaine_nom: doc.domaine?.nom ?? null,
  last_modified_by: doc.last_modified_by?.id ?? doc.last_modified_by ?? null,
  // Masquer les champs système de validation juridique (pur admin) au public :
  statut_verifie_par: undefined,
  statut_verifie_le: doc.statut_verifie_le ?? null,
  // Nouveaux champs pour le telechargeable
  telechargeable: doc.telechargeable ?? true,
});

/** Téléverse un éventuel fichier multipart (champ « fichier ») → id média Strapi. */
const uploadFichier = async (ctx: any): Promise<number | null> => {
  const uploaded = ctx.request?.files?.fichier;
  if (!uploaded) return null;
  const files = Array.isArray(uploaded) ? uploaded : [uploaded];
  const [file] = await strapi.plugin('upload').service('upload').upload({ data: {}, files });
  return file?.id ?? null;
};

// Le front historique appelle ces routes avec l'id numérique du document.
const findDocByDocumentId = (ref: string) => findOneByRef(UID, ref, ['domaine', 'fichier', 'pdf_file']);

export default factories.createCoreController(UID, () => ({
  // ─── CRUD legacy ───────────────────────────────────────────────────────────

  // GET /api/documents/ (filtres, recherche, pagination legacy)
  async find(ctx: any) {
    try {
      const q = ctx.request.query || {};
      const { page, pageSize, offset } = parsePagination(q);

      const pub = await publicationFilter(ctx);
      const filters: Record<string, any> = withPublicationFilter({}, pub);
      if (q.type) filters.type = { $containsi: q.type };
      if (q.domaine || q.domaine_id) filters.domaine = { id: Number(q.domaine || q.domaine_id) };
      if (q.status) {
        const normalized = STATUS_MAP[String(q.status).toLowerCase().trim()];
        if (normalized) filters.status = normalized;
        else
          return ctx.badRequest(
            'Statut invalide. Valeurs autorisées : en_vigueur, abroge, modifie, non_verifie.'
          );
      }
      if (q.searchBy && q.searchValue) {
        if (q.searchBy === 'objet') filters.objet = { $containsi: q.searchValue };
        else if (q.searchBy === 'numero') filters.numero = { $containsi: q.searchValue };
        else if (q.searchBy === 'date') filters.date = q.searchValue;
      }
      if (q.start_date && q.end_date) filters.date = { $gte: q.start_date, $lte: q.end_date };
      else if (q.start_date) filters.date = { $gte: q.start_date };
      else if (q.end_date) filters.date = { $lte: q.end_date };
      if (q.numero) filters.numero = { $containsi: q.numero };
      if (q.dateJournal) filters.date_journal = q.dateJournal;
      if (q.numeroJournal) filters.numero_journal = { $containsi: q.numeroJournal };
      if (q.search) {
        // Attention : $or doit rester au niveau racine — on le combine avec le
        // filtre de publication via $and pour ne pas l'écraser.
        filters.$or = [{ objet: { $containsi: q.search } }, { numero: { $containsi: q.search } }];
      }

      const total = (await strapi.documents(UID).count({ filters })) as unknown as number;
      const rows = (await strapi.documents(UID).findMany({
        filters,
        populate: ['domaine', 'fichier', 'pdf_file'],
        limit: pageSize,
        offset,
        sort: [{ id: 'desc' }],
      })) as any[];

      const hasNext = offset + pageSize < total;
      const buildPageUrl = (target: number) => {
        const sp = new URLSearchParams({ ...q, page: String(target) } as any);
        return `/api/documents/?${sp.toString()}`;
      };

      ctx.body = {
        count: total,
        next: hasNext ? buildPageUrl(page + 1) : null,
        previous: page > 1 ? buildPageUrl(page - 1) : null,
        results: rows.map(legacyDocument),
      };
    } catch (err) {
      console.error('[document] find:', (err as Error).message);
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/documents/:id/ (+ relations_actives / relations_passives)
  async findOne(ctx: any) {
    try {
      const doc = await findDocByDocumentId(ctx.params.id ?? ctx.params.documentId);
      if (!doc) {
        ctx.status = 404;
        ctx.body = { detail: 'Document non trouvé.' };
        return;
      }

      // P1 : une notice non validée n'est visible que d'un rôle habilité —
      // impossible d'accéder à un brouillon en devinant l'URL.
      const pub = await publicationFilter(ctx);
      if (pub && doc.etat_notice !== 'validee') {
        ctx.status = 404;
        ctx.body = { detail: 'Document non trouvé.' };
        return;
      }

      const [sources, cibles] = await Promise.all([
        strapi.documents(REL_UID).findMany({
          filters: { document_source: { documentId: doc.documentId } } as any,
          populate: ['document_cible'],
          limit: -1,
        }),
        strapi.documents(REL_UID).findMany({
          filters: { document_cible: { documentId: doc.documentId } } as any,
          populate: ['document_source'],
          limit: -1,
        }),
      ]);

      const slim = (d: any) =>
        d && {
          id: d.id,
          numero: d.numero,
          objet: d.objet,
          type: d.type,
          date: d.date,
          status: d.status,
        };

      ctx.body = {
        ...legacyDocument(doc),
        relations_actives: (sources as any[]).map((r: any) => ({
          id: r.id,
          type_relation: r.type_relation,
          date_creation: r.date_creation,
          document_cible_id: r.document_cible?.id,
          ...slim(r.document_cible),
        })),
        relations_passives: (cibles as any[]).map((r: any) => ({
          id: r.id,
          type_relation: r.type_relation,
          date_creation: r.date_creation,
          document_source_id: r.document_source?.id,
          ...slim(r.document_source),
        })),
      };
    } catch (err) {
      console.error('[document] findOne:', (err as Error).message);
      return ctx.internalServerError((err as Error).message);
    }
  },

  // POST /api/documents/ (multipart, admin)
  async create(ctx: any) {
    try {
      const b = ctx.request.body || {};
      const required = ['type', 'objet', 'numero', 'date'];
      const missing = required.filter((k) => !b[k]);
      if (missing.length) {
        throw new ValidationError(`Champs requis manquants : ${missing.join(', ')}`);
      }

      const inclus = String(b.inclus_journal || b.inclusJournal || 'false').toLowerCase() === 'true';
      // P1 : une nouvelle notice démarre TOUJOURS en « brouillon » pour les
      // utilisateurs non-admins. Pour les admins, la notice est directement
      // « validée » afin qu'elle soit visible immédiatement après création.
      //
      // Simplification du circuit : le formulaire d'ajout propose deux choix
      // (« En vigueur » / « Abrogé »). La valeur reçue est validée et limitée
      // à ces deux valeurs ; si elle est absente ou invalide, repli explicite
      // sur « en_vigueur » (jamais d'erreur bloquante). L'enum complet reste
      // inchangé en base : aucun document existant (non_verifie / modifie) n'est réécrit.
      const requestedStatus = normalizeStatus(b.status, 'en_vigueur');
      const status = requestedStatus === 'abroge' ? ('abroge' as const) : ('en_vigueur' as const);
      const creatingUser = getRequestUser(ctx);
      const etatNotice = isAdminUser(creatingUser) ? 'validee' : 'brouillon';
      const data: Record<string, any> = {
        type: b.type,
        objet: b.objet,
        numero: b.numero,
        date: b.date,
        conseil: b.conseil || 'Autre',
        status,
        etat_notice: etatNotice,
        mots_cles: Array.isArray(b.mots_cles)
          ? b.mots_cles
          : typeof b.mots_cles === 'string' && b.mots_cles.trim()
            ? b.mots_cles.split(',').map((m: string) => m.trim()).filter(Boolean)
            : [],
        langue: ['fr', 'en', 'mg'].includes(b.langue) ? b.langue : null,
        organisme_emetteur: b.organisme_emetteur || null,
        lieu_signature: b.lieu_signature || null,
        signataires: b.signataires || null,
        date_entree_vigueur: b.date_entree_vigueur || null,
        modification_details: b.modification_details || null,
        inclus_journal: inclus,
        date_journal: inclus ? b.dateJournal || b.date_journal || null : null,
        numero_journal: inclus ? b.numeroJournal || b.numero_journal || null : null,
        page_journal: inclus ? b.pageJournal || b.page_journal || null : null,
      };
      if (b.domaine && !isNaN(Number(b.domaine))) data.domaine = Number(b.domaine);

      // Nouveaux champs : telechargeable
      const telechargeableRaw = b.telechargeable ?? b.teleChargeable ?? 'true';
      // Accept string "true"/"false" or boolean
      if (typeof telechargeableRaw === 'boolean') {
        data.telechargeable = telechargeableRaw;
      } else if (typeof telechargeableRaw === 'string') {
        const val = telechargeableRaw.toLowerCase();
        data.telechargeable = val === 'true' || val === '1' || val === 'yes';
      } else {
        data.telechargeable = true; // défaut
      }

      const fileId = await uploadFichier(ctx);
      if (fileId) data.fichier = fileId;

      const created = await strapi.documents(UID).create({
        data: data as any,
        populate: ['domaine', 'fichier', 'pdf_file'],
      });

      ctx.status = 201;
      ctx.body = legacyDocument(created);
    } catch (err) {
      if (err instanceof ValidationError) return ctx.badRequest(err.message);
      console.error('[document] create:', (err as Error).message);
      return ctx.badRequest((err as Error).message);
    }
  },

  // PUT/PATCH /api/documents/:id/ (multipart, admin)
  async update(ctx: any) {
    try {
      const doc = await findDocByDocumentId(ctx.params.id ?? ctx.params.documentId);
      if (!doc) {
        ctx.status = 404;
        ctx.body = { detail: 'Document non trouvé.' };
        return;
      }
      const b = ctx.request.body || {};
      const inclus =
        b.inclus_journal !== undefined || b.inclusJournal !== undefined
          ? String(b.inclus_journal ?? b.inclusJournal).toLowerCase() === 'true'
          : doc.inclus_journal;

      const data: Record<string, any> = {
        type: b.type || doc.type,
        objet: b.objet || doc.objet,
        numero: b.numero || doc.numero,
        date: b.date || doc.date,
        conseil: b.conseil || doc.conseil,
        // Simplification : l'admin modifie le statut directement depuis le
        // formulaire d'édition (route réservée à l'admin). La valeur reçue est
        // normalisée vers l'enum ; si elle est absente ou invalide, on conserve
        // le statut actuel du document (aucune réécriture silencieuse).
        status:
          b.status !== undefined
            ? normalizeStatus(b.status, doc.status ?? 'en_vigueur')
            : doc.status ?? 'en_vigueur',
        inclus_journal: inclus,
        date_journal: b.date_journal || b.dateJournal || doc.date_journal,
        numero_journal: b.numero_journal || b.numeroJournal || doc.numero_journal,
        page_journal: b.page_journal || b.pageJournal || doc.page_journal,
        modification_details:
          b.modification_details !== undefined ? b.modification_details : doc.modification_details,
        date_entree_vigueur:
          b.date_entree_vigueur !== undefined ? b.date_entree_vigueur || null : doc.date_entree_vigueur,

        last_modified_at: new Date(),
      };
      if (b.domaine || b.domaine_id) data.domaine = Number(b.domaine || b.domaine_id);
      if (b.mots_cles !== undefined) {
        data.mots_cles = Array.isArray(b.mots_cles)
          ? b.mots_cles
          : String(b.mots_cles || '').split(',').map((m: string) => m.trim()).filter(Boolean);
      }
      if (b.langue !== undefined) {
        data.langue = ['fr', 'en', 'mg'].includes(b.langue) ? b.langue : null;
      }
      if (b.organisme_emetteur !== undefined) {
        data.organisme_emetteur = b.organisme_emetteur || null;
      }
      if (b.lieu_signature !== undefined) {
        data.lieu_signature = b.lieu_signature || null;
      }
      if (b.signataires !== undefined) {
        data.signataires = b.signataires || null;
      }

      const requester = getRequestUser(ctx);
      if (requester?.id) data.last_modified_by = requester.id;

      // Nouveaux champs : telechargeable
      if (b.telechargeable !== undefined || b.teleChargeable !== undefined) {
        const telechargeableRaw = b.telechargeable ?? b.teleChargeable;
        if (typeof telechargeableRaw === 'boolean') {
          data.telechargeable = telechargeableRaw;
        } else if (typeof telechargeableRaw === 'string') {
          const val = telechargeableRaw.toLowerCase();
          data.telechargeable = val === 'true' || val === '1' || val === 'yes';
        } else {
          // garder la valeur existante
          data.telechargeable = doc.telechargeable;
        }
      } else {
        // garder la valeur existante
        data.telechargeable = doc.telechargeable;
      }

      const fileId = await uploadFichier(ctx);
      if (fileId) data.fichier = fileId;

      await strapi.documents(UID).update({ documentId: doc.documentId, data: data as any });

      const fresh = (await findDocByDocumentId(doc.id)) ?? doc;
      ctx.body = legacyDocument(fresh);
    } catch (err) {
      console.error('[document] update:', (err as Error).message);
      return ctx.badRequest((err as Error).message);
    }
  },

  // DELETE /api/documents/:id/ (admin)
  async delete(ctx: any) {
    try {
      const doc = await findOneByRef(UID, ctx.params.id ?? ctx.params.documentId);
      if (!doc) {
        ctx.status = 404;
        ctx.body = { detail: 'Document non trouvé.' };
        return;
      }
      await strapi.documents(UID).delete({ documentId: doc.documentId });
      ctx.status = 204;
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // ─── Endpoints non-CRUD ──────────────────────────────────────────────────────

  // POST /api/documents/:documentId/visit
  // Règle métier : 1 visiteur (empreinte anonyme) = 1 comptage par texte et
  // par jour (jour à Madagascar). L'unicité est garantie par la base
  // (clé unique + ON CONFLICT DO NOTHING, utils/comptage.ts) : les appels
  // répétés (refresh, modale + fiche) ne comptent qu'une fois.
  async incrementVisit(ctx: any) {
    try {
      const doc = await findDocByDocumentId(ctx.params.documentId);
      if (!doc) return ctx.notFound('Document non trouvé');

      // Un texte non consultable par le public (brouillon / à valider) ne se
      // compte pas — même filtre que findOne (publicationFilter).
      const pub = await publicationFilter(ctx);
      if (pub && doc.etat_notice !== 'validee') return ctx.notFound('Document non trouvé');

      const counted = await enregistrerConsultation(ctx, 'document', Number(doc.id));
      ctx.body = {
        counted,
        message: counted ? 'Visite enregistrée' : 'Visite déjà comptée pour aujourd’hui',
      };
    } catch (err) {
      console.error('incrementDocumentVisit error:', err);
      // Jamais d'erreur bloquante pour l'usager côté comptage : on répond 200
      // non compté plutôt qu'un 500 (le serveur reste la garantie d'unicité).
      ctx.body = { counted: false, message: 'Visite non comptée' };
    }
  },

  // POST /api/documents/:documentId/telechargement
  async incrementTelechargement(ctx: any) {
    try {
      const doc = await findDocByDocumentId(ctx.params.documentId);
      if (!doc) return ctx.notFound('Document non trouvé');
      // Vérifier si le document est telechargeable
      if (!doc.telechargeable) {
        // Refuser l'appel avec 403 Forbidden
        return ctx.forbidden('Téléchargement non autorisé pour ce document');
      }
      await strapi.documents(UID).update({
        documentId: doc.documentId,
        data: { telechargements: (doc.telechargements || 0) + 1 },
      });
      ctx.body = { message: 'Téléchargement enregistré' };
    } catch (err) {
      console.error('incrementDocumentTelechargement error:', err);
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/documents/most-visited
  async mostVisited(ctx: any) {
    try {
      const pub = await publicationFilter(ctx);
      const rows = (await strapi.documents(UID).findMany({
        filters: withPublicationFilter({}, pub),
        sort: [{ visits: 'desc' }],
        limit: 10,
        populate: ['domaine'],
      })) as any[];
      ctx.body = rows.map((d) => ({ ...d, domaine_nom: d.domaine?.nom ?? null }));
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/documents/stats?type=
  async documentStats(ctx: any) {
    try {
      const { type } = ctx.query || {};
      if (type) {
        const count = (await strapi.documents(UID).count({
          filters: { type: { $eqi: type } },
        })) as unknown as number;
        ctx.body = { type, count };
        return;
      }
      const total = (await strapi.documents(UID).count({})) as unknown as number;
      const rows = (await strapi.documents(UID).findMany({
        limit: -1,
        fields: ['type'],
      })) as any[];
      const byTypeMap: Record<string, number> = {};
      for (const r of rows) byTypeMap[r.type] = (byTypeMap[r.type] || 0) + 1;
      ctx.body = {
        total_documents: total,
        documents_by_type: Object.entries(byTypeMap)
          .map(([t, count]) => ({ type: t, count }))
          .sort((a, b) => a.type.localeCompare(b.type)),
      };
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/documents/stats-api?period=daily|monthly|yearly
  async documentStatsApi(ctx: any) {
    try {
      const { period = 'daily', start_date, end_date } = ctx.query || {};
      if (!estPeriodeValide(period)) {
        return ctx.badRequest("Période invalide. Utilisez 'daily', 'monthly' ou 'yearly'.");
      }
      const total = await sommeStatistiques('document_stats', period, start_date, end_date);

      ctx.body = {
        daily_count: period === 'daily' ? total : 0,
        monthly_count: period === 'monthly' ? total : 0,
        yearly_count: period === 'yearly' ? total : 0,
      };
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/documents/suggestions?searchBy=objet|numero|type&query=&type=
  async suggestions(ctx: any) {
    try {
      const { searchBy = 'objet', query = '', type } = ctx.query || {};
      if (!String(query).trim()) {
        ctx.body = [];
        return;
      }

      const pub = await publicationFilter(ctx);

      if (searchBy === 'type') {
        const rows = (await strapi.documents(UID).findMany({
          filters: withPublicationFilter({ type: { $containsi: query } }, pub),
          fields: ['type'],
          limit: -1,
        })) as any[];
        ctx.body = Array.from(new Set(rows.map((r) => r.type))).slice(0, 10);
        return;
      }

      if (searchBy === 'objet' || searchBy === 'numero') {
        const filters: Record<string, any> = withPublicationFilter(
          { [searchBy]: { $containsi: query } },
          pub
        );
        if (type) filters.type = { $containsi: type };
        const rows = (await strapi.documents(UID).findMany({
          filters,
          fields: [searchBy],
          limit: -1,
        })) as any[];
        ctx.body = Array.from(new Set(rows.map((r) => r[searchBy]))).slice(0, 10);
        return;
      }

      ctx.body = [];
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // PATCH /api/documents/:documentId/status — STATUT JURIDIQUE (rôle autorisé)
  //
  // Simplification du circuit de validation :
  //  - rôle habilité uniquement (contrôle serveur, pas seulement le front) ;
  //  - justification OPTIONNELLE : enregistrée dans l'audit s'il en est
  //    fournie, journalisée vide sinon (plus de blocage 400).
  async updateStatus(ctx: any) {
    try {
      const user = getRequestUser(ctx);
      if (!canValidateLegalStatus(user)) {
        throw new ForbiddenError(
          'Seul un rôle habilité peut confirmer ou modifier le statut juridique.'
        );
      }

      const { status, justification } = ctx.request.body || {};
      if (!status) return ctx.badRequest('Le champ status est obligatoire.');

      const normalized = STATUS_MAP[String(status).toLowerCase().trim()];
      if (!normalized) {
        return ctx.badRequest(
          'Statut invalide. Valeurs autorisées : en_vigueur, abroge, modifie, non_verifie.'
        );
      }

      const doc = await findDocByDocumentId(ctx.params.documentId);
      if (!doc) return ctx.notFound('Document non trouvé.');

      const ancien = doc.status ?? null;

      await strapi.documents(UID).update({
        documentId: doc.documentId,
        data: {
          status: normalized as any,
          statut_verifie_par: user.id,
          statut_verifie_le: new Date(),
          last_modified_by: user.id,
          last_modified_at: new Date(),
        },
      });

      // Journal append-only (jamais édité ni supprimé par l'application)
      await strapi.documents(AUDIT_UID).create({
        data: {
          document: doc.documentId,
          ancien_statut: ancien,
          nouveau_statut: normalized,
          justification: String(justification ?? '').trim(),
          auteur_id: user.id,
          auteur_nom: user.username || user.email || `user#${user.id}`,
          source: 'api',
        } as any,
      });

      ctx.body = { message: 'Statut mis à jour avec succès.', status: normalized };
    } catch (err) {
      if (err instanceof ForbiddenError) throw err;
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/documents/:documentId/statut-historique (rôle habilité)
  async statutHistorique(ctx: any) {
    try {
      const user = getRequestUser(ctx);
      if (!canValidateLegalStatus(user)) {
        throw new ForbiddenError('Accès réservé aux rôles habilités.');
      }
      const doc = await findDocByDocumentId(ctx.params.documentId);
      if (!doc) return ctx.notFound('Document non trouvé.');

      const rows = (await strapi.documents(AUDIT_UID).findMany({
        filters: { document: { documentId: doc.documentId } } as any,
        sort: [{ createdAt: 'desc' }],
        limit: -1,
      })) as any[];

      ctx.body = {
        count: rows.length,
        results: rows.map((r: any) => ({
          id: r.id,
          ancien_statut: r.ancien_statut,
          nouveau_statut: r.nouveau_statut,
          justification: r.justification,
          auteur: r.auteur_nom,
          auteur_id: r.auteur_id,
          created_at: r.createdAt,
          source: r.source,
        })),
      };
    } catch (err) {
      if (err instanceof ForbiddenError) throw err;
      return ctx.internalServerError((err as Error).message);
    }
  },

  // PATCH /api/documents/:documentId/etat-notice (admin)
  // État éditorial de la notice : brouillon → à valider → validée.
  // Indépendant du statut juridique (règle P1 : les deux circuits sont séparés).
  async setEtatNotice(ctx: any) {
    try {
      const user = getRequestUser(ctx);
      if (!isAdminUser(user)) {
        throw new ForbiddenError('Accès réservé aux administrateurs.');
      }
      const { etat } = ctx.request.body || {};
      if (!['brouillon', 'a_valider', 'validee'].includes(String(etat))) {
        return ctx.badRequest('État invalide. Valeurs autorisées : brouillon, a_valider, validee.');
      }

      const doc = await findDocByDocumentId(ctx.params.documentId);
      if (!doc) return ctx.notFound('Document non trouvé.');

      await strapi.documents(UID).update({
        documentId: doc.documentId,
        data: { etat_notice: etat as any, last_modified_by: user.id, last_modified_at: new Date() },
      });

      ctx.body = { message: 'État de la notice mis à jour.', etat_notice: etat };
    } catch (err) {
      if (err instanceof ForbiddenError) throw err;
      return ctx.internalServerError((err as Error).message);
    }
  },
}));