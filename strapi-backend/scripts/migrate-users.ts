/// <reference path="./pg.d.ts" />
import { Pool } from 'pg';
import { compileStrapi, createStrapi } from '@strapi/strapi';

interface LegacyUser {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  password: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  date_joined: string | null;
  langue_preferee: string;
}

const APPLY = process.argv.includes('--apply');

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'digitallibrary_db1',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  });

  const { rows } = await pool.query<LegacyUser>(
    'SELECT id, nom, prenom, email, password, is_staff, is_superuser, is_active, date_joined, langue_preferee FROM users ORDER BY id'
  );
  await pool.end();

  console.log(
    `[migrate-users] ${rows.length} utilisateurs legacy lus${
      APPLY ? ' (mode APPLY)' : ' (dry-run, ajouter --apply pour écrire)'
    }`
  );

  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  try {
    const roleService = app.plugin('users-permissions').service('role');
    const adminRole = await app.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { name: 'Administrateur' } });

    if (!adminRole) {
      if (APPLY) {
        console.log('[migrate-users] Création du rôle "Administrateur"...');
        const permissions = app
          .plugin('users-permissions')
          .service('users-permissions')
          .getActions({ defaultEnable: true });
        await roleService.createRole({
          name: 'Administrateur',
          description: "Rôle administrateur (is_staff / is_superuser de l'ancien backend)",
          permissions,
        });
        console.log('[migrate-users] Rôle "Administrateur" créé.');
      } else {
        console.log('[migrate-users] (dry-run) Le rôle "Administrateur" serait créé.');
      }
    } else {
      console.log(`[migrate-users] Rôle "Administrateur" déjà présent (id=${adminRole.id}).`);
    }

    const authRole = await app.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' } });

    const adminRoleAfter = APPLY
      ? (adminRole ?? (await app.db.query('plugin::users-permissions.role').findOne({ where: { name: 'Administrateur' } })))
      : adminRole;

    let created = 0;
    let skipped = 0;
    for (const user of rows) {
      const isAdmin = user.is_staff || user.is_superuser;
      const role = isAdmin ? 'Administrateur' : 'Authenticated';
      const roleId = isAdmin ? adminRoleAfter?.id : authRole?.id;

      if (!roleId) {
        console.error(
          APPLY
            ? `[migrate-users] Rôle introuvable pour ${user.email}, skip.`
            : `[migrate-users] (dry-run) ${user.email} -> rôle "${role}" (créé en --apply, hash bcrypt compatible)`
        );
        if (APPLY) skipped++;
        continue;
      }

      const existing = await app.db
        .query('plugin::users-permissions.user')
        .findOne({ where: { email: user.email } });

      if (existing) {
        console.log(`[migrate-users] déjà présent (skip): ${user.email}`);
        skipped++;
        continue;
      }

      if (!/^\$2[abxy]\$\d{2}\$/.test(user.password) || user.password.length !== 60) {
        console.error(`[migrate-users] hash invalide (format bcrypt) pour ${user.email}, skip.`);
        skipped++;
        continue;
      }

      if (!APPLY) {
        console.log(
          `[migrate-users] (dry-run) ${user.email} -> rôle ${role} (bcrypt $2a$ compatible)`
        );
        continue;
      }

      await app.db.query('plugin::users-permissions.user').create({
        data: {
          username: user.email,
          email: user.email,
          provider: 'local',
          password: user.password,
          confirmed: !!user.is_active,
          blocked: false,
          role: roleId,
          nom: user.nom,
          prenom: user.prenom,
          langue_preferee: user.langue_preferee || 'fr',
        },
      });
      created++;
      console.log(`[migrate-users] créé: ${user.email} (${role})`);
    }

    console.log(
      `[migrate-users] Terminé. Créés: ${APPLY ? created : '(aucun, dry-run)'}, ignorés: ${skipped}.`
    );
  } finally {
    await app.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});