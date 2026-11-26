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

/*
 * Limitation des tentatives de connexion (5 échecs / 15 min / adresse IP).
 *
 * Compteur en mémoire, mono-instance — même approche que
 * `chatbot.isRateLimited` (api/faq/services/chatbot.ts). Suffisant pour une
 * seule instance Strapi ; en cas de plusieurs instances, chaque instance
 * compte séparément (protection dégradée, jamais absente).
 *
 * Le message renvoyé est TOUJOURS générique (429) : il ne révèle ni l'existence
 * du compte, ni le nombre exact de tentatives restantes, et ne journalise
 * jamais l'e-mail saisi.
 */
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map<string, number[]>();

const loginKey = (ctx: any): string => String(ctx?.request?.ip ?? ctx?.ip ?? 'inconnu');

const recentFailures = (key: string, now = Date.now()): number[] =>
  (loginFailures.get(key) || []).filter((t) => now - t < LOGIN_WINDOW_MS);

const isLoginRateLimited = (key: string): boolean =>
  recentFailures(key).length >= LOGIN_MAX_FAILURES;

const recordLoginFailure = (key: string): void => {
  const now = Date.now();
  const kept = recentFailures(key, now);
  kept.push(now);
  loginFailures.set(key, kept);
  // Garde-fou mémoire : purge des entrées dont la fenêtre est expirée.
  if (loginFailures.size > 5000) {
    for (const [entryKey] of loginFailures) {
      if (recentFailures(entryKey, now).length === 0) loginFailures.delete(entryKey);
    }
  }
};

