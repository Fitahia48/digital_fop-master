/**
 * Extensions du controller demarche — fonctionnalité A (démarches spécialisées).
 *
 * - create      : liste blanche stricte (P2) ; user depuis ctx.state.user ;
 *                 transaction : vérification type actif + pièces obligatoires +
 *                 champs requis (zod, P9), numéro atomique, direction, date_limite.
 *                 Statut forcé 'soumise'. Compat legacy préservée (les anciens
 *                 champs type_demarche/objet/document_id restent acceptés).
 * - find/findOne: propriétaire ou admin/agent.
 * - mine / timeline / updateStatus : conservés (forme legacy).
 * - accuse-reception : PDF pdfkit (propriétaire ou admin), P3 documentId.
 *
 * La timeline et les emails sont écrits par le middleware Document Service
 * (P1) — PAS ici (sinon les écritures du panneau admin n'en bénéficieraient pas).
 */
import { factories } from '@strapi/strapi';
import { ForbiddenError, ValidationError, getRequestUser, isAdminUser } from '../../../utils/errors';
import { sendDemarcheStatusEmail } from '../../../utils/mailer';
import { resolveLang } from '../../../utils/email-templates';
import { findOneByRef } from '../../../utils/by-ref';
import { nextNumeroDossier } from '../../../utils/numero-dossier';
import {
  savePrivateFile,
  openPrivateFile,
  UID_FICHIER_PRIVE,
} from '../../../services/private-files';

const STATUTS = ['soumise', 'en_cours', 'traitee', 'rejetee'];
const TYPES_DEMARCHE = ['copie_certifiee', 'attestation', 'demande_information', 'autre'];

const POPULATE = ['user', 'document', 'pieces_jointes'] as const;

/** URL d'un média Strapi (objet) ou valeur brute (chaîne legacy). */
const mediaUrl = (media: any): string | null => {
  if (!media) return null;
  if (typeof media === 'object') return media.url ?? null;
  return String(media);
};

const findDemarche = (key: string) =>
  findOneByRef('api::demarche.demarche', key, [...POPULATE, 'type', 'direction', 'agent_affecte']);

/** Forme legacy d'une démarche + champs A (numero_dossier, direction, date_limite). */
const legacyDemarche = (d: any, includeUsager = false) => {
  const doc = d.document;
  return {
    id: d.id,
    documentId: d.documentId,
    user_id: d.user?.id ?? null,
    type_demarche: d.type_demarche,
    type_code: d.type?.code ?? null,
    type_libelle: d.type?.libelles ?? null,
    numero_dossier: d.numero_dossier ?? null,
    direction: d.direction ? { code: d.direction.code, nom: d.direction.nom } : null,
    agent_affecte: d.agent_affecte ? { id: d.agent_affecte.id, username: d.agent_affecte.username } : null,
    date_limite: d.date_limite ?? null,
    objet: d.objet,
    donnees_specifiques: d.donnees_specifiques ?? null,
    document_id: doc?.id ?? null,
    statut: d.statut,
    commentaire_admin: d.commentaire_admin ?? null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    document_type: doc?.type ?? null,
    document_numero: doc?.numero ?? null,
    document_objet: doc?.objet ?? null,
    nb_pieces_jointes: Array.isArray(d.pieces_jointes) ? d.pieces_jointes.length : 0,
    ...(includeUsager
      ? {
          usager_nom: d.user?.nom ?? null,
          usager_prenom: d.user?.prenom ?? null,
          usager_email: d.user?.email ?? null,
        }
      : {}),
  };
};

