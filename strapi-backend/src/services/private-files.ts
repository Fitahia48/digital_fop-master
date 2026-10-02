/**
 * Stockage PRIVÉ des fichiers sensibles (décision D1).
 *
 * Le provider local de Strapi écrit dans public/uploads → servis sans
 * authentification. Inacceptable pour les pièces jointes de démarches
 * spécialisées et les pièces de signalements (identités, justificatifs).
 *
 * Principe : les fichiers sont écrits par ce service dans `private-uploads/`
 * (HORS du dossier public), nommés par le sha256 de leur contenu (anti-guessing
 * + dédoublonnage). Ils ne sont JAMAIS servis en statique : la lecture passe
 * uniquement par un endpoint authentifié et autorisé (contrôle propriétaire /
 * agent / unité habilitée selon le cas).
 *
 * Enregistrement en base : une ligne dans la table du content-type
 * `fichier-prive` (uid api::fichier-prive.fichier-prive), qui porte le nom
 * disque, le nom original, le mime type, la taille et le propriétaire.
 */
import path from 'path';
import fs from 'fs';
import { createHash, randomBytes } from 'crypto';
import type { Core } from '@strapi/strapi';
import { ValidationError, ApplicationError } from '../utils/errors';

// Dossier privé : <racine strapi-backend>/private-uploads (hors public/)
export const PRIVATE_DIR = path.resolve(strapi.dirs.static.public, '..', 'private-uploads');

// Extensions autorisées pour les pièces jointes sensibles (restrictif)
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

// Taille max : 10 Mo
const MAX_SIZE = 10 * 1024 * 1024;

export const UID_FICHIER_PRIVE = 'api::fichier-prive.fichier-prive';

export interface FichierPriveRecord {
  documentId: string;
  nom_fichier: string;
  nom_original: string;
  mime: string;
  taille: number;
}

/** Validation d'un fichier téléversé (extension + taille). */
const validateFile = (file: any): void => {
  const ext = path.extname(file.originalname || file.name || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    throw new ValidationError(
      `Type de fichier non autorisé (${ext || 'inconnu'}). Formats acceptés : ${ALLOWED_EXT.join(', ')}.`
    );
  }
  const size = Number(file.size ?? 0);
  if (size > MAX_SIZE) {
    throw new ValidationError('Fichier trop volumineux (10 Mo maximum).');
  }
};

/** Crée le dossier privé s'il n'existe pas (fs natif). */
const fse_ensureDir = (): void => {
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
};

/**
 * Écrit le fichier sur le disque privé et crée l'enregistrement en base.
 * À appeler dans un controller avec un fichier multer (req.files.*).
 *
 * @returns l'enregistrement `fichier-prive` créé.
 */
export const savePrivateFile = async (
  strapi: Core.Strapi,
  file: any,
  meta: { ownerUserId?: number | null; categorie: 'demarche' | 'signalement' }
): Promise<FichierPriveRecord> => {
  validateFile(file);

  const ext = path.extname(file.originalname || file.name || '').toLowerCase();
  const buffer: Buffer = file.buffer ?? fs.readFileSync(file.path);

  // Nom disque déterministe : sha256 du contenu (dédoublonnage, anti-guessing).
  // On y mélange 8 octets aléatoires pour qu'un même document déposé par deux
  // usagers distincts ne soit pas corrélé par une empreinte identique.
  const salt = randomBytes(8).toString('hex');
  const hash = createHash('sha256').update(buffer).digest('hex');
  const diskName = `${hash.slice(0, 32)}-${salt}${ext}`;

  fse_ensureDir();
  fs.writeFileSync(path.join(PRIVATE_DIR, diskName), buffer);

  return (await strapi.documents(UID_FICHIER_PRIVE).create({
    data: {
      nom_fichier: diskName,
      nom_original: String(file.originalname || file.name || 'fichier'),
      mime: String(file.mimetype || 'application/octet-stream'),
      taille: buffer.length,
      categorie: meta.categorie,
      owner: meta.ownerUserId ?? undefined,
    },
  })) as unknown as FichierPriveRecord;
};

/**
 * Ouvre un fichier privé en lecture (après AUTORISATION par le controller).
 * Retourne un stream + métadonnées, ou lève une erreur si introuvable.
 */
export const openPrivateFile = (
  record: any
): { stream: fs.ReadStream; nom_original: string; mime: string } => {
  const safe = path.basename(String(record.nom_fichier)); // anti path traversal
  const filePath = path.join(PRIVATE_DIR, safe);
  if (!fs.existsSync(filePath)) {
    throw new ApplicationError('Fichier introuvable.');
  }
  return {
    stream: fs.createReadStream(filePath),
    nom_original: record.nom_original || safe,
    mime: record.mime || 'application/octet-stream',
  };
};

/** Supprime le fichier disque (appelé par le lifecycle afterDelete du CT). */
export const deletePrivateFile = (nomFichier: string): void => {
  const safe = path.basename(String(nomFichier));
  const filePath = path.join(PRIVATE_DIR, safe);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

export default { savePrivateFile, openPrivateFile, deletePrivateFile, PRIVATE_DIR };
