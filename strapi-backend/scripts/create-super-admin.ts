/**
 * Création du premier compte « Super-administrateur ».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UTILISATION (depuis strapi-backend/ ou la racine du dépôt) :
 *
 *   npm run create-super-admin -- --email=adresse@domaine.tld --nom="Nom affiché"
 *
 * - l'adresse e-mail n'est JAMAIS écrite dans le code ni dans Git : elle est
 *   fournie en argument au moment de l'exécution ;
 * - le mot de passe provisoire est généré aléatoirement (16 caractères, au
 *   moins une lettre et un chiffre), affiché UNE SEULE FOIS sur la sortie
 *   standard, et n'est écrit nulle part (ni fichier, ni journal Strapi) ;
 * - le compte est créé confirmé, non bloqué, avec
 *   `statut_compte = "actif"` et `doit_changer_mot_de_passe = true` ;
 * - le rôle « Super-administrateur » (type `super_admin`) est créé s'il
 *   manque, avec toutes les actions U&P comme le rôle « Administrateur » ;
 * - RELANÇABLE SANS DOUBLON : si un compte existe déjà avec cette adresse, le
 *   script s'arrête sans rien modifier (aucun mot de passe n'est régénéré) ;
 * - aucun compte existant n'est modifié ni supprimé.
 * ────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import { compileStrapi, createStrapi } from '@strapi/strapi';

const UP_USER_UID = 'plugin::users-permissions.user';
const ROLE_UID = 'plugin::users-permissions.role';
const SUPER_ADMIN_TYPE = 'super_admin';
const SUPER_ADMIN_NAME = 'Super-administrateur';

/** Lit `--nom=valeur` ou `--nom valeur`. */
const readArg = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg: string) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) {
    const next = process.argv[index + 1];
    return next && !next.startsWith('--') ? next : undefined;
  }
  return undefined;
};

/** Masque une adresse pour les messages (jamais l'adresse complète en clair). */
const maskEmail = (email: string): string => {
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [local, domain] = parts;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
};

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALL = LETTERS + DIGITS;

const randomChar = (set: string): string => set[crypto.randomInt(0, set.length)];

