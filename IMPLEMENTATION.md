# IMPLEMENTATION — Page institutionnelle « À propos »

Page publique `/a-propos` présentant la bibliothèque numérique du MTeFOP :
mission du ministère, cadre légal, présentation de l'application, contacts et
liens utiles — **entièrement éditable par un administrateur via le panneau
Strapi, sans toucher au code**. Aucune image sur cette page (texte + icônes).

## 1. Contenu éditorial (source de vérité)

- **Mission** : citation exacte du décret n°2024-055 du 20 janvier 2024,
  article 2 — « Le Ministre du Travail, de l'Emploi et de la Fonction Publique
  est chargé de la conception, de la mise en œuvre et du suivi de l'application
  de la Politique du Gouvernement en matière de Travail, d'Emploi et de la
  Fonction Publique. » (encart `<blockquote>` avec la référence de l'article 2).
- **Présentation de l'application** : bibliothèque numérique donnant accès aux
  textes réglementaires, à l'organigramme, aux actualités et aux démarches en
  ligne du ministère.
- **document_legal** : relation (oneToOne) vers le content-type `document` —
  le seed lie automatiquement le document n°2024-055 s'il existe en base.
- **contacts / liens_utiles** : laissés vides (aucune donnée officielle fournie
  à ce jour) — à compléter dans le panneau d'administration.

## 2. Fichiers

| Fichier | Rôle |
|---|---|
| `strapi-backend/src/api/a-propos/**` | Single Type `api::a-propos.a-propos` (déjà existant, conservé tel quel) + composant répétable `components.liens.lien` (libellé localisé / url partagé) |
| `strapi-backend/src/index.ts` | `seedAPropos()` : seed **idempotent** au boot (ne crée que si l'entrée fr n'existe pas — les modifications admin sont préservées) ; crée les localisations en/mg (titre traduit, contenu éditorial vide) et lie `document_legal` au décret n°2024-055 ; si l'entrée existe déjà mais que la relation est vide, elle est **complétée** dès que le décret est importé (une relation déjà renseignée n'est jamais modifiée) |
| `strapi-backend/scripts/assign-permissions.ts` | Ajout de `api::a-propos.a-propos.find` aux actions **Public** (le routeur core d'un Single Type n'expose que `find`/`update`/`delete`) |
| `front/src/components/AProposPage.jsx` | Page publique : fetch `/api/a-propos?locale=xx&populate=*`, parsing Strapi 5 (champs à plat, plus d'`.attributes`), repli champ par champ sur le **fr**, sections sémantiques (h1 → h2), `document.title`, aucune image |
| `front/src/App.jsx` | Route publique `/a-propos` |
| `front/src/components/Menu.jsx` | Liens « À propos » → `/a-propos` (desktop + mobile, visiteur **et** connecté) ; l'ancien lien pointait vers `/animated` |
| `front/src/components/Footer.jsx` | Lien « À propos » dans la rangée Aide / Transparence / À propos |
| `front/src/locales/{fr,en,mg}/translation.json` | Clés `footer.a_propos` + compléments `apropos.*` (les libellés d'interface uniquement ; le contenu éditorial vient de l'API) |

## 3. À vérifier dans le panneau d'administration Strapi

1. **Rôles & Permissions → Public → « A propos »** : cocher `find`
   (lecture seule). Équivalent en ligne de commande :

   ```bash
   cd strapi-backend
   npx tsc scripts/assign-permissions.ts --outDir .tmp-scripts --module CommonJS \
     --moduleResolution Node --esModuleInterop --skipLibCheck
   node .tmp-scripts/assign-permissions.js --apply   # idempotent
   ```

   Le rôle **Administrateur** reçoit automatiquement toutes les actions
   (lecture + édition). Le rôle **Authenticated** hérite de `find` via la
   liste Public du script — aucune écriture n'est accordée aux rôles non
   administrateurs.

2. **Settings → Internationalisation** : vérifier que les locales **fr**
   (locale par défaut), **en** et **mg** sont actives (déjà posées par
   `scripts/migrate-data.ts`, décision D1).

3. **Content Manager → « A propos »** : vérifier le contenu pré-rempli (fr),
   compléter les variantes en/mg (les champs vides retombent sur le français
   côté front), renseigner `contact_email` / `contact_telephone` /
   `contact_adresse` et les `liens_utiles`.

4. **Relation `document_legal`** : le seed lie automatiquement le document
   n°2024-055 dès qu'il est présent en base, et complète la relation à un boot
   ultérieur si elle est encore vide. Si le décret n'est pas encore importé,
   sélectionner le document manuellement dans le Content Manager (le seed ne
   crée jamais le document lui-même : aucune donnée inventée).
   ⚠️ Le lien « Consulter le texte » n'est rendu que si la notice est à
   `etat_notice = "validee"` (règle P1 : les brouillons renvoient 404 au
   public) ; sinon la page affiche la référence sans lien cliquable.

## 4. Vérifications techniques

```bash
cd strapi-backend && npx tsc --noEmit      # types backend
cd front && npm run build                  # build Vite/PWA
```

## 5. TODO (à valider par le ministère)

- [ ] **Direction de la Communication** : texte de présentation de
      l'application (placeholder générique en fr, cf. `A_PROPOS_FR` dans
      `src/index.ts`).
- [ ] **Locuteur natif malgache** : valeurs mg marquées
      `TODO: à valider par un locuteur natif` dans
      `front/src/locales/mg/translation.json` (clés `apropos.article2_source`,
      `apropos.document_en_attente`).
- [ ] Renseigner les contacts officiels du ministère et les liens utiles
      (ex. site du gouvernement) dans le panneau d'administration.
- [ ] Passer la notice du décret n°2024-055 à `etat_notice = "validee"` pour
      activer le lien vers la fiche `/documents/:id`.