const clearLoginFailures = (key: string): void => {
  loginFailures.delete(key);
};

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
    const rateLimitKey = loginKey(ctx);
    if (isLoginRateLimited(rateLimitKey)) {
      ctx.status = 429;
      ctx.body = { detail: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' };
      return;
    }

    try {
      const { email, password } = ctx.request.body || {};
      if (!email || !password) {
        throw new ValidationError('Email et mot de passe requis.');
      }

      // Même normalisation qu'à l'inscription : un espace avant/après l'adresse
      // (copier-coller) ne doit pas produire un faux « identifiants incorrects ».
      const user = await strapi.db.query(UP_USER_UID).findOne({
        where: { email: String(email).trim().toLowerCase() },
        populate: ['role'],
      });
      if (!user) throw new UnauthorizedError('Identifiants incorrects.');
      if (user.blocked) throw new UnauthorizedError('Compte désactivé.');
      if (user.confirmed === false) {
        throw new UnauthorizedError('Compte non activé. Veuillez vérifier vos e-mails pour activer votre compte.');
      }
      // Statut de la demande de compte : un compte « en_attente » ne peut pas se
      // connecter avant confirmation par un super-administrateur, un compte
      // « rejete » est définitivement refusé. Les comptes antérieurs à l'ajout du
      // champ (statut NULL) restent autorisés.
      if (user.statut_compte === 'en_attente') {
        throw new UnauthorizedError(
          'Votre compte est en attente de confirmation par un super-administrateur.'
        );
      }
      if (user.statut_compte === 'rejete') {
        throw new UnauthorizedError('Votre demande de création de compte a été rejetée.');
      }

      const userService = strapi.plugin('users-permissions').service('user');
      const passwordOk = await userService.validatePassword(password, user.password);
      if (!passwordOk) throw new UnauthorizedError('Identifiants incorrects.');

      const tokens = await issueTokenPair(user.id);
      clearLoginFailures(rateLimitKey);

      // Mot de passe provisoire (compte créé par un super-administrateur ou par
      // le script create-super-admin) : le front redirige vers le profil, et
      // les endpoints d'administration répondent 403 tant qu'il n'est pas changé.
      const mustChangePassword = user.doit_changer_mot_de_passe === true;
      ctx.body = {
        ...tokens,
        redirect_url: mustChangePassword ? '/portail-gestion/profil' : '/dashboard',
        doit_changer_mot_de_passe: mustChangePassword,
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedError || err instanceof ValidationError || err instanceof ApplicationError) {
        if (err instanceof UnauthorizedError) recordLoginFailure(rateLimitKey);
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

  // ─── POST /api/v1/auth/users — demande de création de compte ────────────────
  // Reçoit nom, prénom, e-mail et mot de passe. Le compte est créé au statut
  // « en_attente » : il ne peut pas se connecter tant qu'un super-administrateur
  // ne l'a pas confirmé (e-mail de confirmation envoyé à ce moment-là).
  async register(ctx: any) {
    const invalide = (field: string, message: string) => {
      ctx.status = 400;
      ctx.body = { detail: message, [field]: [message] };
    };

    try {
      const body = ctx.request.body || {};
      const email = String(body.email ?? '').trim().toLowerCase();
      const nom = String(body.nom ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
      const prenom = String(body.prenom ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
      const password = String(body.password ?? '');

      if (!prenom) return invalide('prenom', 'Le prénom est requis.');
      if (!nom) return invalide('nom', 'Le nom est requis.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return invalide('email', 'Adresse e-mail invalide.');
      }
      if (password.length < 6) {
        return invalide('password', 'Le mot de passe doit contenir au moins 6 caractères.');
      }

      const existing = await strapi.db.query(UP_USER_UID).count({ where: { email } });
      if (existing > 0) {
        return invalide('email', 'Un compte avec cette adresse e-mail existe déjà.');
      }

      // Seuls les administrateurs possèdent un compte : la demande est rattachée
      // au rôle « Administrateur », puis validée (ou rejetée) par un
      // super-administrateur depuis la gestion des comptes.
      const role = await strapi.db
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: 'administrateur' } });
      if (!role) {
        console.error('[auth-compat] register error: rôle « administrateur » introuvable');
        ctx.status = 500;
        ctx.body = { detail: 'Erreur serveur.' };
        return;
      }

      const userService = strapi.plugin('users-permissions').service('user');
      const created = await userService.add({
        username: email,
        email,
        provider: 'local',
        password,
        // Pas de flux d'activation par lien : le compte reste bloqué par
        // statut_compte tant qu'un super-administrateur ne l'a pas confirmé.
        confirmed: true,
        blocked: false,
        role: role.id,
        nom,
        prenom,
        langue_preferee: 'fr',
      });

      // `user.add` applique le défaut du schéma (« en_attente ») : on le fixe
      // explicitement pour que le statut soit toujours celui attendu.
      await strapi.db.query(UP_USER_UID).update({
        where: { id: created.id },
        data: { statut_compte: 'en_attente' },
      });

      // Journal sans donnée personnelle : ni e-mail ni mot de passe.
      console.log(`[auth-compat] Demande de compte enregistrée (#${created.id})`);

      ctx.status = 201;
      ctx.body = {
        detail:
          'Votre demande a été envoyée. Elle doit être confirmée par un super-administrateur.',
      };
    } catch (err: any) {
      console.error('[auth-compat] register error:', err.message);
      ctx.status = 500;
      ctx.body = { detail: 'Erreur serveur.' };
    }
  },

  // ─── POST /api/v1/auth/users/activation — activer le compte ─────────────────
  async activate(ctx: any) {
    try {
      const { uid, token } = ctx.request.body || {};
      if (!token && !uid) throw new ValidationError('Token manquant.');

      let userId: number | null = null;
      if (token) {
        try {
          const payload: any = await strapi
            .plugin('users-permissions')
            .service('jwt')
            .verify(token);
          userId = Number(payload?.id);
        } catch {
          // Token expiré ou non JWT
        }
      }

      if (!userId && uid) {
        const decoded = isNaN(Number(uid)) ? Buffer.from(uid, 'base64').toString('ascii') : uid;
        if (Number(decoded)) {
          userId = Number(decoded);
        }
      }

      if (!userId) throw new ValidationError("Token d'activation invalide ou expiré.");

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
