import crypto from 'crypto';
import { isSuperAdminUser, loadUpUser } from '../../../utils/roles';
import { maskEmail, sendTemplatedMail, SITE_URL } from '../../../utils/mailer';

/**
 * Gestion des comptes administrateurs (/api/v1/admin-accounts).
 *
 * Réservé au rôle « Super-administrateur ». Contrôles faits ICI, côté serveur :
 *   - seul un super-administrateur liste / crée / désactive / supprime / change
 *     un rôle (les routes exigent en plus un jeton valide) ;
 *   - un compte ne peut ni se désactiver, ni se supprimer, ni changer son rôle ;
 *   - le dernier super-administrateur actif est protégé (désactivation,
 *     suppression et rétrogradation refusées) ;
 *   - seules les images publiques du compte sont renvoyées : jamais de mot de
 *     passe, de hachage, de jeton de session ou de jeton de réinitialisation ;
 *   - les journaux serveur n'affichent qu'une adresse MASQUÉE, jamais un
 *     mot de passe ;
 *   - la suppression est refusée si des contenus (ou des données liées) sont
 *     rattachés au compte : il faut alors le désactiver.
 */

const UP_USER_UID = 'plugin::users-permissions.user';
const ROLE_UID = 'plugin::users-permissions.role';
const DOC_UID = 'api::document.document';
const HISTORY_UID = 'api::historique-recherche.historique-recherche';

const ROLE_TYPES = ['administrateur', 'super_admin'] as const;
type RoleType = (typeof ROLE_TYPES)[number];

const ROLE_LABELS: Record<RoleType, string> = {
  administrateur: 'Administrateur',
  super_admin: 'Super-administrateur',
};

const respondError = (ctx: any, status: number, name: string, message: string) => {
  ctx.status = status;
  ctx.body = { data: null, error: { status, name, message } };
};

const isRoleType = (value: unknown): value is RoleType =>
  typeof value === 'string' && (ROLE_TYPES as readonly string[]).includes(value);

/** 401 / 403 puis le super-administrateur demandeur, ou null. */
const requireSuperAdmin = async (ctx: any): Promise<any | null> => {
  if (!ctx?.state?.user?.id) {
    respondError(ctx, 401, 'UnauthorizedError', 'Authentification requise.');
    return null;
  }
  const requester = await loadUpUser(ctx.state.user.id);
  if (!requester) {
    respondError(ctx, 401, 'UnauthorizedError', 'Authentification requise.');
    return null;
  }
  if (requester.doit_changer_mot_de_passe === true) {
    respondError(
      ctx,
      403,
      'ForbiddenError',
      "Changez d'abord votre mot de passe provisoire depuis votre profil."
    );
    return null;
  }
  if (!isSuperAdminUser(requester)) {
    respondError(ctx, 403, 'ForbiddenError', 'Accès réservé aux super-administrateurs.');
    return null;
  }
  return requester;
};

/** Projection publique : aucun champ sensible. */
const toAccount = (user: any) => {
  const role = user?.role;
  // Les comptes antérieurs à l'ajout du champ n'ont pas de statut : ils restent
  // considérés comme actifs.
  const statutCompte: string = user.statut_compte ?? 'actif';
  return {
    id: user.id,
    nom: user.nom ?? '',
    prenom: user.prenom ?? '',
    email: user.email,
    role: typeof role === 'object' && role !== null ? role.name ?? null : null,
    role_type: typeof role === 'object' && role !== null ? role.type ?? null : null,
    is_superadmin: isSuperAdminUser(user),
    // Une demande « en_attente » ou « rejete » n'est jamais active, même si le
    // compte est confirmé et non bloqué (champs U&P indépendants du statut).
    is_active: statutCompte === 'actif' && user.confirmed !== false && user.blocked !== true,
    statut_compte: statutCompte,
    blocked: user.blocked === true,
    doit_changer_mot_de_passe: user.doit_changer_mot_de_passe === true,
    date_joined: user.createdAt ?? null,
  };
};

const isAdminAccount = (user: any): boolean =>
  isSuperAdminUser(user) ||
  (typeof user?.role === 'object' &&
    user?.role !== null &&
    String(user.role.type ?? user.role.name ?? '').toLowerCase() === 'administrateur');

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const cleanText = (value: unknown, max = 100): string =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ─── Mot de passe provisoire (16 caractères, lettres + chiffres) ────────────
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALL = LETTERS + DIGITS;

const randomChar = (set: string): string => set[crypto.randomInt(0, set.length)];

