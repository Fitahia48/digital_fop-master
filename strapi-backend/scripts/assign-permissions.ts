import { compileStrapi, createStrapi } from '@strapi/strapi';

const APPLY = process.argv.includes('--apply');

const enableAction = (
  permissions: Record<string, any>,
  action: string
): void => {
  const [type, controller, actionName] = action.split('.');
  const controllerMap = permissions[type]?.controllers?.[controller];
  if (!controllerMap || !controllerMap[actionName]) {
    throw new Error(`Action inconnue: ${action}`);
  }
  controllerMap[actionName].enabled = true;
};

// ─── Public (aucune authentification) ────────────────────────────────────────
// NB : `plugin::users-permissions.auth.register` a été retiré — l'inscription
// publique est coupée (voir IMPLEMENTATION.md) : les comptes sont créés
// uniquement par un administrateur.
const PUBLIC_ACTIONS = [
  'api::document.document.find',
  'api::document.document.findOne',
  'api::domaine.domaine.find',
  'api::domaine.domaine.findOne',
  'api::document-relation.document-relation.find',
  'api::document-relation.document-relation.findOne',
  'api::actualite.actualite.find',
  'api::actualite.actualite.findOne',
  'api::corps.corps.find',
  'api::corps.corps.findOne',
  'api::type-corps.type-corps.find',
  'api::type-corps.type-corps.findOne',
  'api::organigramme.organigramme.find',
  'api::organigramme.organigramme.findOne',
  'api::faq.faq.find',
  'api::faq.faq.findOne',
  // Single Type : le routeur core n'expose que `find` (GET /api/a-propos).
  'api::a-propos.a-propos.find',
  'api::remark.remark.find',
  'api::remark.remark.create',
  'api::app-rating.app-rating.find',
  'api::app-rating.app-rating.findOne',
  'api::app-rating.app-rating.create',
  'api::subscriber.subscriber.create',
  'plugin::upload.content-api.find',
  'plugin::upload.content-api.findOne',
];

const AUTH_PUBLIC_ACTIONS = [
  'plugin::users-permissions.auth.callback',
  'plugin::users-permissions.auth.connect',
  'plugin::users-permissions.auth.forgotPassword',
  'plugin::users-permissions.auth.resetPassword',
  // 'plugin::users-permissions.auth.register' retiré : plus d'inscription usager
  'plugin::users-permissions.auth.emailConfirmation',
  'plugin::users-permissions.auth.sendEmailConfirmation',
  'plugin::users-permissions.auth.refresh',
];

const AUTH_AUTHENTICATED_ACTIONS = [
  'plugin::users-permissions.auth.logout',
  'plugin::users-permissions.auth.getSessions',
  'plugin::users-permissions.auth.revokeSession',
  'plugin::users-permissions.auth.changePassword',
  'plugin::users-permissions.user.me',
];

// ─── Authenticated — historique de recherche (seule fonctionnalité usager restante)
// Les actions démarches / favoris / upload ont été retirées avec la suppression
// des démarches et des favoris (aucun upload côté front ne les utilisait plus).
const AUTH_THROUGHPUT_ACTIONS = [
  'api::historique-recherche.historique-recherche.create',
  'api::historique-recherche.historique-recherche.find',
  'api::historique-recherche.historique-recherche.findOne',
];

// Action handlers des routes custom (une action par handler, cf. getActions U&P).
// ⚠️ Les routes `auth: false` n'ont pas besoin de scope ; ici uniquement celles
// qui exigent un usager connecté (jamais les actions réservées à l'admin).
// Les actions demarche.* et favori.* ont disparu avec les content-types supprimés.
const AUTH_CUSTOM_ACTIONS = ['api::search.search.getSearchHistory'];

/*
 * P1 — Validation juridique : L'ATTRIBUTION DE PERMISSION NE SUFFIT PAS.
 *
 * Les handlers `document.updateStatus`, `document.statutHistorique` et
 * `document.setEtatNotice` contrôlent le rôle dans le code (canValidateLegalStatus
 * / isAdminUser, src/utils/errors.ts) : une permission U&P active donnerait
 * l'accès à TOUT rôle qui la possède. On n'attribue donc ces actions qu'au rôle
 * Administrateur (bloc ci-dessous via allActionsAdmin), jamais à Public/Authenticated.
 * La matrice est documentée : seul « Administrateur » peut confirmer ou modifier
 * le statut juridique d'un texte.
 */

async function main() {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  try {
    const upService = app.plugin('users-permissions').service('users-permissions');
    const roleService = app.plugin('users-permissions').service('role');
    const allActionsPublic = upService.getActions({ defaultEnable: false });
    const allActionsAuth = upService.getActions({ defaultEnable: false });
    const allActionsAdmin = upService.getActions({ defaultEnable: true });

    const publicRole = await app.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });
    const authRole = await app.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' } });
    const adminRole = await app.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { name: 'Administrateur' } });

    for (const action of [...AUTH_PUBLIC_ACTIONS, ...PUBLIC_ACTIONS]) {
      enableAction(allActionsPublic, action);
    }
    for (const action of [
      ...AUTH_PUBLIC_ACTIONS,
      ...AUTH_AUTHENTICATED_ACTIONS,
      ...PUBLIC_ACTIONS,
      ...AUTH_THROUGHPUT_ACTIONS,
      ...AUTH_CUSTOM_ACTIONS,
    ]) {
      enableAction(allActionsAuth, action);
    }

    const dump = (label: string, permissions: Record<string, any>) => {
      const enabled: string[] = [];
      for (const [type, { controllers }] of Object.entries<any>(permissions)) {
        for (const [controller, actions] of Object.entries<any>(controllers)) {
          for (const [action, conf] of Object.entries<any>(actions)) {
            if (conf.enabled) enabled.push(`${type}.${controller}.${action}`);
          }
        }
      }
      console.log(`[assign-permissions] ${label}: ${enabled.length} actions`);
      enabled.forEach((a) => console.log(`  - ${a}`));
    };

    if (!publicRole || !authRole) throw new Error('Rôles Public/Authenticated introuvables');

    if (!APPLY) {
      dump('Public (dry-run)', allActionsPublic);
      dump('Authenticated (dry-run)', allActionsAuth);
      console.log(
        `[assign-permissions] Administrateur (dry-run): ${
          adminRole ? 'rôle présent, toutes les actions seront activées' : 'rôle introuvable'
        }`
      );
      return;
    }

    await roleService.updateRole(publicRole.id, { permissions: allActionsPublic });
    console.log(`[assign-permissions] Rôle Public (id=${publicRole.id}) mis à jour.`);
    await roleService.updateRole(authRole.id, { permissions: allActionsAuth });
    console.log(`[assign-permissions] Rôle Authenticated (id=${authRole.id}) mis à jour.`);

    // L'Administrateur doit disposer des nouveaux handlers custom (mine,
    // timeline, updateStatus, statsApi…) : on lui réattribue toutes les actions.
    if (adminRole) {
      await roleService.updateRole(adminRole.id, { permissions: allActionsAdmin });
      console.log(
        `[assign-permissions] Rôle Administrateur (id=${adminRole.id}) mis à jour (toutes les actions).`
      );
    } else {
      console.warn('[assign-permissions] Rôle "Administrateur" introuvable — ignoré.');
    }
  } finally {
    await app.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
