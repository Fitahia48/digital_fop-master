/**
 * Génération ATOMIQUE du numéro de dossier MTEFOP-AAAA-NNNNNN.
 *
 * Le compteur annuel repart à 1 chaque année. La génération est atomique
 * (jamais de lecture puis écriture séparée) : upsert PostgreSQL
 * `INSERT ... ON CONFLICT (annee) DO UPDATE SET dernier = dernier + 1
 * RETURNING dernier`, exécuté dans la MÊME transaction knex que la création
 * de la démarche.
 *
 * Table cible : `strapi_compteur_dossiers` (collectionName du content-type
 * compteur-dossier).
 */
const COMPTEUR_TABLE = 'strapi_compteur_dossiers';
const PREFIXE = 'MTEFOP';

/**
 * Incrémente le compteur de l'année et renvoie le nouveau numéro (atomique).
 * À appeler DANS la transaction knex de création de la démarche (trx).
 */
export const nextNumeroDossier = async (trx: any): Promise<string> => {
  const annee = new Date().getFullYear();

  // Upsert atomique PostgreSQL : INSERT si absent (dernier = 1),
  // sinon UPDATE dernier = dernier + 1. RETURNING renvoie la valeur post-update.
  // ⚠️ Strapi 5 crée un INDEX unique (pas une contrainte UNIQUE) sur les champs
  // `unique: true` → la cible ON CONFLICT doit être `(&quot;annee&quot;)` pour viser
  // l'index, pas `(annee)` qui ne trouverait pas de contrainte.
  const rows = await trx(COMPTEUR_TABLE)
    .insert({ annee, dernier: 1 })
    .onConflict(['annee'])
    .merge({ dernier: trx.raw(`${COMPTEUR_TABLE}."dernier" + 1`) })
    .returning('dernier');

  const dernier = Number(
    rows?.[0]?.dernier ?? (Array.isArray(rows) ? rows[0] : rows) ?? 1
  );

  return `${PREFIXE}-${annee}-${String(dernier).padStart(6, '0')}`;
};

/**
 * Vérifie qu'un numéro respecte le format MTEFOP-AAAA-NNNNNN.
 * Utilisé pour la reprise de données et les tests.
 */
export const isNumeroDossierFormat = (value: string): boolean =>
  /^MTEFOP-\d{4}-\d{6}$/.test(value);

export default { nextNumeroDossier, isNumeroDossierFormat };
