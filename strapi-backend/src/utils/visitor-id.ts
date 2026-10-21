/**
 * Identification ANONYME du visiteur — une seule source de vérité pour les
 * visites de l'application et les consultations de textes.
 *
 * Règles (IMPLEMENTATION.md §Comptage) :
 *  - l'IP brute n'est JAMAIS écrite en base, ni journalisée, ni renvoyée ;
 *  - l'empreinte = HMAC-SHA256(secret serveur, `${jour}|${ipNormalisée}`)
 *    tronquée à 32 caractères hexadécimaux, avec le JOUR malgache comme sel :
 *    l'empreinte change chaque minuit (Indian/Antananarivo) → comptage
 *    « 1 fois par jour » naturel et empreinte non réutilisable entre les jours ;
 *  - le secret (VISITOR_HASH_SECRET) rend l'opération irréversible : sans lui,
 *    une empreinte d'IPv4 se craque en quelques secondes ;
 *  - pas de cookie, pas d'identifiant navigateur : seule l'IP de la requête.
 *
 * Identification par IP SEULE (décision validée — option A) : un changement de
 * navigateur ne crée pas un faux visiteur. Limite documentée : plusieurs
 * personnes derrière une même IP (NAT / CGNAT opérateur) comptent pour une.
 */
import crypto from 'crypto';
import { dateJourMadagascar } from './dates';

/** Longueur de l'empreinte conservée (hexadécimal). */
export const EMPREINTE_LONGUEUR = 32;

/**
 * Liste courte et documentée des user-agents évidemment des robots :
 * moteurs de recherche, outils de monitoring et clients en ligne de commande.
 * (Non exhaustive — un robot non listé reste compté comme un visiteur,
 * c'est le prix de ne pas deployer une base UA complète.)
 */
const BOT_USER_AGENTS = [
  'bot',
  'crawler',
  'spider',
  'curl',
  'wget',
  'headless',
  'python-requests',
  'httpie',
  'okhttp',
  'libwww',
  'scraper',
  'monitoring',
  'uptime',
  'facebookexternalhit',
  'slurp',
];

/** Chemins de vérification de santé (orchestrateur, load-balancer). */
const CHEFS_SANTE = ['/health', '/healthz', '/_health', '/ready', '/readiness', '/live'];

// ─── Secret ──────────────────────────────────────────────────────────────────

let cacheSecret: { valeur: string | null; aPrevenu: boolean } = { valeur: null, aPrevenu: false };

/** Vrai si l'application tourne en production (comptage exige un secret). */
const estProduction = (): boolean => process.env.NODE_ENV === 'production';

/**
 * Secret d'empreinte :
 *  1. `VISITOR_HASH_SECRET` (recommandé) ;
 *  2. `VISITOR_SECRET` (ancien nom conservé pour compatibilité) ;
 *  3. production → ABSENT : comptage refusé (null) ;
 *  4. développement → secret éphémère généré + avertissement une seule fois.
 */
const secretVisiteur = (): string | null => {
  if (cacheSecret.valeur !== null) return cacheSecret.valeur;

  const configure = process.env.VISITOR_HASH_SECRET || process.env.VISITOR_SECRET;
  if (configure && configure.trim().length >= 16) {
    cacheSecret.valeur = configure.trim();
    return cacheSecret.valeur;
  }

  if (estProduction()) {
    if (!cacheSecret.aPrevenu) {
      cacheSecret.aPrevenu = true;
      console.error(
        '[visiteurs] VISITOR_HASH_SECRET absent ou trop court (< 16 caractères) : ' +
          'comptage des visites/refus en production. Définissez VISITOR_HASH_SECRET ' +
          'dans .env (voir .env.example) puis redémarrez le serveur.'
      );
    }
    return null;
  }

  // Développement : secret éphémère (valable ce processus uniquement).
  cacheSecret.valeur = crypto.randomBytes(32).toString('hex');
  if (!cacheSecret.aPrevenu) {
    cacheSecret.aPrevenu = true;
    console.warn(
      '[visiteurs] VISITOR_HASH_SECRET absent : secret TEMPORAIRE généré pour le ' +
        "développement — les empreintes ne sont pas stables d'un redémarrage à " +
        "l'autre. Renseignez VISITOR_HASH_SECRET avant la mise en production."
    );
  }
  return cacheSecret.valeur;
};

/** Le comptage est-il actif ? (faux en production sans secret) */
export const comptageActif = (): boolean => secretVisiteur() !== null;

/** (Tests) réinitialise le cache du secret. */
export const __resetSecretVisiteur = () => {
  cacheSecret = { valeur: null, aPrevenu: false };
};

// ─── Jour courant (fuseau Madagascar) ────────────────────────────────────────

/**
 * Jour courant « métier » (Indian/Antananarivo, UTC+3), au format AAAA-MM-JJ.
 *
 * Point d'INJECTION pour les tests : `VISITOR_JOUR_FIXE=AAAA-MM-JJ` force le
 * jour (honoré UNIQUEMENT hors production) afin de tester le passage de
 * minuit sans attendre. Toute l'application (visites, consultations,
 * statistiques, purge) passe par cette fonction.
 */
export const jourCourant = (): string => {
  const fixe = process.env.VISITOR_JOUR_FIXE;
  if (!estProduction() && fixe && /^\d{4}-\d{2}-\d{2}$/.test(fixe)) return fixe;
  return dateJourMadagascar();
};

// ─── IP réelle ───────────────────────────────────────────────────────────────

