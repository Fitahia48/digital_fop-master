import type { Core } from '@strapi/strapi';
import { registerDemarcheLifecycle } from './middlewares/demarche-lifecycle';

/**
 * Seeds idempotents (exécutés à chaque boot, n'écrivent que si absent).
 *
 * ⚠️ Références légales : décret n°2024-055 du 20 janvier 2024 (articles
 * cités en commentaire par entrée). Les listes de pièces requises sont des
 * propositions GÉNÉRIQUES marquées « À VALIDER avec la direction concernée » :
 * elles ne constituent pas une procédure officielle tant qu'elles ne sont pas
 * confirmées par le ministère.
 */

interface DirectionSeed {
  code: string;
  nom: string;
  parent?: string; // code du parent
}

// Décret n°2024-055 : articles 26-28, 35, 37-38, 42-43, 48, 20
const DIRECTIONS: DirectionSeed[] = [
  { code: 'DG_TRAVAIL', nom: 'Direction Générale du Travail' }, // art. 26-28
  { code: 'DG_PROMOTION_EMPLOI', nom: "Direction Générale de la Promotion de l'Emploi" }, // art. 37-38
  { code: 'DG_FONCTION_PUBLIQUE', nom: 'Direction Générale de la Fonction Publique' }, // art. 42-43
  { code: 'DIR_MIGRATION_PRO', nom: 'Direction de la Migration Professionnelle', parent: 'DG_TRAVAIL' }, // art. 35, rattachée à la DG du Travail
  { code: 'DIR_FORMATION_AGENTS', nom: "Direction de la Formation et du Perfectionnement des Agents de l'Etat", parent: 'DG_FONCTION_PUBLIQUE' }, // art. 48, rattachée à la DG de la Fonction Publique
  { code: 'DIR_SYSTEME_INFO', nom: "Direction du Système d'Information" }, // art. 20 (demandes d'ordre technique)
];

interface PieceSeed {
  code: string;
  libelles: { fr: string; en: string; mg: string };
  obligatoire: boolean;
}

interface TypeDemarcheSeed {
  code: string;
  libelles: { fr: string; en: string; mg: string };
  direction: string;
  delai_cible_jours: number;
  pieces_requises: PieceSeed[];
  champs_specifiques?: any[];
}

// Pièces génériques plausibles — À VALIDER avec la direction concernée
const PV = (fr: string, en: string, mg: string, obligatoire = true): PieceSeed => ({
  code: fr.toLowerCase().replace(/[^a-z]+/g, '_').slice(0, 40),
  libelles: { fr, en, mg },
  obligatoire,
});

