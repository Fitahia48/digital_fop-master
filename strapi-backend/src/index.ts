import type { Core } from '@strapi/strapi';

/**
 * Seeds idempotents (exécutés à chaque boot, n'écrivent que si absent).
 *
 * Les seeds liés aux démarches (directions, types de démarche) ont été retirés
 * avec la suppression des démarches en ligne — voir IMPLEMENTATION.md.
 */

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

/**
 * FAQ du chatbot (content-type api::faq.faq).
 *
 * Source de vérité : le contenu OFFICIEL déjà affiché sur la page Aide
 * (front/src/locales/{fr,en,mg}/translation.json, clés `aide.faqN_*`), copié
 * à l'identique — aucune information inventée. La page Aide reste servie par
 * i18n ; ce seed alimente la base que le chatbot interroge (GET /api/faq/ et
 * moteur à règles de POST /api/faq/ask).
 *
 * Les valeurs mg reprennent la mention « TODO: à valider par un locuteur
 * natif » conformément à la convention du projet (IMPLEMENTATION.md §5).
 *
 * Idempotent : n'écrit que si la collection est VIDE. Dès qu'un administrateur
 * a édité la FAQ via /admin/faq, le seed ne s'exécute plus jamais.
 */
const FAQ_SEED: Array<{
  ordre: number;
  question: Record<string, string>;
  reponse: Record<string, string>;
}> = [
  {
    ordre: 1,
    question: {
      fr: 'Comment trouver un document ?',
      en: 'How do I find a document?',
      mg: 'Ahoana ny fahitana antontan-taratasy?',
    },
    reponse: {
      fr: "Ouvrez « Recherche » dans le menu (ou utilisez le raccourci « / » ou Ctrl+K). Tapez un mot-clé, un numéro ou choisissez un critère : objet, type, date, numéro ou Journal Officiel. Vous pouvez aussi affiner avec les filtres (type, domaine, statut juridique) ou naviguer par thème via « Accès par thème » dans le menu.",
      en: "Open “Search” in the menu (or use the “/” or Ctrl+K shortcut). Type a keyword, a number or pick a criterion: subject, type, date, number or Official Gazette. You can also refine with the filters (type, domain, legal status) or browse by theme via “Browse by theme” in the menu.",
      mg: "Sokafy ny « Fikarohana » ao amin'ny menio (na ampiasao ny fanalana « / » na Ctrl+K). Soraty teny fanalahidy, laharana na safidiocriteria : lohahevitra, karazana, daty, laharana na Gazetim-Pirenena. Azonao atao koa ny manitsy amin'ny sivana (karazana, sehatra, sata ara-dalàna) na mitety araka lohahevitra amin'ny « Fidirana araka lohahevitra » ao amin'ny menio.",
    },
  },
  {
    ordre: 2,
    question: {
      fr: 'Que signifient les statuts « En vigueur », « Abrogé », « Modifié » ?',
      en: 'What do the statuses “In force”, “Repealed”, “Amended” mean?',
      mg: "Inona no dikan'ny sata « Mihatra », « Nofoanana », « Novaina » ?",
    },
    reponse: {
      fr: "« En vigueur » : le texte est applicable en l'état. « Abrogé » : le texte a été officiellement supprimé et n'est plus applicable. « Modifié » : le texte reste en vigueur mais a été changé par un texte postérieur — consultez ses relations juridiques pour voir les textes qui le modifient.",
      en: "“In force”: the text is applicable as it stands. “Repealed”: the text has been officially removed and no longer applies. “Amended”: the text remains in force but has been changed by a later text — check its legal relations to see the amending texts.",
      mg: "« Mihatra » : mihatra araka izay ao ny lahatsoratra. « Nofoanana » : voafoana ofisialy ny lahatsoratra ary tsy mihatra intsony. « Novaina » : mbola mihatra ny lahatsoratra nefa novain'ny lahatsoratra taty aoriana — jereo ny fifandraisana ara-dalàna mba hahitana ireo lahatsoratra manova.",
    },
  },
  {
    ordre: 3,
    question: {
      fr: "Comment accéder au texte intégral d'un document ?",
      en: 'How do I access the full text of a document?',
      mg: "Ahoana ny fidirana amin'ny lahatsoratra feno?",
    },
    reponse: {
      fr: "Depuis la liste des résultats, cliquez sur un document pour ouvrir sa fiche détaillée. Vous y trouverez le résumé en langage clair, ses références (numéro, date, Journal Officiel) et le fichier PDF original consultable et téléchargeable.",
      en: 'From the results list, click a document to open its detailed record. You will find the plain-language summary, its references (number, date, Official Gazette) and the original PDF file, viewable and downloadable.',
      mg: "Avy amin'ny lisitr'ireo valiny, tsindrio antontan-taratasy hanokafana ny antsipiriany. Hita ao ny famintinana amin'ny fiteny tsotra, ny mari-pamantarana (laharana, daty, Gazetim-Pirenena) ary ny rakitra PDF tany am-boalohany azo jerena sy azo ampidinina.",
    },
  },
  {
    ordre: 4,
    question: {
      fr: 'Comment recevoir les alertes de publication ?',
      en: 'How do I receive publication alerts?',
      mg: 'Ahoana ny fandefasana fampandrenesana?',
    },
    reponse: {
      fr: "Rendez-vous dans la section « S'abonner aux alertes de publication » (page d'accueil ou pied de page), saisissez votre adresse email puis validez. Un email de confirmation vous sera envoyé pour activer l'abonnement. Vous pourrez vous désabonner à tout moment depuis le lien présent dans chaque email.",
      en: 'Go to the “Subscribe to publication alerts” section (home page or footer), enter your email address and confirm. A confirmation email will be sent to activate the subscription. You can unsubscribe at any time using the link in every email.',
      mg: "Mandehana any amin'ny « Misoratra anarana amin'ny fampandrenesana » (pejy fototra na tongotra), ampidiro ny mailakao avy eo hamafiso. Handefasana mailaka fanamarinana hanetsika ny famandrihana. Azo atao ny miala amin'ny famandrihana isaky ny fotoana amin'ny rohy ao amin'ny mailaka tsirairay.",
    },
  },
  {
    ordre: 5,
    question: {
      fr: "Comment noter l'application ou faire une remarque ?",
      en: 'How do I rate the application or leave a comment?',
      mg: 'Ahoana ny fanombana ny rindranasa na ny fanehoana hevitra?',
    },
    reponse: {
      fr: "Pour noter l'application, utilisez les étoiles dans la section « Notez notre application » en bas de la page d'accueil (une seule note par navigateur). Pour une suggestion ou un signalement, cliquez sur « Remarques » dans le pied de page : votre message est transmis aux administrateurs.",
      en: 'To rate the application, use the stars in the “Rate our application” section at the bottom of the home page (one rating per browser). For a suggestion or a report, click “Comments” in the footer: your message is sent to the administrators.',
      mg: "Raha hanombana ny rindranasa, ampiasao ny kintana ao amin'ny « Manombana ny rindranasa » eo ambany amin'ny pejy fototra (isa iray isaky ny navigateur). Raha soso-kevitra na tatitra, tsindrio « Hevitra » ao amin'ny tongotra: alefa amin'ny mpitantana ny hafatrao.",
    },
  },
  {
    ordre: 6,
    question: {
      fr: 'Comment contacter le ministère ?',
      en: 'How do I contact the ministry?',
      mg: "Ahoana ny fifandraisana amin'ny ministera?",
    },
    reponse: {
      fr: "Les coordonnées officielles (adresse, téléphone, email) du Ministère du Travail, de l'Emploi et de la Fonction Publique et des Lois Sociales sont regroupées dans la rubrique « Contacts » du pied de page, ainsi que sur la page Organigramme qui présente les directions et leurs rôles.",
      en: 'The official contact details (address, phone, email) of the Ministry of Labour, Employment and Public Service and Social Laws are grouped in the “Contacts” section of the footer, as well as on the Organisation page presenting the directorates and their roles.',
      mg: "Ireo antontomaso aterineto (adiresy, finday, mailaka) ao amin'ny Ministeran'ny Asa, ny Fampiasana sy ny Fitondrana Etre-Pahavinta ary ny Lalàna Sosialy dia voaangona ao amin'ny « Fifandraisana » ao amin'ny tongotra, sy ao amin'ny pejin'ny Fandaminana miseo ny sampana sy ny andraikiny.",
    },
  },
  {
    ordre: 7,
    // Question ajoutée pour répondre aux demandes du type « c'est quoi cette
    // application » — contenu repris de la page « À propos » (seedAPropos) :
    // citation exacte du décret n°2024-055 art. 2 + présentation officielle.
    question: {
      fr: "C'est quoi cette application ou cette app ? (À propos de l'application)",
      en: 'What is this application or this app? (About)',
      mg: "Inona ity rindranasa ity na ity app ity? (Mombamomba)",
    },
    reponse: {
      fr: "Cette application est la bibliothèque numérique du Ministère du Travail, de l'Emploi et de la Fonction Publique : elle donne accès aux textes réglementaires, à l'organigramme, aux actualités et aux statistiques de consultation du ministère. Le décret n°2024-055 du 20 janvier 2024 (article 2) charge le Ministre de la conception, de la mise en œuvre et du suivi de l'application de la Politique du Gouvernement en matière de Travail, Emploi et Fonction Publique. Pour plus de détails, consultez la page « À propos ».",
      en: "This application is the digital library of the Ministry of Labour, Employment and Public Service: it provides access to regulatory texts, the organisation chart, news and consultation statistics. Decree No. 2024-055 of 20 January 2024 (article 2) assigns the Minister responsibility for designing, implementing and monitoring the Government's policy on Labour, Employment and Public Service. For more details, see the “About” page.",
      mg: "Ity rindranasa ity no tranomboky nomerika amin'ny Ministeran'ny Asa, ny Fampiasana sy ny Fitondrana Etre-Pahavinta: manome fahafahana hiditra amin'ny lahatsoratra ara-dalàna, ny fandaminana, ny vaovao ary ny antontan'isa fijerena. Ny dekreti n°2024-055 (20 janaro 2024, lahara 2) dia mampitra ny Minisitra amin'ny famolavolana, ny fampihatra ary ny fanaraha-maso ny politikan'ny Fivavahana momba ny Asa, ny Fampiasana ary ny Fitondrana Etre-Pahavinta. Hampidiro any amin'ny pejy « Mombamomba » raha te-hahalala bebe kokoa ianao.",
    },
  },
];

