/**
 * P1 — Tests unitaires de la normalisation des types de documents.
 *
 * Module pur (pas de Strapi, pas de base) : node --test tests/
 *
 * Couvre :
 *  - conversion des variantes connues (casse, accents, pluriels, fautes) ;
 *  - Préservation des valeurs INCONNUES (null → aucune écriture) ;
 *  - normalisation des mots-clés (chaîne / tableau / vide) ;
 *  - idempotence (canonicalize(canonique) === canonique).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  CANONICAL_TYPES,
  ALIASES,
  normalizeKey,
  canonicalizeType,
  normalizeKeywords,
} = require('../scripts/p1-normalizer.js');

describe('normalizeKey', () => {
  test('minuscules, sans accents, espaces réduits', () => {
    assert.strictEqual(normalizeKey('  Décrets  '), 'decrets');
    assert.strictEqual(normalizeKey('ARRÊTÉS'), 'arretes');
    assert.strictEqual(normalizeKey('Lois   Organiques'), 'lois organiques');
    assert.strictEqual(normalizeKey('Circilaire'), 'circilaire');
    assert.strictEqual(normalizeKey(null), '');
    assert.strictEqual(normalizeKey(undefined), '');
  });
});

describe('canonicalizeType — variantes connues converties', () => {
  test('faute de frappe historique « circilaire » → circulaire', () => {
    assert.strictEqual(canonicalizeType('circilaire'), 'circulaire');
    assert.strictEqual(canonicalizeType('Circilaire'), 'circulaire');
  });

  test('accents et casse quelconques', () => {
    assert.strictEqual(canonicalizeType('DÉCRET'), 'decret');
    assert.strictEqual(canonicalizeType('Arrêté'), 'arrete');
    assert.strictEqual(canonicalizeType('ARRÊTÉS'), 'arrete');
    assert.strictEqual(canonicalizeType('Traités internationaux'), 'traites_internationaux');
  });

  test('pluriels et libellés front historiques', () => {
    assert.strictEqual(canonicalizeType('Décrets'), 'decret');
    assert.strictEqual(canonicalizeType('Ordonnances'), 'ordonnance');
    assert.strictEqual(canonicalizeType('lois organiques'), 'loi_organique');
    assert.strictEqual(canonicalizeType('Lois ordinaires'), 'loi_ordinaires');
    assert.strictEqual(canonicalizeType('Loi ordinaire'), 'loi_ordinaires');
    assert.strictEqual(canonicalizeType('Notes'), 'note');
    assert.strictEqual(canonicalizeType('arrêtés interministériels'), 'arrete_interministeriel');
  });

  test('formes canoniques déjà correctes (idempotence)', () => {
    for (const t of CANONICAL_TYPES) {
      assert.strictEqual(canonicalizeType(t), t, `idempotent pour ${t}`);
    }
  });
});

describe('canonicalizeType — valeurs inconnues PRÉSERVÉES', () => {
  test('une valeur inconnue renvoie null (ne doit PAS être réécrite)', () => {
    assert.strictEqual(canonicalizeType('Avis technique'), null);
    assert.strictEqual(canonicalizeType('Décision ministérielle'), null);
    assert.strictEqual(canonicalizeType('Code des marchés'), null);
  });

  test('vide / null / undefined → null', () => {
    assert.strictEqual(canonicalizeType(''), null);
    assert.strictEqual(canonicalizeType('   '), null);
    assert.strictEqual(canonicalizeType(null), null);
    assert.strictEqual(canonicalizeType(undefined), null);
  });

  test('les valeurs inconnues ne sont PAS mappées silencieusement', () => {
    // Garde-fou : aucun alias ne doit pointer vers une valeur hors liste.
    for (const target of Object.values(ALIASES)) {
      assert.ok(
        CANONICAL_TYPES.includes(target),
        `l'alias ${JSON.stringify(target)} doit appartenir à la liste contrôlée`
      );
    }
  });
});

describe('normalizeKeywords', () => {
  test('chaîne séparée par virgules → tableau propre', () => {
    assert.deepStrictEqual(normalizeKeywords('a, b,,c , d'), ['a', 'b', 'c', 'd']);
  });

  test('tableau déjà propre → inchangé', () => {
    assert.deepStrictEqual(normalizeKeywords(['fonction publique', ' concurrence ']), [
      'fonction publique',
      'concurrence',
    ]);
  });

  test('vide → tableau vide (jamais null ni invention)', () => {
    assert.deepStrictEqual(normalizeKeywords(''), []);
    assert.deepStrictEqual(normalizeKeywords(null), []);
    assert.deepStrictEqual(normalizeKeywords(undefined), []);
    assert.deepStrictEqual(normalizeKeywords('   '), []);
  });
});