const TYPES_DEMARCHE: TypeDemarcheSeed[] = [
  // ─── 4 codes existants (compatibilité : ne cassent aucune donnée) ────────
  {
    code: 'copie_certifiee',
    libelles: {
      fr: "Copie certifiée d'un texte",
      en: 'Certified copy of a text',
      mg: 'Dika mitovy ekena',
    },
    direction: 'DG_FONCTION_PUBLIQUE', // À VALIDER
    delai_cible_jours: 15, // À VALIDER
    pieces_requises: [
      PV('Copie du document concerné', 'Copy of the document', 'Dika ny antontan-taratasy'),
    ],
  },
  {
    code: 'attestation',
    libelles: { fr: 'Attestation', en: 'Certificate', mg: 'Marina' },
    direction: 'DG_FONCTION_PUBLIQUE', // À VALIDER
    delai_cible_jours: 15, // À VALIDER
    pieces_requises: [PV("Copie de la pièce d'identité", 'ID copy', 'Dika ny maha-olona')],
  },
  {
    code: 'demande_information',
    libelles: {
      fr: "Demande d'information",
      en: 'Information request',
      mg: 'Fangatahana vaovao',
    },
    direction: 'DIR_SYSTEME_INFO',
    delai_cible_jours: 10, // À VALIDER
    pieces_requises: [],
  },
  {
    code: 'autre',
    libelles: { fr: 'Autre demande', en: 'Other request', mg: 'Fangatahana hafa' },
    direction: 'DG_TRAVAIL', // À VALIDER
    delai_cible_jours: 30, // À VALIDER
    pieces_requises: [],
  },

  // ─── Démarches spécialisées (décret n°2024-055, art. 35, 48-49) ──────────
  {
    code: 'permis_travail_expatrie',
    libelles: {
      fr: "Permis de travail d'un expatrié",
      en: 'Expatriate work permit',
      mg: "Fahazoan-dalana hiasa ho an'ny vahiny", // TODO: à valider par un locuteur natif
    },
    direction: 'DIR_MIGRATION_PRO', // art. 35
    delai_cible_jours: 30, // À VALIDER
    pieces_requises: [
      PV("Copie du passeport", 'Passport copy', 'Dika ny pasipepori'),
      PV('Contrat de travail signé', 'Signed employment contract', 'Fifanarahana asa sonia'),
      PV('CV du candidat', 'Candidate CV', 'CV ny kandida', false),
      PV('Diplômes et attestations', 'Diplomas and certificates', 'Mari-pahaizana', false),
    ],
    champs_specifiques: [
      { code: 'nationalite', libelles: { fr: 'Nationalité', en: 'Nationality', mg: 'Firenena' }, type: 'string', obligatoire: true },
      { code: 'profession', libelles: { fr: 'Profession exercée', en: 'Occupation', mg: 'Asa tanterahina' }, type: 'string', obligatoire: true },
      { code: 'employeur', libelles: { fr: 'Employeur à Madagascar', en: 'Employer in Madagascar', mg: 'Mpiasa eto Madagasikara' }, type: 'string', obligatoire: true },
    ],
  },
  {
    code: 'agrement_agence_emploi',
    libelles: {
      fr: "Agrément d'une agence d'emploi privée",
      en: 'Private employment agency licence',
      mg: "Fahazoan-dalana ny sampan'asa tsy miankina", // TODO: à valider par un locuteur natif
    },
    direction: 'DIR_MIGRATION_PRO', // art. 35
    delai_cible_jours: 60, // À VALIDER
    pieces_requises: [
      PV('Statuts de la société', 'Company statutes', 'Lalàna fototra ny orinasa'),
      PV("Registre de commerce", 'Trade register', 'Fisoratana anarana raharaham-barotra'),
      PV("Description des services d'emploi", 'Employment services description', 'Famaritana ny tolotra asa', false),
    ],
    champs_specifiques: [
      { code: 'raison_sociale', libelles: { fr: 'Raison sociale', en: 'Company name', mg: 'Anaran\u2019ny orinasa' }, type: 'string', obligatoire: true },
      { code: 'region', libelles: { fr: "Région d'implantation", en: 'Region', mg: 'Faritra' }, type: 'string', obligatoire: true },
    ],
  },
  {
    code: 'visa_contrat_travail',
    libelles: {
      fr: 'Visa des contrats de travail',
      en: 'Employment contract approval',
      mg: 'Fankatoavana fifanarahana asa', // TODO: à valider par un locuteur natif
    },
    direction: 'DIR_MIGRATION_PRO', // art. 35
    delai_cible_jours: 15, // À VALIDER
    pieces_requises: [
      PV('Contrat de travail en 2 exemplaires', 'Employment contract (2 copies)', 'Fifanarahana asa 2'),
      PV("Fiche de paie (si renouvellement)", 'Payslip (if renewal)', 'Antontan-karama', false),
    ],
    champs_specifiques: [
      { code: 'employeur', libelles: { fr: 'Employeur', en: 'Employer', mg: 'Mpiasa' }, type: 'string', obligatoire: true },
      { code: 'salarie_nom', libelles: { fr: 'Nom du salarié', en: 'Employee name', mg: 'Anaran\u2019ny mpiasa' }, type: 'string', obligatoire: true },
    ],
  },
  {
    code: 'sortie_territoire',
    libelles: {
      fr: 'Autorisation de sortie du territoire',
      en: 'Exit permit',
      mg: 'Fahazoan-dalana mivoaka ny tanim-pirenena', // TODO: à valider par un locuteur natif
    },
    direction: 'DIR_MIGRATION_PRO', // art. 35
    delai_cible_jours: 15, // À VALIDER
    pieces_requises: [
      PV("Copie du passeport", 'Passport copy', 'Dika ny pasipepori'),
      PV("Copie du contrat de travail à l'étranger", 'Foreign employment contract copy', 'Dika fifanarahana asa any ivelany'),
      PV('Attestation de prise en charge', 'Sponsorship certificate', 'Marina fampanampiana', false),
    ],
    champs_specifiques: [
      { code: 'pays_destination', libelles: { fr: 'Pays de destination', en: 'Destination country', mg: 'Firenena lalovana' }, type: 'string', obligatoire: true },
      { code: 'duree_sejour', libelles: { fr: 'Durée du séjour (mois)', en: 'Stay duration (months)', mg: 'Faharetana (volana)' }, type: 'number', obligatoire: false },
    ],
  },
  {
    code: 'equivalence_titre',
    libelles: {
      fr: "Équivalence administrative de titre",
      en: 'Administrative qualification equivalence',
      mg: 'Fitoviana mari-pahaizana', // TODO: à valider par un locuteur natif
    },
    direction: 'DIR_FORMATION_AGENTS', // art. 48-49
    delai_cible_jours: 45, // À VALIDER
    pieces_requises: [
      PV('Copie du diplôme', 'Diploma copy', 'Dika ny mari-pahaizana'),
      PV('Relevés de notes', 'Transcripts', 'Naoty', false),
      PV("Traduction officielle du diplôme", 'Official diploma translation', 'Dikanteny ofisiali', false),
    ],
    champs_specifiques: [
      { code: 'titre_obtenu', libelles: { fr: 'Titre obtenu', en: 'Qualification obtained', mg: 'Mari-pahaizana azonina' }, type: 'string', obligatoire: true },
      { code: 'pays_obtention', libelles: { fr: "Pays d'obtention", en: 'Country of issuance', mg: 'Firenena nahazoana' }, type: 'string', obligatoire: true },
    ],
  },
];

