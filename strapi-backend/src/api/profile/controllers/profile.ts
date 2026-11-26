import { isSuperAdminUser } from '../../../utils/roles';

/**
 * Profil de l'usager connecté (/api/v1/profile).
 *
 * - GET   : profil courant (identité prise UNIQUEMENT dans le jeton, jamais
 *           dans le corps ou un paramètre d'URL) ;
 * - PATCH : nom, prénom, e-mail (unicité contrôlée), langue préférée ;
 *           le rôle n'est JAMAIS modifiable ici ;
 * - POST  /password : mot de passe actuel + nouveau + confirmation.
 *
 * Accessible même quand `doit_changer_mot_de_passe` est vrai : c'est la seule
 * zone autorisée tant que le mot de passe provisoire n'a pas été remplacé.
 * Aucune réponse ne contient de mot de passe, de hachage ou de jeton.
 */
const UP_USER_UID = 'plugin::users-permissions.user';

const loadRequester = async (ctx: any): Promise<any | null> => {
  const id = ctx?.state?.user?.id;
  if (id === undefined || id === null) return null;
  return strapi.db.query(UP_USER_UID).findOne({ where: { id }, populate: ['role'] });
};

const profileOf = (user: any) => {
  const role = user?.role;
  return {
    id: user.id,
    nom: user.nom ?? '',
    prenom: user.prenom ?? '',
    email: user.email,
    role: typeof role === 'object' && role !== null ? role.name ?? null : null,
    role_type: typeof role === 'object' && role !== null ? role.type ?? null : null,
    is_superadmin: isSuperAdminUser(user),
    doit_changer_mot_de_passe: user.doit_changer_mot_de_passe === true,
    langue_preferee: user.langue_preferee ?? 'fr',
    date_joined: user.createdAt ?? null,
  };
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Nettoie un texte libre (nom/prénom) : chaîne bornée, sans espaces superflus. */
const cleanText = (value: unknown, max = 100): string =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const unauthorized = (ctx: any) => {
  ctx.status = 401;
  ctx.body = { detail: 'Authentification requise.' };
};

export default {
  // ─── GET /api/v1/profile ────────────────────────────────────────────────────
  async get(ctx: any) {
    try {
      const user = await loadRequester(ctx);
      if (!user) return unauthorized(ctx);
      ctx.body = profileOf(user);
    } catch (err: any) {
      console.error('[profile] get error:', err.message);
      ctx.status = 500;
      ctx.body = { detail: 'Erreur serveur.' };
    }
  },

  // ─── PATCH /api/v1/profile ──────────────────────────────────────────────────
  async update(ctx: any) {
    try {
      const user = await loadRequester(ctx);
      if (!user) return unauthorized(ctx);

      const body = ctx.request.body || {};
      const data: Record<string, any> = {};

      if (body.nom !== undefined) {
        const nom = cleanText(body.nom);
        if (!nom) {
          ctx.status = 400;
          ctx.body = { detail: 'Le nom est requis.', nom: ['Le nom est requis.'] };
          return;
        }
        data.nom = nom;
      }
      if (body.prenom !== undefined) data.prenom = cleanText(body.prenom);

      if (body.langue_preferee !== undefined) {
        const langue = String(body.langue_preferee);
        if (!['fr', 'en', 'mg'].includes(langue)) {
          ctx.status = 400;
          ctx.body = { detail: 'Langue invalide.', langue_preferee: ['Langue invalide.'] };
          return;
        }
        data.langue_preferee = langue;
      }

      if (body.email !== undefined) {
        const email = String(body.email).trim().toLowerCase();
        if (!isValidEmail(email)) {
          ctx.status = 400;
          ctx.body = { detail: 'Adresse e-mail invalide.', email: ['Adresse e-mail invalide.'] };
          return;
        }
        // Unicité (insensible à la casse) en excluant le compte courant.
        const conflict = await strapi.db.query(UP_USER_UID).count({
          where: { email, id: { $ne: user.id } },
        });
        if (conflict > 0) {
          ctx.status = 400;
          ctx.body = {
            detail: 'Cette adresse e-mail est déjà utilisée par un autre compte.',
            email: ['Cette adresse e-mail est déjà utilisée par un autre compte.'],
          };
          return;
        }
        data.email = email;
        // Le nom d'utilisateur historique suivait l'e-mail : on ne le change que
        // s'il était exactement l'ancienne adresse, pour éviter tout conflit.
        if (String(user.username || '').toLowerCase() === String(user.email || '').toLowerCase()) {
          data.username = email;
        }
      }

      if (Object.keys(data).length === 0) {
        ctx.status = 400;
        ctx.body = { detail: 'Aucun champ à mettre à jour.' };
        return;
      }

      await strapi.db.query(UP_USER_UID).update({ where: { id: user.id }, data });
      const updated = await loadRequester(ctx);
      ctx.body = { detail: 'Profil mis à jour.', profil: profileOf(updated) };
    } catch (err: any) {
      console.error('[profile] update error:', err.message);
      ctx.status = 500;
      ctx.body = { detail: 'Erreur serveur.' };
    }
  },

  // ─── POST /api/v1/profile/password ──────────────────────────────────────────
  async changePassword(ctx: any) {
    try {
      const user = await loadRequester(ctx);
      if (!user) return unauthorized(ctx);

      const { current_password, new_password, confirm_password } = ctx.request.body || {};
      if (!current_password || !new_password || !confirm_password) {
        ctx.status = 400;
        ctx.body = { detail: 'Tous les champs sont requis.' };
        return;
      }
      if (new_password !== confirm_password) {
        ctx.status = 400;
        ctx.body = { detail: 'Les deux nouveaux mots de passe ne correspondent pas.' };
        return;
      }
      if (String(new_password).length < 10) {
        ctx.status = 400;
        ctx.body = { detail: 'Le mot de passe doit contenir au moins 10 caractères.' };
        return;
      }
      if (!/[A-Za-z]/.test(new_password) || !/\d/.test(new_password)) {
        ctx.status = 400;
        ctx.body = { detail: 'Le mot de passe doit contenir au moins une lettre et un chiffre.' };
        return;
      }
      if (new_password === current_password) {
        ctx.status = 400;
        ctx.body = { detail: 'Le nouveau mot de passe doit être différent de l’ancien.' };
        return;
      }

      const userService = strapi.plugin('users-permissions').service('user');
      const passwordOk = await userService.validatePassword(current_password, user.password);
      if (!passwordOk) {
        ctx.status = 400;
        ctx.body = { detail: 'Mot de passe actuel incorrect.' };
        return;
      }

      await userService.edit(user.id, {
        password: new_password,
        doit_changer_mot_de_passe: false,
      });

      // Invalidation des sessions de rafraîchissement (toutes, y compris la
      // session courante) : le client doit se reconnecter. L'access token déjà
      // émis reste valable jusqu'à sa courte expiration — signalé au client.
      let sessionsInvalidated = false;
      try {
        await strapi.sessionManager('users-permissions').invalidateRefreshToken(String(user.id));
        sessionsInvalidated = true;
      } catch (err: any) {
        console.warn('[profile] invalidation des sessions impossible :', err.message);
      }

      // Purge du cookie httpOnly de session s'il existe.
      try {
        const upSessions: any = strapi.config.get('plugin::users-permissions.sessions' as any);
        const cookieName = upSessions?.cookie?.name || 'strapi_up_refresh';
        if (ctx.cookies?.set) {
          ctx.cookies.set(cookieName, '', {
            httpOnly: true,
            sameSite: upSessions?.cookie?.sameSite ?? 'lax',
            path: upSessions?.cookie?.path ?? '/',
            overwrite: true,
            secure: process.env.NODE_ENV === 'production',
            expires: new Date(0),
          });
        }
      } catch {
        // Cookie absent : sans effet.
      }

      ctx.body = {
        detail: 'Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.',
        relogin_required: true,
        sessions_invalidated: sessionsInvalidated,
      };
    } catch (err: any) {
      console.error('[profile] changePassword error:', err.message);
      ctx.status = 500;
      ctx.body = { detail: 'Erreur serveur.' };
    }
  },
};
