/**
 * Contrôleur du module d'auth compat — URLs legacy `/api/v1/auth/*`.
 *
 * Portage de backend/src/controllers/auth.controller.js sur Users & Permissions.
 * Les réponses conservent la forme legacy :
 *   - login  → { access, refresh, redirect_url }  (access = JWT court terme)
 *   - refresh → { access }
 *   - users/me → profil plat legacy (is_staff/is_superuser dérivés du rôle)
 *
 * Délégation interne au plugin U&P (mêmes services que ses contrôleurs) :
 *   - getService('user').validatePassword  (bcryptjs, hash legacy compatibles)
 *   - strapi.sessionManager('users-permissions')  (mode jwtManagement: 'refresh')
 */
import { ApplicationError, UnauthorizedError, ValidationError } from '../../../utils/errors';
import { legacyUserProfile, resolveUserFromCtx } from '../utils/legacy';

const UP_USER_UID = 'plugin::users-permissions.user';

/** Génère la paire access + refresh pour un usager (mode refresh). */
const issueTokenPair = async (userId: number | string) => {
  const sessionManager = strapi.sessionManager('users-permissions');
  const refresh = await sessionManager.generateRefreshToken(String(userId), undefined, {
    type: 'refresh',
  });
  const access = await sessionManager.generateAccessToken(refresh.token);
  if ('error' in access) {
    throw new ApplicationError('Échec de génération du token.');
  }
  return { access: access.token, refresh: refresh.token };
};