const seedDirections = async (strapi: Core.Strapi) => {
  const uid = 'api::direction.direction';
  const byCode = new Map<string, any>();

  for (const dir of DIRECTIONS) {
    const existing = (await strapi.documents(uid).findMany({
      filters: { code: dir.code },
      limit: 1,
    })) as any[];
    if (existing.length > 0) {
      byCode.set(dir.code, existing[0]);
      continue;
    }
    const parent = dir.parent ? byCode.get(dir.parent) : undefined;
    const created = (await strapi.documents(uid).create({
      data: { code: dir.code, nom: dir.nom, ...(parent ? { parent: parent.documentId } : {}) },
    })) as any;
    byCode.set(dir.code, created);
    strapi.log.info(`[seed] direction créée : ${dir.code}`);
  }
  return byCode;
};

const seedTypesDemarche = async (strapi: Core.Strapi, directions: Map<string, any>) => {
  const uid = 'api::type-demarche.type-demarche';

  for (const t of TYPES_DEMARCHE) {
    const existing = (await strapi.documents(uid).findMany({
      filters: { code: t.code },
      limit: 1,
    })) as any[];
    if (existing.length > 0) continue;

    const direction = directions.get(t.direction);
    await strapi.documents(uid).create({
      data: {
        code: t.code,
        libelles: t.libelles,
        direction: direction?.documentId,
        delai_cible_jours: t.delai_cible_jours,
        pieces_requises: t.pieces_requises as any,
        champs_specifiques: t.champs_specifiques ?? [],
        actif: true,
      },
    });
    strapi.log.info(`[seed] type de démarche créé : ${t.code}`);
  }
};