const generateTemporaryPassword = (length = 16): string => {
  const chars = [randomChar(LETTERS), randomChar(DIGITS)];
  while (chars.length < length) chars.push(randomChar(ALL));
  // Mélange de Fisher-Yates : l'emplacement des caractères garantis est masqué.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/** Nombre de super-administrateurs ACTIFS (confirmés et non bloqués). */
const activeSuperAdminCount = async (): Promise<number> => {
  const users = (await strapi.db.query(UP_USER_UID).findMany({
    where: { role: { type: 'super_admin' } },
    populate: ['role'],
  })) as any[];
  return users.filter((u) => u.confirmed !== false && u.blocked !== true).length;
};

/** Comptes liés à des contenus / données d'usage (bloque la suppression). */
const linkedRecordsCount = async (userId: number): Promise<number> => {
  const query = strapi.db.query(DOC_UID);
  const [modifies, verifies] = await Promise.all([
    query.count({ where: { last_modified_by: { id: userId } } }),
    query.count({ where: { statut_verifie_par: { id: userId } } }),
  ]);
  let history = 0;
  try {
    history = await strapi.db.query(HISTORY_UID).count({ where: { user: { id: userId } } });
  } catch {
    // Content-type absent (installation minimale) : aucun lien à vérifier.
  }
  return modifies + verifies + history;
};

const ensureRole = async (type: RoleType): Promise<any | null> => {
  let role = await strapi.db.query(ROLE_UID).findOne({ where: { type } });
  if (!role) role = await strapi.db.query(ROLE_UID).findOne({ where: { name: ROLE_LABELS[type] } });
  return role ?? null;
};

export default {
  // ─── GET /api/v1/admin-accounts — liste + recherche ──────────────────────
  async list(ctx: any) {
    try {
      if (!(await requireSuperAdmin(ctx))) return;

      const search = String(ctx.query?.search ?? '').trim().slice(0, 100);
      const where: Record<string, any> = {
        role: { type: { $in: [...ROLE_TYPES] } },
      };
      if (search) {
        where.$and = [
          { role: { type: { $in: [...ROLE_TYPES] } } },
          {
            $or: [
              { nom: { $containsi: search } },
              { prenom: { $containsi: search } },
              { email: { $containsi: search } },
            ],
          },
        ];
        delete where.role;
      }

      const users = (await strapi.db.query(UP_USER_UID).findMany({
        where,
        populate: ['role'],
        orderBy: { createdAt: 'desc' },
        limit: 200,
      })) as any[];

      const comptes = users.filter(isAdminAccount).map(toAccount);
      ctx.body = {
        data: comptes,
        meta: {
          total: comptes.length,
          super_admins_actifs: comptes.filter((c) => c.is_superadmin && c.is_active).length,
        },
      };
    } catch (err: any) {
      console.error('[admin-accounts] list error:', err.message);
      respondError(ctx, 500, 'ApplicationError', 'Erreur serveur.');
    }
  },

  // ─── POST /api/v1/admin-accounts — création ──────────────────────────────
  async create(ctx: any) {
    try {
      const requester = await requireSuperAdmin(ctx);
      if (!requester) return;

      const body = ctx.request.body || {};
      const email = String(body.email ?? '').trim().toLowerCase();
      const nom = cleanText(body.nom);
      const prenom = cleanText(body.prenom);
      const roleType: RoleType = body.role_type === 'super_admin' ? 'super_admin' : 'administrateur';

      if (!isValidEmail(email)) {
        ctx.status = 400;
        ctx.body = { detail: 'Adresse e-mail invalide.', email: ['Adresse e-mail invalide.'] };
        return;
      }
      if (!nom) {
        ctx.status = 400;
        ctx.body = { detail: 'Le nom est requis.', nom: ['Le nom est requis.'] };
        return;
      }
      if (body.role_type !== undefined && !isRoleType(body.role_type)) {
        ctx.status = 400;
        ctx.body = { detail: 'Rôle invalide.' };
        return;
      }

      const existing = await strapi.db.query(UP_USER_UID).count({ where: { email } });
      if (existing > 0) {
        ctx.status = 400;
        ctx.body = {
          detail: 'Un compte avec cette adresse e-mail existe déjà.',
          email: ['Un compte avec cette adresse e-mail existe déjà.'],
        };
        return;
      }

      const role = await ensureRole(roleType);
      if (!role) {
        respondError(
          ctx,
          500,
          'ApplicationError',
          `Rôle « ${ROLE_LABELS[roleType]} » introuvable. Exécutez d'abord scripts/create-super-admin.ts.`
        );
        return;
      }

      const temporaryPassword = generateTemporaryPassword();
      const userService = strapi.plugin('users-permissions').service('user');
      const created = await userService.add({
        username: email,
        email,
        provider: 'local',
        password: temporaryPassword,
        confirmed: true,
        blocked: false,
        role: role.id,
        nom,
        prenom,
        langue_preferee: 'fr',
        doit_changer_mot_de_passe: true,
      });

      // Le service `user.add` du plugin applique le défaut du schéma
      // (« en_attente ») et ignore ce champ : on le fixe explicitement. Le
      // compte créé par un super-administrateur est actif immédiatement.
      await strapi.db.query(UP_USER_UID).update({
        where: { id: created.id },
        data: { statut_compte: 'actif' },
      });

      const full = await loadUpUser(created.id);
      // Journal : adresse masquée, jamais le mot de passe.
      console.log(
        `[admin-accounts] Compte ${ROLE_LABELS[roleType]} créé : ${maskEmail(email)} (par #${requester.id})`
      );

      ctx.status = 201;
      ctx.body = {
        compte: toAccount(full),
        temporary_password: temporaryPassword,
        detail:
          'Compte créé. Le mot de passe provisoire est affiché une seule fois : transmettez-le à son titulaire par un canal sûr.',
      };
    } catch (err: any) {
      console.error('[admin-accounts] create error:', err.message);
      respondError(ctx, 500, 'ApplicationError', 'Erreur serveur.');
    }
  },

  // ─── PATCH /api/v1/admin-accounts/:id/status — désactiver / réactiver ────
  async updateStatus(ctx: any) {
    try {
      const requester = await requireSuperAdmin(ctx);
      if (!requester) return;

      const id = Number(ctx.params?.id);
      if (!Number.isInteger(id) || id <= 0) {
        respondError(ctx, 400, 'ValidationError', 'Identifiant invalide.');
        return;
      }
      const target = await loadUpUser(id);
      if (!target || !isAdminAccount(target)) {
        respondError(ctx, 404, 'NotFoundError', 'Compte administrateur introuvable.');
        return;
      }

      const blocked = ctx.request.body?.blocked;
      const nouveauStatut = ctx.request.body?.statut_compte;
      const statutValides = ['en_attente', 'actif', 'rejete'];
      let emailEnvoye = false;

      if (nouveauStatut && !statutValides.includes(nouveauStatut)) {
        respondError(ctx, 400, 'ValidationError', 'Statut invalide (en_attente | actif | rejete).');
        return;
      }

      if (nouveauStatut && id === requester.id) {
        respondError(ctx, 400, 'ValidationError', 'Vous ne pouvez pas modifier le statut de votre propre compte.');
        return;
      }

      const updateData: any = {};
      if (typeof blocked !== 'boolean' && typeof blocked !== 'undefined') {
        respondError(ctx, 400, 'ValidationError', 'Le champ « blocked » (booléen) est requis.');
        return;
      }
      if (typeof blocked !== 'undefined') {
        updateData.blocked = blocked;
      }
      if (nouveauStatut) {
        updateData.statut_compte = nouveauStatut;
      }

      if (blocked === false && nouveauStatut === 'actif') {
        // Confirmation du compte : envoyer email de confirmation
        try {
          await sendTemplatedMail(target.email, target.langue_preferee || 'fr', 'account-confirmation', {
            confirmUrl: `${SITE_URL}/portail-gestion/connexion`,
            prenom: target.prenom || '',
            nom: target.nom || '',
            siteUrl: SITE_URL
          });
          emailEnvoye = true;
          console.log(`[admin-accounts] Email de confirmation envoyé à ${maskEmail(target.email)}`);
        } catch (err) {
          console.error('[admin-accounts] Erreur envoi email confirmation:', (err as Error).message);
        }
      }

      if (nouveauStatut === 'rejete') {
        // Réjection du compte : envoyer email de rejet
        try {
          await sendTemplatedMail(target.email, target.langue_preferee || 'fr', 'account-rejection', {
            prenom: target.prenom || '',
            nom: target.nom || '',
            siteUrl: SITE_URL
          });
          emailEnvoye = true;
          console.log(`[admin-accounts] Email de rejet envoyé à ${maskEmail(target.email)}`);
        } catch (err) {
          console.error('[admin-accounts] Erreur envoi email rejet:', (err as Error).message);
        }
      }

      await strapi.db.query(UP_USER_UID).update({ where: { id }, data: updateData });
      const updated = await loadUpUser(id);
      console.log(
        `[admin-accounts] Compte mis à jour : ${maskEmail(target.email)}, statut=${nouveauStatut || blocked !== undefined ? (blocked ? 'désactivé' : 'activé') : nouveauStatut || 'non modifié'} (par #${requester.id})`
      );
      const detailParts: string[] = [];
      // N'annonce un changement d'état que s'il y en a réellement un (une
      // confirmation envoie `blocked: false` sur un compte déjà débloqué).
      if (blocked !== undefined && target.blocked !== blocked) {
        detailParts.push(blocked ? 'Compte désactivé.' : 'Compte réactivé.');
      }
      if (nouveauStatut === 'actif') detailParts.push('Compte confirmé.');
      if (nouveauStatut === 'rejete') detailParts.push('Demande de compte rejetée.');
      ctx.body = {
        compte: toAccount(updated),
        detail: detailParts.join(' ') +
          (emailEnvoye ? ' Email de notification envoyé.' : '')
      };
    } catch (err: any) {
      console.error('[admin-accounts] updateStatus error:', err.message);
      respondError(ctx, 500, 'ApplicationError', 'Erreur serveur.');
    }
  },

 // ─── PATCH /api/v1/admin-accounts/:id/role — changer le rôle ─────────────
  // Non exposé dans l'interface (rôle en lecture seule) : endpoint conservé
  // pour une évolution explicite, avec toutes les gardes serveur.
  async updateRole(ctx: any) {
    try {
      const requester = await requireSuperAdmin(ctx);
      if (!requester) return;

      const id = Number(ctx.params?.id);
      if (!Number.isInteger(id) || id <= 0) {
        respondError(ctx, 400, 'ValidationError', 'Identifiant invalide.');
        return;
      }
      const target = await loadUpUser(id);
      if (!target || !isAdminAccount(target)) {
        respondError(ctx, 404, 'NotFoundError', 'Compte administrateur introuvable.');
        return;
      }

      const roleType = ctx.request.body?.role_type;
      if (!isRoleType(roleType)) {
        respondError(ctx, 400, 'ValidationError', 'Rôle invalide (administrateur | super_admin).');
        return;
      }
      if (id === requester.id) {
        respondError(ctx, 400, 'ValidationError', 'Vous ne pouvez pas modifier votre propre rôle.');
        return;
      }
      if (
        roleType !== 'super_admin' &&
        isSuperAdminUser(target) &&
        (await activeSuperAdminCount()) <= 1
      ) {
        respondError(
          ctx,
          400,
          'ValidationError',
          'Le dernier super-administrateur actif ne peut pas être rétrogradé.'
        );
        return;
      }

      const role = await ensureRole(roleType);
      if (!role) {
        respondError(ctx, 500, 'ApplicationError', `Rôle « ${ROLE_LABELS[roleType]} » introuvable.`);
        return;
      }

      await strapi.db.query(UP_USER_UID).update({ where: { id }, data: { role: role.id } });
      const updated = await loadUpUser(id);
      console.log(
        `[admin-accounts] Rôle ${ROLE_LABELS[roleType]} attribué : ${maskEmail(target.email)} (par #${requester.id})`
      );
      ctx.body = { compte: toAccount(updated), detail: 'Rôle mis à jour.' };
    } catch (err: any) {
      console.error('[admin-accounts] updateRole error:', err.message);
      respondError(ctx, 500, 'ApplicationError', 'Erreur serveur.');
    }
  },

  // ─── DELETE /api/v1/admin-accounts/:id — suppression définitive ─────────
  async remove(ctx: any) {
    try {
      const requester = await requireSuperAdmin(ctx);
      if (!requester) return;

      const id = Number(ctx.params?.id);
      if (!Number.isInteger(id) || id <= 0) {
        respondError(ctx, 400, 'ValidationError', 'Identifiant invalide.');
        return;
      }
      const target = await loadUpUser(id);
      if (!target || !isAdminAccount(target)) {
        respondError(ctx, 404, 'NotFoundError', 'Compte administrateur introuvable.');
        return;
      }
      if (id === requester.id) {
        respondError(ctx, 400, 'ValidationError', 'Vous ne pouvez pas supprimer votre propre compte.');
        return;
      }
      if (isSuperAdminUser(target) && (await activeSuperAdminCount()) <= 1) {
        respondError(
          ctx,
          400,
          'ValidationError',
          'Le dernier super-administrateur actif ne peut pas être supprimé.'
        );
        return;
      }

      const linked = await linkedRecordsCount(id);
      if (linked > 0) {
        respondError(
          ctx,
          409,
          'ApplicationError',
          `Ce compte est rattaché à ${linked} contenu(s) ou donnée(s) d'usage. Désactivez-le plutôt que de le supprimer.`
        );
        return;
      }

      try {
        await strapi.db.query(UP_USER_UID).delete({ where: { id } });
      } catch {
        respondError(
          ctx,
          409,
          'ApplicationError',
          'Suppression impossible : des données sont encore rattachées à ce compte. Désactivez-le.'
        );
        return;
      }

      console.log(
        `[admin-accounts] Compte supprimé : ${maskEmail(target.email)} (par #${requester.id})`
      );
      ctx.body = { detail: 'Compte supprimé définitivement.' };
    } catch (err: any) {
      console.error('[admin-accounts] remove error:', err.message);
      respondError(ctx, 500, 'ApplicationError', 'Erreur serveur.');
    }
  },
};