export default factories.createCoreController('api::demarche.demarche', () => ({
  // ─── CRÉATION (usager connecté) — liste blanche P2 + transaction ────────────
  async create(ctx: any) {
    const user = getRequestUser(ctx);
    if (!user) return ctx.unauthorized();

    const body = ctx.request.body || {};
    const { objet } = body;
    // Compat legacy : type_demarche (enum) OU type_code (nouveau catalogue)
    const typeCode = body.type_code ?? body.type_demarche;
    const documentKey = body.document_id ?? body.document;
    // Champs spécifiques saisis par l'usager (JSON) — validés ci-dessous
    const donneesSpecifiques = body.donnees_specifiques ?? null;
    // Pièces jointes : fichiers multipart nommés pieces_<code>
    const uploadedFiles = ctx.request?.files || {};

    if (!objet || !String(objet).trim()) {
      throw new ValidationError("L'objet de la demande est obligatoire.");
    }

    // ─── Vérification du type (actif) + règles associées ────────────────────
    const types = (await strapi.documents('api::type-demarche.type-demarche').findMany({
      filters: { code: String(typeCode) },
      limit: 1,
    })) as any[];
    const typeDef = types[0];
    if (!typeDef) throw new ValidationError('Type de démarche invalide.');
    if (!typeDef.actif) throw new ValidationError('Ce type de démarche est momentanément indisponible.');

    // ─── Validation zod (P9) : payload + champs spécifiques requis ──────────
    const { z } = require('zod');
    const schema = z.object({
      objet: z.string().trim().min(1).max(2000),
      donnees_specifiques: z.record(z.string(), z.unknown()).nullable().optional(),
    });
    const parsed = schema.safeParse({ objet: String(objet), donnees_specifiques: donneesSpecifiques });
    if (!parsed.success) {
      throw new ValidationError('Données invalides : ' + parsed.error.issues.map((i: any) => i.message).join(', '));
    }

    // Champs spécifiques requis par le type
    const champsSpec: any[] = Array.isArray(typeDef.champs_specifiques) ? typeDef.champs_specifiques : [];
    const donnees = donneesSpecifiques ?? {};
    const manquants = champsSpec
      .filter((c) => c.obligatoire)
      .filter((c) => donnees[c.code] === undefined || donnees[c.code] === null || donnees[c.code] === '')
      .map((c) => c.libelles?.fr ?? c.code);
    if (manquants.length > 0) {
      throw new ValidationError(`Champs obligatoires manquants : ${manquants.join(', ')}`);
    }

    // Pièces obligatoires fournies ? (fichiers multipart nommés pieces_<code>)
    const piecesReq: any[] = Array.isArray(typeDef.pieces_requises) ? typeDef.pieces_requises : [];
    const piecesManquantes = piecesReq
      .filter((p) => p.obligatoire)
      .filter((p) => !uploadedFiles[`pieces_${p.code}`])
      .map((p) => p.libelles?.fr ?? p.code);
    if (piecesManquantes.length > 0) {
      throw new ValidationError(
        `Pièces obligatoires manquantes : ${piecesManquantes.join(', ')}`
      );
    }

    // Vérification optionnelle du document lié (legacy)
    let documentRef: number | undefined;
    if (documentKey) {
      const numeric = Number(documentKey);
      const docs = (await strapi.documents('api::document.document').findMany({
        filters: !Number.isNaN(numeric) ? { id: numeric } : { documentId: String(documentKey) as any },
        limit: 1,
      })) as any[];
      if (docs.length === 0) throw new ValidationError('Document lié introuvable.');
      documentRef = docs[0].id;
    }

    // ─── Transaction : compteur atomique + création démarche ────────────────
    const created = await strapi.db.connection.transaction(async (trx: any) => {
      // Numéro atomique (upsert ON CONFLICT dans la MÊME transaction)
      const numero = await nextNumeroDossier(trx);

      const dateLimite = new Date();
      dateLimite.setDate(dateLimite.getDate() + Number(typeDef.delai_cible_jours || 30));

      const row = (await strapi.documents('api::demarche.demarche').create({
        data: {
          user: user.id, // P2 : propriétaire imposé côté serveur
          type_demarche: TYPES_DEMARCHE.includes(typeCode) ? typeCode : 'autre',
          objet: String(objet).trim(),
          document: documentRef,
          statut: 'soumise', // P2 : statut initial forcé
          numero_dossier: numero, // P2 : jamais pris du corps de requête
          type: typeDef.documentId,
          direction: typeDef.direction?.documentId ?? typeDef.direction?.id,
          date_limite: dateLimite.toISOString().slice(0, 10),
          donnees_specifiques: donnees,
        },
        populate: ['user', 'type', 'direction'],
      })) as any;

      // Pièces jointes privées (D1) — hors transaction (stockage disque)
      // Note : les erreurs d'upload ne remontent pas dans la trx knex.
      const savedPieces: any[] = [];
      for (const piece of piecesReq) {
        const f = uploadedFiles[`pieces_${piece.code}`];
        if (!f) continue;
        // multer doit être configuré en memoryStorage pour lire le buffer
        const arr = Array.isArray(f) ? f : [f];
        for (const one of arr) {
          const rec = await savePrivateFile(strapi, one, {
            ownerUserId: user.id,
            categorie: 'demarche',
          });
          savedPieces.push(rec);
        }
      }
      // Pièce jointe libre (champ legacy « fichier », optionnel)
      const libre = uploadedFiles['fichier'];
      if (libre) {
        const arr = Array.isArray(libre) ? libre : [libre];
        for (const one of arr) {
          const rec = await savePrivateFile(strapi, one, {
            ownerUserId: user.id,
            categorie: 'demarche',
          });
          savedPieces.push(rec);
        }
      }
      // Liaison à la démarche : lignes demarche-piece-jointe → fichier-prive.
      for (const rec of savedPieces) {
        try {
          await strapi.documents('api::demarche-piece-jointe.demarche-piece-jointe').create({
            data: {
              demarche: row.documentId,
              fichier_prive: (rec as any).documentId,
              uploaded_at: new Date(),
            } as any,
          });
        } catch (e) {
          strapi.log.warn(`[demarche] pièce jointe non liée : ${(e as Error).message}`);
        }
      }

      return row;
    });

    const fresh = (await findDemarche(created.documentId)) ?? created;

    ctx.status = 201;
    ctx.body = {
      detail: 'Votre demande a bien été enregistrée. Conservez votre numéro de dossier.',
      demarche: legacyDemarche(fresh, false),
    };
  },

  // ─── LISTE (usager → les siennes, admin/agent → tout, filtre ?statut=) ─────
  async find(ctx: any) {
    const user = getRequestUser(ctx);
    if (!user) return ctx.unauthorized();

    const { statut } = ctx.query || {};
    if (statut && !STATUTS.includes(String(statut))) {
      throw new ValidationError('Statut invalide. Valeurs : soumise, en_cours, traitee, rejetee.');
    }

    const filters: Record<string, any> = {};
    const estAdmin = isAdminUser(user);
    if (!estAdmin) filters.user = { id: user.id };
    if (statut) filters.statut = statut;

    const rows = (await strapi.documents('api::demarche.demarche').findMany({
      filters,
      populate: [...POPULATE, 'type', 'direction'],
      sort: [{ createdAt: 'desc' }],
      limit: -1,
    })) as any[];

    ctx.body = { count: rows.length, results: rows.map((d) => legacyDemarche(d, estAdmin)) };
  },

  // ─── DÉTAIL (propriétaire ou admin/agent) ──────────────────────────────────
  async findOne(ctx: any) {
    const user = getRequestUser(ctx);
    if (!user) return ctx.unauthorized();

    const demarche = await findDemarche(ctx.params.documentId);
    if (!demarche) return ctx.notFound('Démarche introuvable.');

    if (!isAdminUser(user) && demarche.user?.id !== user.id) {
      throw new ForbiddenError("Vous n'avez pas accès à cette démarche.");
    }
    ctx.body = legacyDemarche(demarche, isAdminUser(user));
  },

  // ─── GET /api/demarches/mine/ ───────────────────────────────────────────────
  async mine(ctx: any) {
    const user = getRequestUser(ctx);
    if (!user) return ctx.unauthorized();

    const rows = (await strapi.documents('api::demarche.demarche').findMany({
      filters: { user: { id: user.id } },
      populate: ['document', 'pieces_jointes', 'type', 'direction'],
      sort: [{ createdAt: 'desc' }],
      limit: -1,
    })) as any[];

    ctx.body = { count: rows.length, results: rows.map((d) => legacyDemarche(d, false)) };
  },

  // ─── GET /api/demarches/:documentId/timeline/ (propriétaire ou admin) ───────
  async timeline(ctx: any) {
    const user = getRequestUser(ctx);
    if (!user) return ctx.unauthorized();

    try {
      const demarche = await findDemarche(ctx.params.documentId);
      if (!demarche) return ctx.notFound('Démarche introuvable.');

      if (!isAdminUser(user) && demarche.user?.id !== user.id) {
        throw new ForbiddenError("Vous n'avez pas accès au suivi de cette démarche.");
      }

      const entries = (await strapi.documents('api::demarche-timeline.demarche-timeline').findMany({
        filters: { demarche: { documentId: demarche.documentId } },
        populate: ['modifie_par'],
        sort: [{ createdAt: 'asc' }],
        limit: -1,
      })) as any[];

      const pieces = (demarche.pieces_jointes || []) as any[];

      ctx.body = {
        demarche: legacyDemarche(demarche, false),
        document: demarche.document
          ? {
              id: demarche.document.id,
              type: demarche.document.type ?? null,
              numero: demarche.document.numero ?? null,
              objet: demarche.document.objet ?? null,
            }
          : null,
        pieces_jointes: pieces.map((pj) => ({
          id: pj.id,
          libelle: pj.libelle ?? null,
          uploaded_at: pj.uploaded_at ?? pj.createdAt ?? null,
          fichier_prive: pj.fichier_prive
            ? {
                documentId: pj.fichier_prive.documentId,
                nom_original: pj.fichier_prive.nom_original,
                taille: pj.fichier_prive.taille,
                mime: pj.fichier_prive.mime,
              }
            : null,
        })),
        timeline: entries.map((t) => ({
          id: t.id,
          statut: t.statut,
          commentaire: t.commentaire ?? null,
          created_at: t.createdAt,
          modifie_par: t.modifie_par?.id ?? null,
          admin_nom: t.modifie_par?.nom ?? null,
          admin_prenom: t.modifie_par?.prenom ?? null,
        })),
      };
    } catch (err) {
      if (err instanceof ForbiddenError) throw err;
      console.error('getDemarcheTimeline error:', err);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // ─── PATCH /api/demarches/:documentId/status/ (admin) ───────────────────────
  async updateStatus(ctx: any) {
    const user = getRequestUser(ctx);
    const { statut, commentaire_admin } = ctx.request.body || {};

    if (!statut || !STATUTS.includes(statut)) {
      throw new ValidationError('Statut invalide. Valeurs : soumise, en_cours, traitee, rejetee.');
    }

    const demarche = await findDemarche(ctx.params.documentId);
    if (!demarche) return ctx.notFound('Démarche introuvable.');

    const updated = (await strapi.documents('api::demarche.demarche').update({
      documentId: demarche.documentId,
      data: {
        statut,
        commentaire_admin:
          commentaire_admin !== undefined ? commentaire_admin : demarche.commentaire_admin,
      },
      populate: ['user', 'direction'],
    })) as any;

    // NOTE : timeline + email écrits par le middleware P1 (demarche-lifecycle),
    // plus de double écriture ici.

    ctx.body = {
      detail: "Statut mis à jour. L'usager a été notifié par email.",
      demarche: legacyDemarche(updated, true),
    };
  },

  // ─── GET /api/demarches/:documentId/accuse-reception (PDF) ──────────────────
  async accuseReception(ctx: any) {
    const user = getRequestUser(ctx);
    if (!user) return ctx.unauthorized();

    const demarche = await findDemarche(ctx.params.documentId);
    if (!demarche) return ctx.notFound('Démarche introuvable.');

    if (!isAdminUser(user) && demarche.user?.id !== user.id) {
      throw new ForbiddenError("Vous n'avez pas accès à cette démarche.");
    }

    // import dynamique (pdfkit est CJS)
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    ctx.response.set('Content-Type', 'application/pdf');
    ctx.response.set(
      'Content-Disposition',
      `attachment; filename="accuse-reception-${demarche.numero_dossier || demarche.documentId}.pdf"`
    );
    ctx.body = doc; // Koa stream le corps automatiquement

    doc.fontSize(20).text("Accusé de réception", { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(12).text(`Référence : ${demarche.numero_dossier ?? '(attribution en cours)'}`);
    doc.text(`Objet : ${demarche.objet}`);
    doc.text(`Type : ${demarche.type?.libelles?.fr ?? demarche.type_demarche}`);
    doc.text(`Déposée le : ${new Date(demarche.createdAt).toLocaleDateString('fr-FR')}`);
    if (demarche.direction?.nom) doc.text(`Direction compétente : ${demarche.direction.nom}`);
    if (demarche.date_limite) {
      doc.text(`Délai cible de traitement : avant le ${new Date(demarche.date_limite).toLocaleDateString('fr-FR')}`);
    }
    doc.moveDown(2);
    doc.fontSize(10).fillColor('#555')
      .text("Ce document atteste de la réception de votre demande par le Ministère du Travail, de l'Emploi et de la Fonction Publique.", { align: 'justify' });

    doc.end();
  },

  // ─── GET /api/demarches/:documentId/pieces/:pieceId (propriétaire/admin) ────
  async pieceJointe(ctx: any) {
    const user = getRequestUser(ctx);
    if (!user) return ctx.unauthorized();

    const demarche = await findDemarche(ctx.params.documentId);
    if (!demarche) return ctx.notFound('Démarche introuvable.');
    if (!isAdminUser(user) && demarche.user?.id !== user.id) {
      throw new ForbiddenError("Vous n'avez pas accès à cette pièce jointe.");
    }

    const pieces = (demarche.pieces_jointes || []) as any[];
    const piece = pieces.find((p) => p.documentId === ctx.params.pieceId || String(p.id) === String(ctx.params.pieceId));
    if (!piece?.fichier_prive) return ctx.notFound('Pièce jointe introuvable.');

    // Recharger le fichier privé (la populate ci-dessus ne remonte pas le buffer)
    const rec = (await strapi.documents(UID_FICHIER_PRIVE).findOne({
      documentId: piece.fichier_prive.documentId,
    })) as any;
    if (!rec) return ctx.notFound('Pièce jointe introuvable.');

    const { stream, nom_original, mime } = openPrivateFile(rec);
    ctx.response.set('Content-Type', mime);
    ctx.response.set('Content-Disposition', `attachment; filename="${encodeURIComponent(nom_original)}"`);
    ctx.body = stream;
  },
}));