/** `TRUST_PROXY` : faire confiance au X-Forwarded-For ? (défaut : NON) */
export const proxyDeConfiance = (): boolean => {
  const v = (process.env.TRUST_PROXY || '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
};

/**
 * IP réellement vue par le serveur, SANS jamais la journaliser ni la stocker.
 *
 * - `TRUST_PROXY` absent/faux → IP de la connexion (socket) : un client ne
 *   peut PAS falsifier son adresse en ajoutant un X-Forwarded-For ;
 * - `TRUST_PROXY=true` déployé derrière UN proxy de confiance (reverse-proxy
 *   ou tunnel) → première adresse du X-Forwarded-For (la plus proche du
 *   client). Ne l'activez que si Strapi n'est joignable QUE par le proxy.
 */
export const ipDuContexte = (ctx: any): string => {
  if (proxyDeConfiance()) {
    const xf = String(ctx?.request?.headers?.['x-forwarded-for'] || '').trim();
    if (xf) {
      const premiere = xf.split(',')[0].trim();
      if (premiere) return premiere;
    }
  }
  return (
    ctx?.request?.ip ||
    ctx?.request?.socket?.remoteAddress ||
    ctx?.socket?.remoteAddress ||
    ''
  );
};

/**
 * Normalisation IPv4/IPv6 :
 *  - `::ffff:1.2.3.4` (IPv4 mappée sur IPv6) → `1.2.3.4` ;
 *  - IPv6 → préfixe /64 uniquement (les 64 premiers bits, le reste à zéro) :
 *    une machine a typiquement une adresse par interface, le /64 regroupe les
 *    adresses d'un même hôte/réseau sans les traiter toutes comme distinctes ;
 *  - port et zone (`%eth0`) retirés.
 * Renvoie '' si l'adresse est inexploitable → l'appelant ne comptera pas.
 */
export const normaliserIp = (ip: string): string => {
  if (!ip) return '';
  let v = String(ip).trim().toLowerCase();

  // Zone IPv6 (`fe80::1%eth0`)
  v = v.split('%')[0];

  // IPv4-mappée IPv6, notation décimale (`::ffff:127.0.0.1`)
  const mapped = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];

  // IPv4-mappée IPv6, notation hexadécimale (`::ffff:7f00:1`)
  const mappedHex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const a = parseInt(mappedHex[1], 16);
    const b = parseInt(mappedHex[2], 16);
    return `${a >> 8}.${a & 0xff}.${b >> 8}.${b & 0xff}`;
  }

  // IPv4 brut éventuellement porté (`1.2.3.4:1234` — jamais en IPv6 pur)
  const ipv4Port = v.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4Port) return ipv4Port[1];

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return v;

  // IPv6 : décomposer « :: » en 8 hextets, puis garder le préfixe /64
  if (v.includes(':')) {
    if (v === '::') return ''; // adresse non routable : inexploitable
    const parties = v.split('::');
    const gauche = parties[0] ? parties[0].split(':') : [];
    const droite = parties.length > 1 && parties[1] ? parties[1].split(':') : [];
    let groupes: string[];
    if (parties.length > 1) {
      const manquants = Math.max(8 - gauche.length - droite.length, 0);
      groupes = [...gauche, ...Array(manquants).fill('0'), ...droite];
    } else {
      groupes = gauche;
    }
    if (groupes.length === 0) return '';
    const prefixe = groupes.slice(0, 4);
    while (prefixe.length < 4) prefixe.push('0');
    return `${prefixe.join(':')}::/64`;
  }

  return '';
};

// ─── Empreinte ───────────────────────────────────────────────────────────────

/**
 * Empreinte anonyme du visiteur pour `jour` (défaut : jour courant à
 * Madagascar). Jamais d'IP en clair en sortie : uniquement 32 caractères
 * hexadécimaux irréversibles.
 *
 * Renvoie `null` si le comptage est inactif (prod sans secret), si la requête
 * vient d'un robot / d'un contrôle de santé, ou si l'IP est inexploitable :
 * l'appelant ne comptera rien, sans erreur bloquante.
 */
export const visiteurHash = (ctx: any, jour: string = jourCourant()): string | null => {
  const secret = secretVisiteur();
  if (!secret) return null;

  if (estRobot(ctx)) return null;

  const ip = normaliserIp(ipDuContexte(ctx));
  if (!ip) return null;

  return crypto.createHmac('sha256', secret).update(`${jour}|${ip}`).digest('hex').slice(0, EMPREINTE_LONGUEUR);
};

/** Empreinte pour une IP déjà isolée (tests unitaires hors requête). */
export const visiteurHashDepuisIp = (ip: string, jour: string): string | null => {
  const secret = secretVisiteur();
  if (!secret) return null;
  const norm = normaliserIp(ip);
  if (!norm) return null;
  return crypto.createHmac('sha256', secret).update(`${jour}|${norm}`).digest('hex').slice(0, EMPREINTE_LONGUEUR);
};

// ─── Robots / santé ──────────────────────────────────────────────────────────

/** User-Agent de robot évident ? (liste courte documentée plus haut) */
export const estRobot = (ctx: any): boolean => {
  const ua = String(ctx?.request?.headers?.['user-agent'] || '').toLowerCase();
  if (!ua) return false;
  if (CHEFS_SANTE.some((c) => String(ctx?.request?.path || '').toLowerCase().startsWith(c))) {
    return true;
  }
  return BOT_USER_AGENTS.some((mot) => ua.includes(mot));
};

/** Contrôle de santé (path) — exclu du comptage même sans user-agent. */
export const estCheminSante = (path: unknown): boolean =>
  CHEFS_SANTE.some((c) => String(path || '').toLowerCase().startsWith(c));

export default {
  comptageActif,
  jourCourant,
  proxyDeConfiance,
  ipDuContexte,
  normaliserIp,
  visiteurHash,
  visiteurHashDepuisIp,
  estRobot,
  estCheminSante,
};
