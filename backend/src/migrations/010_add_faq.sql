-- 010_add_faq.sql
-- FAQ dynamique multilingue (F9 — chatbot / FAQ dynamique).
-- Chaque question/réponse existe dans les 3 langues ; le front choisit la colonne
-- selon la langue active, avec repli sur _fr si la traduction est vide.
-- Idempotente : table IF NOT EXISTS et seed uniquement si la table est vide.

CREATE TABLE IF NOT EXISTS faq (
  id           SERIAL PRIMARY KEY,
  question_fr  TEXT NOT NULL,
  question_en  TEXT,
  question_mg  TEXT,
  reponse_fr   TEXT NOT NULL,
  reponse_en   TEXT,
  reponse_mg   TEXT,
  categorie    VARCHAR(100),
  ordre        INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faq_ordre ON faq (ordre, id);

-- Seed initial : reprend la FAQ statique affichée sur la page /aide.
-- Ne s'exécute que sur une table vide (idempotent).
INSERT INTO faq (question_fr, question_en, question_mg, reponse_fr, reponse_en, reponse_mg, categorie, ordre)
SELECT *
FROM (VALUES
  (
    $q1fr$Comment trouver un document ?$q1fr$,
    $q1en$How do I find a document?$q1en$,
    $q1mg$Ahoana ny fahitana antontan-taratasy?$q1mg$,
    $r1fr$Ouvrez « Recherche » dans le menu (ou utilisez le raccourci « / » ou Ctrl+K). Tapez un mot-clé, un numéro ou choisissez un critère : objet, type, date, numéro ou Journal Officiel. Vous pouvez aussi affiner avec les filtres (type, domaine, statut juridique) ou naviguer par thème via « Accès par thème » dans le menu.$r1fr$,
    $r1en$Open “Search” in the menu (or use the “/” or Ctrl+K shortcut). Type a keyword, a number or pick a criterion: subject, type, date, number or Official Gazette. You can also refine with the filters (type, domain, legal status) or browse by theme via “Browse by theme” in the menu.$r1en$,
    $r1mg$Sokafy ny « Fikarohana » ao amin'ny menio (na ampiasao ny fanalana « / » na Ctrl+K). Soraty teny fanalahidy, laharana na safidio ny fepetra: lohahevitra, karazana, daty, laharana na Gazetim-Pirenena. Azonao atao koa ny manitsy amin'ny sivana na mitety araka lohahevitra. TODO: à valider par un locuteur natif.$r1mg$,
    'recherche', 1
  ),
  (
    $q2fr$Que signifient les statuts « En vigueur », « Abrogé », « Modifié » ?$q2fr$,
    $q2en$What do the statuses “In force”, “Repealed”, “Amended” mean?$q2en$,
    $q2mg$Inona no dikan'ny sata « Mihatra », « Nofoanana », « Novaina » ?$q2mg$,
    $r2fr$« En vigueur » : le texte est applicable en l'état. « Abrogé » : le texte a été officiellement supprimé et n'est plus applicable. « Modifié » : le texte reste en vigueur mais a été changé par un texte postérieur — consultez ses relations juridiques pour voir les textes qui le modifient.$r2fr$,
    $r2en$“In force”: the text is applicable as it stands. “Repealed”: the text has been officially removed and no longer applies. “Amended”: the text remains in force but has been changed by a later text — check its legal relations to see the amending texts.$r2en$,
    $r2mg$« Mihatra » : mihatra araka izay ao ny lahatsoratra. « Nofoanana » : voafoana ofisialy ny lahatsoratra ary tsy mihatra intsony. « Novaina » : mbola mihatra nefa novain'ny lahatsoratra taty aoriana. TODO: à valider par un locuteur natif.$r2mg$,
    'statuts', 2
  ),
  (
    $q3fr$Comment accéder au texte intégral d'un document ?$q3fr$,
    $q3en$How do I access the full text of a document?$q3en$,
    $q3mg$Ahoana ny fidirana amin'ny lahatsoratra feno?$q3mg$,
    $r3fr$Depuis la liste des résultats, cliquez sur un document pour ouvrir sa fiche détaillée. Vous y trouverez le résumé en langage clair, ses références (numéro, date, Journal Officiel) et le fichier PDF original consultable et téléchargeable.$r3fr$,
    $r3en$From the results list, click a document to open its detailed record. You will find the plain-language summary, its references (number, date, Official Gazette) and the original PDF file, viewable and downloadable.$r3en$,
    $r3mg$Avy amin'ny lisitr'ireo valiny, tsindrio ny antontan-taratasy hanokafana ny antsipiriany. Hita ao ny famintinana, ny mari-pamantarana ary ny rakitra PDF azo jerena sy ampidinina. TODO: à valider par un locuteur natif.$r3mg$,
    'documents', 3
  ),
  (
    $q4fr$Comment recevoir les alertes de publication ?$q4fr$,
    $q4en$How do I receive publication alerts?$q4en$,
    $q4mg$Ahoana ny fandefasana fampandrenesana?$q4mg$,
    $r4fr$Rendez-vous dans la section « S'abonner aux alertes de publication » (page d'accueil ou pied de page), saisissez votre adresse email puis validez. Un email de confirmation vous sera envoyé pour activer l'abonnement. Vous pourrez vous désabonner à tout moment depuis le lien présent dans chaque email.$r4fr$,
    $r4en$Go to the “Subscribe to publication alerts” section (home page or footer), enter your email address and confirm. A confirmation email will be sent to activate the subscription. You can unsubscribe at any time using the link in every email.$r4en$,
    $r4mg$Mandehana any amin'ny « Misoratra anarana amin'ny fampandrenesana », ampidiro ny mailakao ary hamafiso. Handefasana mailaka fanamarinana hanetsika ny famandrihana. Azo atao ny miala amin'ny famandrihana amin'ny rohy ao amin'ny mailaka. TODO: à valider par un locuteur natif.$r4mg$,
    'alertes', 4
  ),
  (
    $q5fr$Comment noter l'application ou faire une remarque ?$q5fr$,
    $q5en$How do I rate the application or leave a comment?$q5en$,
    $q5mg$Ahoana ny fanombana ny rindranasa na ny fanehoana hevitra?$q5mg$,
    $r5fr$Pour noter l'application, utilisez les étoiles dans la section « Notez notre application » en bas de la page d'accueil (une seule note par navigateur). Pour une suggestion ou un signalement, cliquez sur « Remarques » dans le pied de page : votre message est transmis aux administrateurs.$r5fr$,
    $r5en$To rate the application, use the stars in the “Rate our application” section at the bottom of the home page (one rating per browser). For a suggestion or a report, click “Comments” in the footer: your message is sent to the administrators.$r5en$,
    $r5mg$Raha hanombana ny rindranasa, ampiasao ny kintana eo ambany amin'ny pejy fototra. Raha soso-kevitra na tatitra, tsindrio « Hevitra » ao amin'ny tongotra. TODO: à valider par un locuteur natif.$r5mg$,
    'feedback', 5
  ),
  (
    $q6fr$Comment contacter le ministère ?$q6fr$,
    $q6en$How do I contact the ministry?$q6en$,
    $q6mg$Ahoana ny fifandraisana amin'ny ministera?$q6mg$,
    $r6fr$Les coordonnées officielles (adresse, téléphone, email) du Ministère du Travail, de l'Emploi et de la Fonction Publique et des Lois Sociales sont regroupées dans la rubrique « Contacts » du pied de page, ainsi que sur la page Organigramme qui présente les directions et leurs rôles.$r6fr$,
    $r6en$The official contact details (address, phone, email) of the Ministry of Labour, Employment and Public Service and Social Laws are grouped in the “Contacts” section of the footer, as well as on the Organisation page presenting the directorates and their roles.$r6en$,
    $r6mg$Ireo antontomaso (adiresy, finday, mailaka) dia voaangona ao amin'ny « Fifandraisana » ao amin'ny tongotra, sy ao amin'ny pejin'ny Fandaminana. TODO: à valider par un locuteur natif.$r6mg$,
    'contact', 6
  )
) AS v(question_fr, question_en, question_mg, reponse_fr, reponse_en, reponse_mg, categorie, ordre)
WHERE NOT EXISTS (SELECT 1 FROM faq);