const FAQ_UID = 'api::faq.faq';

/**
 * Seed de la FAQ du chatbot — exécuté au boot si (et seulement si) la
 * collection est vide (cf. commentaire sur FAQ_SEED).
 */
const seedFaq = async (strapi: Core.Strapi) => {
  const documents = strapi.documents as any;

  let existing: any[] = [];
  try {
    existing = (await documents(FAQ_UID).findMany({ locale: 'fr', limit: 1 })) as any[];
  } catch (err) {
    strapi.log.warn(`[seed] FAQ : lecture impossible (${(err as Error).message})`);
    return;
  }
  if (existing.length > 0) return; // déjà peuplée (admin ou seed précédent)

  const LOCALES = ['fr', 'en', 'mg'] as const;
  let created = 0;
  for (const entry of FAQ_SEED) {
    try {
      const fr = (await documents(FAQ_UID).create({
        locale: 'fr',
        data: {
          question: entry.question.fr,
          reponse: entry.reponse.fr,
          ordre: entry.ordre,
        } as any,
      })) as any;
      for (const locale of LOCALES.slice(1)) {
        await documents(FAQ_UID).update({
          documentId: fr.documentId,
          locale,
          data: {
            question: entry.question[locale],
            reponse: entry.reponse[locale],
          } as any,
        });
      }
      created += 1;
    } catch (err) {
      strapi.log.warn(
        `[seed] FAQ : entrée « ${entry.question.fr} » ignorée (${(err as Error).message})`
      );
    }
  }
  if (created > 0) {
    strapi.log.info(`[seed] FAQ chatbot : ${created}/${FAQ_SEED.length} entrées créées (fr + en + mg)`);
  }
};