/** Mot de passe provisoire : 16 caractères, lettres + chiffres garantis. */
const generateTemporaryPassword = (length = 16): string => {
  const chars: string[] = [randomChar(LETTERS), randomChar(DIGITS)];
  while (chars.length < length) chars.push(randomChar(ALL));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/** Version texte brut d'un HTML (mode développement : affichage en console). */
const htmlToText = (html: string): string => html
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<br\s*\/>/gi, '\n')
  .replace(/<\/([p|div|h\d|tr|li])>/gi, '\n')
  .replace(/<hr[^>]*>/gi, '\n'.repeat(34))
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&/g, '&')
  .replace(/</g, '<')
  .replace(/>/g, '>')
  .replace(/"/g, '"')
  .replace(/'/g, "'")
  .replace(/\n{3,}/g, '\n\n')
  .trim();

/** Rendu d'un gabarit : lit `{lang}/{name}.html`, extrait le sujet de la ligne
 * `<!-- subject: ... -->` et remplace les `{{variables}}`. */
const renderTemplate = (_lang: string, name: string, vars: Record<string, unknown> = {}): { subject: string; html: string; text: string } => {
  const supportedLangs = ['fr', 'en', 'mg'];
  const code = _lang ? _lang.slice(0, 2).toLowerCase() : 'fr';
  const lang = supportedLangs.includes(code as any) ? (code as any) : 'fr';
  const templatesDir = process.cwd() + '/src/templates/emails';
  const key = `${lang}/${name}`;
  let html = '';
  try {
    html = require('fs').readFileSync(templatesDir + '/' + key + '.html', 'utf8');
  } catch {
    html = '';
  }
  const subjectMatch = html.match(/<!--\s*subject:\s*([\s\S]*?)\s*-->/i);
  const subject = subjectMatch ? subjectMatch[1].trim() : '';
  const body = html.replace(/<!--\s*subject:[\\s\S]*?-->/i, '').trim();
  const interpolated = body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, ( _k: string) => (vars[_k] != null ? String(vars[_k]) : ''));
  return { subject, html: interpolated.trim(), text: htmlToText(interpolated) };
};

const LABELS: Record<string, Record<string, string>> = {
  fr: {
    publication_document: 'nouveau document',
    publication_actualite: 'nouvelle actualité',
    consulter_ici: 'Consultez ici :',
    visiter_bibliotheque: 'Visitez la bibliothèque :',
    statut_soumise: 'Soumise',
    statut_en_cours: 'En cours de traitement',
    statut_traitee: 'Traitée',
    statut_rejetee: 'Rejetée',
  },
  en: {
    publication_document: 'new document',
    publication_actualite: 'new announcement',
    consulter_ici: 'View it here:',
    visiter_bibliotheque: 'Visit the library:',
    statut_soumise: 'Submitted',
    statut_en_cours: 'In progress',
    statut_traitee: 'Processed',
    statut_rejetee: 'Rejected',
  },
  mg: {
    publication_document: 'antontan-taratasy vaovao',
    publication_actualite: 'fampahafantarana vaovao',
    consulter_ici: 'Jereo eto:',
    visiter_bibliotheque: 'Tsidiho ny tranomboky:',
    statut_soumise: 'Nalefa',
    statut_en_cours: 'Eo am-pandalovana',
    statut_traitee: 'Voavaha',
    statut_rejetee: 'Nolavina',
  },
};

const label = (_lang: string | null, key: string, vars: Record<string, unknown> = {}): string => {
  const dict = (_lang ? LABELS[_lang] : LABELS["fr"]) || LABELS["fr"] || LABELS['fr'];
  const raw = dict[key] != null ? dict[key] : LABELS['fr'][key] || '';
  return raw.replace(/\{\{\s*([\w.]+)\s*\}\}/g, ( _k: string ) => (vars[_k] != null ? String(vars[_k]) : ''));
};

const usage = () => {
  console.error(
    'Usage : npm run create-super-admin -- --email=adresse@domaine.tld --nom="Nom affiché"'
  );
};

async function main(): Promise<void> {
  const email = String(readArg('email') ?? '').trim().toLowerCase();
  const nom = String(readArg('nom') ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Adresse e-mail manquante ou invalide.");
    usage();
    process.exitCode = 1;
    return;
  }
  if (!nom) {
    console.error('Nom affiché manquant.');
    usage();
    process.exitCode = 1;
    return;
  }

  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  try {
    // ── 1. Compte déjà présent ? On s'arrête SANS RIEN modifier. ─────────────
    const existing = await app.db.query(UP_USER_UID).findOne({
      where: { email },
      populate: ['role'],
    });
    if (existing) {
      console.log(
        `Un compte existe déjà pour ${maskEmail(email)} (rôle : ${
          (existing as any).role?.name ?? 'inconnu'
        })`
      );
      console.log('Aucune modification effectuée : aucun doublon, aucun mot de passe régénéré.');
      return;
    }

    // ── 2. Rôle « Super-administrateur » (créé seulement s'il manque) ───────
    let role = await app.db.query(ROLE_UID).findOne({ where: { type: SUPER_ADMIN_TYPE } });
    if (!role) {
      role = await app.db.query(ROLE_UID).findOne({ where: { name: SUPER_ADMIN_NAME } });
    }
    if (!role) {
      const allActions = app
        .plugin('users-permissions')
        .service('users-permissions')
        .getActions({ defaultEnable: true });
      role = await app.db.query(ROLE_UID).create({
        data: {
          name: SUPER_ADMIN_NAME,
          description:
            'Super-administrateur : gère les comptes administrateurs et accède à toutes les fonctions d\'administration.',
          type: SUPER_ADMIN_TYPE,
          permissions: allActions,
        },
      });
      console.log(`Rôle « ${SUPER_ADMIN_NAME} » créé (toutes les actions U&P).`);
    } else {
      console.log(`Rôle « ${(role as any).name} » déjà présent (aucune modification).`);
    }

    // ── 3. Compte (confirmé, actif, statut_compte = "actif") ────────────────
    const password = generateTemporaryPassword();
    const userService = app.plugin('users-permissions').service('user');
    const created = await userService.add({
      username: email,
      email,
      provider: 'local',
      password,
      confirmed: true,
      blocked: false,
      role: (role as any).id,
      nom,
      prenom: '',
      langue_preferee: 'fr',
      doit_changer_mot_de_passe: true,
    });

    // `user.add` applique le défaut du schéma (« en_attente ») et ignore ce
    // champ : on force « actif » pour que le super-administrateur puisse se
    // connecter immédiatement.
    await app.db.query(UP_USER_UID).update({
      where: { id: (created as any).id },
      data: { statut_compte: 'actif' },
    });

    console.log('');
    console.log('✔ Super-administrateur créé.');
    console.log(`  Nom affiché : ${nom}`);
    console.log(`  E-mail      : ${maskEmail(email)}`);
    console.log(`  Identifiant : #${(created as any).id}`);
    console.log('');
    console.log('┌──────────────────────────────────────────────────────────────┐');
    console.log('│ MOT DE PASSE PROVISOIRE — AFFICHÉ UNE SEULE FOIS             │');
    console.log('│ Il n\'est enregistré nulle part en clair : notez-le maintenant │');
    console.log('└──────────────────────────────────────────────────────────────┘');
    console.log('');
    console.log(`  ${password}`);
    console.log('');
    console.log(
      'À la première connexion, seul le profil sera accessible tant que ce mot de passe n\'aura pas été changé.'
    );
  } finally {
    await app.destroy();
  }
}

main().catch((err) => {
  console.error('Échec du script :', err instanceof Error ? err.message : err);
  process.exit(1);
});