/**
 * Page institutionnelle « À propos » (Single Type api::a-propos.a-propos).
 *
 * Idempotent : n'écrit que si l'entrée n'existe pas (les modifications faites
 * dans le panneau d'administration sont préservées aux boots suivants).
 *
 * // TODO: à valider par la Direction de la Communication
 * (texte de présentation + traductions en/mg à rédiger par le ministère).
 */
const A_PROPOS_UID = 'api::a-propos.a-propos';

const A_PROPOS_FR = {
  titre: 'À propos',
  // Citation exacte — décret n°2024-055 du 20 janvier 2024, article 2.
  mission:
    "<p>Le Ministre du Travail, de l'Emploi et de la Fonction Publique est chargé de la conception, de la mise en œuvre et du suivi de l'application de la Politique du Gouvernement en matière de Travail, d'Emploi et de la Fonction Publique.</p>",
  // TODO: à valider par la Direction de la Communication
  presentation_application:
    "<p>Cette application est une bibliothèque numérique donnant accès aux textes réglementaires, à l'organigramme, aux actualités et aux démarches en ligne du ministère.</p>",
};

const seedAPropos = async (strapi: Core.Strapi) => {
  // Le content-type vient d'être ajouté : les types générés ne le connaissent
  // pas encore, d'où le passage par `any` (même approche que utils/by-ref.ts).
  const documents = strapi.documents as any;

  // Lien par RELATION vers le décret n°2024-055 s'il a été migré en base
  // (jamais de référence en texte libre).
  let documentLegal: string | undefined;
  try {
    const docs = (await strapi.documents('api::document.document').findMany({
      filters: { numero: '2024-055' },
      limit: 1,
    })) as any[];
    documentLegal = docs[0]?.documentId;
  } catch (err) {
    strapi.log.warn(
      `[seed] a-propos : recherche du décret impossible (${(err as Error).message})`
    );
  }

  const existing = await documents(A_PROPOS_UID).findFirst({
    locale: 'fr',
    populate: ['document_legal'],
  });

  if (existing) {
    // Complète la relation si elle est encore vide et que le décret vient
    // d'être importé : une relation déjà renseignée (seed ou admin) n'est
    // jamais modifiée.
    if (!existing.document_legal && documentLegal) {
      await documents(A_PROPOS_UID).update({
        documentId: existing.documentId,
        data: { document_legal: documentLegal },
      });
      strapi.log.info(
        '[seed] a-propos : relation document_legal complétée (décret n°2024-055)'
      );
    }
    return;
  }

  if (!documentLegal) {
    strapi.log.warn(
      '[seed] a-propos : décret n°2024-055 introuvable, document_legal laissé vide'
    );
  }

  const fr = (await documents(A_PROPOS_UID).create({
    locale: 'fr',
    data: {
      ...A_PROPOS_FR,
      ...(documentLegal ? { document_legal: documentLegal } : {}),
    },
  })) as any;
  strapi.log.info('[seed] page « À propos » créée (fr)');

  // Localisations en/mg : titre traduit, contenu éditorial laissé vide — le
  // front retombe sur le français champ par champ en attendant la traduction.
  const traductions: Array<[string, string]> = [
    ['en', 'About'],
    ['mg', 'Mombamomba'],
  ];
  for (const [locale, titre] of traductions) {
    try {
      await documents(A_PROPOS_UID).update({
        documentId: fr.documentId,
        locale,
        data: { titre },
      });
      strapi.log.info(`[seed] page « À propos » : localisation ${locale} créée`);
    } catch (err) {
      strapi.log.warn(
        `[seed] a-propos : localisation ${locale} ignorée (${(err as Error).message})`
      );
    }
  }
};

export default {
  /**
   * register() : extensions de code (avant init).
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    // P1 : règle métier transverse (timeline + email) sur les démarches,
    // effective aussi pour les écritures du panneau d'administration.
    registerDemarcheLifecycle(strapi);
  },

  /**
   * bootstrap() : seeds idempotents + permissions.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const directions = await seedDirections(strapi);
    await seedTypesDemarche(strapi, directions);
    await seedAPropos(strapi);
  },
};