const A_PROPOS_FR = {
  titre: 'À propos',
  // Citation exacte — décret n°2024-055 du 20 janvier 2024, article 2.
  mission:
    "<p>Le Ministre du Travail, de l'Emploi et de la Fonction Publique est chargé de la conception, de la mise en œuvre et du suivi de l'application de la Politique du Gouvernement en matière de Travail, d'Emploi et de la Fonction Publique.</p>",
  // TODO: à valider par la Direction de la Communication
  presentation_application:
    "<p>Cette application est une bibliothèque numérique donnant accès aux textes réglementaires, à l'organigramme, aux actualités et aux démarches en ligne du ministère.</p>",
  // Champs de contact et liens utiles (valeurs de placeholder à valider par le ministère)
  contact_email: 'contact@ministere.gov.mg',
  contact_telephone: '+261 20 22 XXX XXX',
  contact_adresse: 'Antananarivo, Madagascar',
  liens_utiles: [
    {
      libelle: 'Site officiel du gouvernement',
      url: 'https://www.gov.mg',
    },
    {
      libelle: 'Portail des services publics',
      url: 'https://www.service-public.gov.mg',
    },
  ],
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
  /**
   * register() : extensions de code (avant init).
   */
  register(_args: { strapi: Core.Strapi }) {
    // Plus d'extension enregistrée : la règle métier des démarches
    // (registerDemarcheLifecycle) a été supprimée avec les démarches.
  },

  /**
   * bootstrap() : seeds idempotents.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await seedAPropos(strapi);
    await seedFaq(strapi);
  },
};