export default {
  // ─── POST /api/v1/auth/jwt/create — login ───────────────────────────────────
  async login(ctx: any) {
    try {
      const { email, password } = ctx.request.body || {};
      if (!email || !password) {
        throw new ValidationError('Email et mot de passe requis.');
      }

      const user = await strapi.db.query(UP_USER_UID).findOne({
        where: { email: String(email).toLowerCase() },
        populate: ['role'],
      });
      if (!user) throw new UnauthorizedError('Identifiants incorrects.');
      if (user.blocked) throw new UnauthorizedError('Compte désactivé.');

      const userService = strapi.plugin('users-permissions').service('user');
      const passwordOk = await userService.validatePassword(password, user.password);
      if (!passwordOk) throw new UnauthorizedError('Identifiants incorrects.');

      const tokens = await issueTokenPair(user.id);
      ctx.body = { ...tokens, redirect_url: '/dashboard' };
    } catch (err: any) {
      if (err instanceof UnauthorizedError || err instanceof ValidationError || err instanceof ApplicationError) {
        ctx.status = (err as any).status ?? 401;
        ctx.body = { detail: err.message };
        return;
      }
      console.error('[auth-compat] login error:', err.message);
      ctx.status = 500;
      ctx.body = { detail: 'Erreur serveur.' };
    }
  },

  // ─── POST /api/v1/auth/jwt/refresh — rafraîchir l'access token ──────────────
  async refresh(ctx: any) {
    try {
      const body = ctx.request.body || {};
      const upSessions: any = strapi.config.get('plugin::users-permissions.sessions' as any);
      const cookieName = upSessions?.cookie?.name || 'strapi_up_refresh';
      // Le front envoie « refresh » (forme legacy) ; U&P natif lit
      // « refreshToken ». Le cookie httpOnly sert de repli.
      const refreshToken =
        body.refresh ||
        body.refreshToken ||
        (typeof ctx.cookies?.get === 'function' ? ctx.cookies.get(cookieName) : undefined);
      if (!refreshToken) throw new UnauthorizedError('Refresh token manquant.');

      const sessionManager = strapi.sessionManager('users-permissions');
      const rotation = await sessionManager.rotateRefreshToken(refreshToken);
      if ('error' in rotation) throw new UnauthorizedError('Refresh token invalide ou expiré.');

      const access = await sessionManager.generateAccessToken(rotation.token);
      if ('error' in access) throw new UnauthorizedError('Refresh token invalide ou expiré.');

      // Rejoue le cookie httpOnly s'il est configuré (sessions.httpOnly: true)
      if (upSessions?.httpOnly) {
        ctx.cookies.set(cookieName, rotation.token, {
          httpOnly: true,
          sameSite: upSessions.cookie?.sameSite ?? 'lax',
          path: upSessions.cookie?.path ?? '/',
          overwrite: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: upSessions.cookie?.maxAge,
        });
      }

      // Le refresh token pivoté est renvoyé pour que le client puisse le
      // conserver (sinon le prochain refresh part sur un token déjà consommé).
      ctx.body = { access: access.token, refresh: rotation.token, refreshToken: rotation.token };
    } catch (err: any) {
      if (err instanceof UnauthorizedError || err instanceof ValidationError) {
        ctx.status = (err as any).status ?? 401;
        ctx.body = { detail: err.message };
        return;
      }
      console.error('[auth-compat] refresh error:', err.message);
      ctx.status = 500;
      ctx.body = { detail: 'Erreur serveur.' };
    }
  },

  // ─── POST /api/v1/auth/logout — révoquer la session (best effort) ───────────
  // Strapi U&P (jwtManagement: 'refresh') : la session est identifiée par le
  // refresh token (cookie httpOnly `strapi_up_refresh` ou body), sinon par le
  // Bearer access token. Le front vide de toute façon son localStorage ; cet
  // endpoint ne doit jamais le bloquer → toute erreur est avalée.
  async logout(ctx: any) {
    try {
      const sessionManager = strapi.sessionManager('users-permissions');
      const upSessions: any = strapi.config.get('plugin::users-permissions.sessions' as any);
      const cookieName = upSessions?.cookie?.name || 'strapi_up_refresh';
      const body = ctx.request.body || {};

      const refreshToken =
        ctx.cookies?.get?.(cookieName) ||
        (typeof body.refreshToken === 'string' ? body.refreshToken : undefined) ||
        (typeof body.refresh === 'string' ? body.refresh : undefined);

      if (refreshToken) {
        const validation = await sessionManager.validateRefreshToken(refreshToken);
        if (validation?.isValid && validation.userId && validation.sessionId) {
          await sessionManager.revokeSessionById(String(validation.userId), validation.sessionId);
        }
      } else {
        // Pas de refresh exploitable : on retombe sur le Bearer pour retrouver
        // l'usager et invalider toutes ses sessions.
        const user = await resolveUserFromCtx(ctx);
        if (user?.id) await sessionManager.invalidateRefreshToken(String(user.id));
      }

      // Purge le cookie httpOnly s'il est posé (GET/POST suivants anonymes)
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
    } catch (err: any) {
      console.warn('[auth-compat] logout error:', err.message);
    }
    // Toujours 200 : la déconnexion locale est déjà effectuée côté front.
    ctx.body = { detail: 'Déconnexion réussie.' };
  },

  // ─── GET /api/v1/auth/users/me — profil courant (legacy shape) ──────────────
  async me(ctx: any) {
    try {
      const user = await resolveUserFromCtx(ctx);
      if (!user) throw new UnauthorizedError('Token invalide ou expiré.');
      ctx.body = legacyUserProfile(user);
    } catch (err: any) {
      if (err instanceof UnauthorizedError) {
        ctx.status = 401;
        ctx.body = { detail: err.message };
        return;
      }
      console.error('[auth-compat] me error:', err.message);
      ctx.status = 500;
      ctx.body = { detail: 'Erreur serveur.' };
    }
  },

  // ─── POST /api/v1/auth/users — inscription (compte inactif + email) ─────────
  async register(ctx: any) {
    try {
      const { nom, prenom, email, password, re_password } = ctx.request.body || {};
      if (!nom || !prenom || !email || !password) {
        throw new ValidationError('Tous les champs sont obligatoires.');
      }
      if (password !== re_password) {
        ctx.status = 400;
        ctx.body = { password: ['Les mots de passe ne correspondent pas.'] };
        return;
      }
      if (String(password).length < 8) {
        ctx.status = 400;
        ctx.body = { password: ['Le mot de passe doit contenir au moins 8 caractères.'] };
        return;
      }

      const normalizedEmail = String(email).toLowerCase();
      const existing = await strapi.db.query(UP_USER_UID).count({ where: { email: normalizedEmail } });
      if (existing > 0) {
        ctx.status = 400;
        ctx.body = { email: ['Un utilisateur avec cet email existe déjà.'] };
        return;
      }

      const role = await strapi.db.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' },
      });
      if (!role) throw new ApplicationError('Rôle Authenticated introuvable.');

      // Création via db.query (comme migrate-users) puis set password via le
      // service user.add (le Document Service hash le password lui-même).
      const userService = strapi.plugin('users-permissions').service('user');
      const created = await userService.add({
        username: normalizedEmail,
        email: normalizedEmail,
        provider: 'local',
        password,
        confirmed: false, // le compte s'active via le lien email
        blocked: false,
        role: role.id,
        nom,
        prenom,
      });

      // Email d'activation (gabarits legacy fr/en/mg, fire-and-forget)
      const { sendActivationEmail } = await import('../../../utils/mailer');
      const token = strapi.plugin('users-permissions').service('jwt').issue({
        id: created.id,
        email: normalizedEmail,
      });
      await sendActivationEmail(normalizedEmail, String(created.id), token, 'fr').catch(
        (err: any) => console.warn("Email d'activation non envoyé:", err.message)
      );

      ctx.status = 201;
      ctx.body = {
        id: created.id,
        nom,
        prenom,
        email: normalizedEmail,
        is_active: false,
        langue_preferee: 'fr',
      };
    } catch (err: any) {
      if (err instanceof ValidationError || err instanceof ApplicationError) {
        ctx.status = 400;
        ctx.body = { detail: err.message };
        return;
      }
      console.error('[auth-compat] register error:', err.message);
      ctx.status = 500;
      ctx.body = { detail: 'Erreur serveur.' };
    }
  },

  // ─── POST /api/v1/auth/users/activation — activer le compte ─────────────────
  async activate(ctx: any) {
    try {
      const { token } = ctx.request.body || {};
      if (!token) throw new ValidationError('Token manquant.');

      const payload: any = await new Promise((resolve, reject) => {
        strapi
          .plugin('users-permissions')
          .service('jwt')
          .verify(token)
          .then(resolve)
          .catch(reject);
      });
      const userId = Number(payload?.id);
      if (!userId) throw new ValidationError("Token d'activation invalide.");

      const user = await strapi.db.query(UP_USER_UID).findOne({ where: { id: userId } });
      if (!user) {
        ctx.status = 400;
        ctx.body = { detail: 'Utilisateur non trouvé.' };
        return;
      }

      await strapi.db.query(UP_USER_UID).update({ where: { id: userId }, data: { confirmed: true } });
      ctx.body = { detail: 'Compte activé avec succès.' };
    } catch (err: any) {
      ctx.status = 400;
      ctx.body = { detail: "Token d'activation invalide ou expiré." };
    }
  },

  // ─── POST /api/v1/auth/users/reset_password — demande de réinitialisation ───
  async resetPassword(ctx: any) {
    try {
      const { email } = ctx.request.body || {};
      if (!email) throw new ValidationError('Email requis.');

      const user = await strapi.db
        .query(UP_USER_UID)
        .findOne({ where: { email: String(email).toLowerCase() } });
      if (!user) {
        // Ne révèle pas l'existence du compte
        ctx.body = { detail: 'Email de réinitialisation envoyé si le compte existe.' };
        return;
      }

      const token = strapi.plugin('users-permissions').service('jwt').issue({
        id: user.id,
        email: user.email,
      });
      const siteUrl =
        process.env.FRONTEND_URL || process.env.SITE_URL || process.env.DOMAIN || 'http://localhost:5173';
      const resetUrl = `${siteUrl}/password/reset/confirm/${Buffer.from(String(user.id)).toString('base64')}/${token}`;

      const { sendResetPasswordEmail } = await import('../../../utils/mailer');
      await sendResetPasswordEmail(user.email, resetUrl, user.langue_preferee || 'fr').catch(
        (err: any) => console.warn('Erreur envoi email reset password:', err.message)
      );

      ctx.body = { detail: 'Email de réinitialisation envoyé avec succès.' };
    } catch (err: any) {
      if (err instanceof ValidationError) {
        ctx.status = 400;
        ctx.body = { detail: err.message };
        return;
      }
      console.error('[auth-compat] resetPassword error:', err.message);
      ctx.status = 500;
      ctx.body = { detail: 'Erreur serveur.' };
    }
  },

  // ─── POST /api/v1/auth/users/reset_password_confirm — nouveau mot de passe ──
  async resetPasswordConfirm(ctx: any) {
    try {
      const { token, new_password, re_new_password } = ctx.request.body || {};
      if (!new_password || new_password !== re_new_password) {
        throw new ValidationError('Les mots de passe ne correspondent pas.');
      }
      if (!token) throw new ValidationError('Token manquant.');

      const payload: any = await strapi.plugin('users-permissions').service('jwt').verify(token);
      const userId = Number(payload?.id);
      if (!userId) throw new ValidationError('Lien invalide ou expiré.');

      const userService = strapi.plugin('users-permissions').service('user');
      await userService.edit(userId, { password: new_password });

      ctx.body = { detail: 'Mot de passe réinitialisé avec succès.' };
    } catch (err: any) {
      ctx.status = 400;
      ctx.body = { detail: 'Lien invalide ou expiré.' };
    }
  },
};
