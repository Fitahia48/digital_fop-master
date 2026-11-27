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
   Le lien « Consulter le texte » est rendu dès que la relation
   `document_legal` est renseignée (toute notice est publique).

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

## 6. E-mails — configuration Gmail SMTP locale et test

### 6.1 Variables (`.env` dans `strapi-backend/.env`, jamais commité)

Copier `strapi-backend/.env.example` puis renseigner l'**option B** :

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre.adresse@gmail.com      # alias acceptés : EMAIL_USER / EMAIL_PASSWORD
SMTP_PASS=mot-de-passe-application     # sans espaces
FRONTEND_URL=http://localhost:5173     # base des liens des e-mails + origine CORS
```

**Les 3 pièges Gmail :**
1. **Validation en 2 étapes** active + **mot de passe d'application** (compte
   Google → Sécurité → Validation en 2 étapes → Mots de passe d'application),
   saisi **sans espaces**. Le mot de passe normal est refusé (erreur **535**).
2. **Redémarrage obligatoire** : Strapi lit `.env` au démarrage seulement.
   Au ligne, vérifier le message d'état : `✅ Mailer ACTIF : envoi via
   smtp.gmail.com:587 en tant que j***@…` ou
   `⚠️ Mailer INACTIF : variable(s) manquante(s) : …` (noms précis, adresse
   masquée, mot de passe jamais affiché).
3. **FRONTEND_URL** construit les liens (confirmation, désabonnement, fiches).
   Sans elle, les liens pointent sur `http://localhost:5173`.

### 6.2 Test d'envoi rejouable (une seule adresse, celle donnée en argument)

```bash
cd strapi-backend
npx tsc scripts/test-mail.ts --outDir .tmp-scripts --module CommonJS \
  --moduleResolution Node --esModuleInterop --skipLibCheck
node .tmp-scripts/scripts/test-mail.js --to=adresse-a-tester@gmail.com --lang=fr
```

Codes de sortie : `0` = envoyé, `2` = échec (la cause est expliquée : 535 →
mot de passe d'application, connexion refusée/timeout → port 587 peut-être
bloqué, essayer `SMTP_PORT=465` + `SMTP_SECURE=true`, quota Gmail dépassé →
réessayer plus tard). Le script n'utilise que la configuration SMTP réelle du
`.env` et ne vise **que** l'adresse passée en argument.

### 6.3 Tester les liens des e-mails depuis un autre appareil

`localhost` ne fonctionne que sur la machine qui héberge l'application. Pour
un téléphone ou un autre ordinateur : (a) **même réseau local** →
`FRONTEND_URL=http://<ip-locale>:5173`, lancer Vite exposé
(`npm run dev -- --host`), ajouter cette origine dans la liste CORS de
`strapi-backend/config/middlewares.ts` et vérifier que l'API (port 1337) est
joignable depuis l'appareil ; (b) **hors réseau** → un tunnel (Cloudflare
Tunnel, ngrok) ou un vrai hébergement, puis `FRONTEND_URL` sur l'URL publique.
L'API doit être joignable depuis l'appareil dans tous les cas (CORS + port).

### 6.4 Espace admin « Abonnés » (`/admin/abonnes`)

| Fichier | Rôle |
|---|---|
| `strapi-backend/src/api/subscriber/routes/subscriber-custom.ts` | 3 routes **auth requises** (pas de `auth:false`) : `GET /api/subscribers/admin/list`, `GET /api/subscribers/admin/export`, `DELETE /api/subscribers/admin/:id` |
| `strapi-backend/src/api/subscriber/controllers/subscriber.ts` | `adminList` / `adminExport` / `adminDelete` — **contrôle admin dans le contrôleur** via `isAdminCtx` (401 sans jeton, 403 si non-admin), même pattern que `statistics` / `transparence`. `adminList` : `search` (email, insensible à la casse), `statut` (tous\|confirmes\|en_attente), `langue` (fr\|en\|mg), `sort` (date_desc\|date_asc\|email_asc), `page`, `page_size` (défaut 20, **max 100**) → `{ data, meta: { total, page, page_size, page_count }, counters: { total, confirmes, en_attente, par_langue } }`. **Aucun jeton (`confirm_token` / `unsubscribe_token`) n'est renvoyé.** `adminExport` : CSV `;` + BOM UTF-8, protection injection de formule (`=`/`+`/`-`/`@` → `'`), borné à 1000 lignes. `adminDelete` : journalise avec `maskEmail` (`t***@…`), jamais l'e-mail en clair |
| `strapi-backend/scripts/assign-permissions.ts` | **`subscriber.create` retiré de `PUBLIC_ACTIONS`** (voir §6.5) |
| `front/src/components/AdminSubscribers.jsx` | Page `/admin/abonnes` : vérification admin autonome (`/api/v1/auth/users/me/`), compteurs, recherche debounce 300 ms, filtres statut/langue, tri, tableau (cartes sur mobile), suppression avec modale, export CSV, pagination, états vide/erreur, `aria-live`, `th scope` |
| `front/src/App.jsx` | Route `/admin/abonnes` sous `ProtectedRoute` (comme `/admin/remarks`) |
| `front/src/components/Menu.jsx` | Lien « Abonnés » (`menu.abonnes_admin`) avec drapeau `adminOnly` — visible uniquement pour l'admin, reste de la barre inchangé |
| `front/src/locales/{fr,en}/translation.json` | Section `abonnes.*` + `menu.abonnes_admin` (**mg : non inventé — repli fr, libellés listés « à valider »**) |

```bash
# Vérifier les refus (anonyme) :
curl -i http://localhost:1337/api/subscribers/admin/list        # → 403
curl -i http://localhost:1337/api/subscribers/                 # → 403 (CRUD core)
```

### 6.5 Permissions Subscriber — correction de faille

**Avant** : `api::subscriber.subscriber.create` était activé pour `Public` ET
`Authenticated` → n'importe qui pouvait appeler le CRUD core
`POST /api/subscribers` avec `is_confirmed: true` et ses propres tokens
(contournement de la double confirmation).

**Après** (`node .tmp-scripts/assign-permissions.js --apply`) : **aucune** action
`api::subscriber.*` n'est liée à `Public` / `Authenticated` — seul le rôle
`Administrateur` les détient (y compris les nouveaux handlers `adminList`,
`adminExport`, `adminDelete`). Les parcours publics ne sont PAS impactés : ils
passent par les routes custom `auth: false` (`subscribe`, `confirm`,
`unsubscribe`) qui ne demandent aucune permission.

Pour rejouer après ajout de routes :

```bash
cd strapi-backend
npx tsc scripts/assign-permissions.ts --outDir .tmp-scripts --module CommonJS \
  --moduleResolution Node --esModuleInterop --skipLibCheck
node .tmp-scripts/assign-permissions.js --dry   # aperçu
node .tmp-scripts/assign-permissions.js --apply # application (redémarrer Strapi ensuite)
```

### 6.6 Contrat d'honnêteté de `POST /api/subscribers/subscribe`

La réponse porte toujours `detail` (phrase), `code` (machine) et
`email_sent` (booléen). `email_sent: false` (codes `CONFIRMATION_EMAIL_FAILED`
ou `MAILER_DISABLED`) signifie : l'abonné **est enregistré (non confirmé)** mais
le mail n'est **pas** parti — `SubscribeForm.jsx` affiche alors un avertissement
("…n'a pas pu être envoyé, réessayez plus tard") au lieu de « vérifiez votre
boîte mail ». Un nouvel essai régénère le jeton et renvoie le mail.

## 7. Comptage anonyme des visites et consultations — « 1 visiteur = 1 par jour »

### 7.1 Règle métier

- **Visite de l'application** : un visiteur anonyme est compté **1 fois par
  jour**, quel que soit le nombre de pages ou de rafraîchissements.
- **Consultation d'un texte** (et d'un **corps professionnel**) : 1 visiteur =
  1 comptage **par texte et par jour** ; consulter un autre texte le même jour
  compte pour cet autre texte.
- **Jour = fuseau `Indian/Antananarivo` (UTC+3)**, jamais la date UTC : helper
  unique `src/utils/dates.ts#dateJourMadagascar`, appelé par
  `src/utils/visitor-id.ts#jourCourant()` (comptage, statistiques, purge).
  `src/utils/analytics.ts` (bornes de mois/année et « daily ») utilise
  désormais le même helper (corrigeait un jour UTC entre 00 h et 03 h).
- **Téléchargements : inchangés.** Signalement sans modification :
  `POST /api/documents/:id/telechargement` et `/api/corps/:id/telechargement`
  incrémentent à chaque appel, sans limite ni déduplication (même problème que
  l'ancien comptage des consultations) — décision attendue du commanditaire.
- **Anciens cumuls conservés tels quels** (`documents.visits`,
  `corps.visits`, `daily_stats.total_visits`) : ils contiennent des DOUBLONS
  (chaque ouverture comptait). Un « recalcul en visiteurs distincts » est
  **impossible** faute de données : aucun horodatage par consultation dans
  l'historique. Les nouveaux comptages s'y ajoutent, ils ne les remplacent pas.

### 7.2 Variables d'environnement (`.env.example`)

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `VISITOR_HASH_SECRET` | Secret du HMAC-SHA256 des empreintes (>= 16 caractères). En production, sans lui le comptage est **refusé** (message clair en console) ; en développement, un secret éphémère est généré + avertissement | absent |
| `TRUST_PROXY` | `true` uniquement derrière **un reverse-proxy/tunnel de confiance** : l'empreinte utilise alors la 1re adresse du `X-Forwarded-For`. `false` (défaut) : IP de la connexion, l'en-tête est ignoré (donc non falsifiable) | `false` |
| `VISITOR_RETENTION_DAYS` | Rétention des empreintes détaillées, en jours | `35` |
| `VISITOR_JOUR_FIXE` | **Test uniquement** (ignoré en production) : force le jour de comptage pour simuler le passage de minuit | absent |

### 7.3 Tables analytiques (hors content-types, migration idempotente)

- `database/migrations/20261021130000-create-visiteur-analytics-tables.js` :
  - `visites_visiteurs(jour, visiteur_hash, created_at)` —
    **UNIQUE (jour, visiteur_hash)** ;
  - `consultations_visiteurs(jour, visiteur_hash, type_cible, cible_id,
    created_at)` — **UNIQUE (jour, visiteur_hash, type_cible, cible_id)** +
    index `(type_cible, cible_id)` ;
  - `totaux_jour(jour PRIMARY KEY, visiteurs, consultations)` — historique
    **jamais purgé**, amorcé (additif, `ON CONFLICT DO NOTHING`) depuis
    `daily_stats` pour ne pas casser les séries existantes.
- Unicité garantie par la **base** : `INSERT … ON CONFLICT DO NOTHING` puis
  lecture du nombre de lignes réellement insérées (`changes` sous sqlite,
  `rowCount` sous postgres) ; seuls les NOUVEAUX enregistrements incrémentent
  `documents.visits` / `corps.visits` / `totaux_jour`, en **une seule opération
  SQL atomique** (`SET visits = visits + 1`, pas de lecture-écriture).
- **Rétention** : purge quotidienne (au démarrage puis toutes les 24 h) des
  empreintes de plus de `VISITOR_RETENTION_DAYS` (35) jours — le journal ne
  contient que des compteurs et une date limite, jamais d'empreinte ni d'IP
  (`src/index.ts#planifierPurgeEmpreintes`).

### 7.4 Points d'entrée

- `POST /api/visites/ping` (public, réponse `{ counted: boolean }`, jamais
  bloquante, limitation de débit en mémoire) — appelé **une seule fois au
  montage** de l'application par `front/src/App.jsx` (garde anti React.StrictMode),
  erreurs ignorées silencieusement.
- `POST /api/documents/:id/visit` et `POST /api/corps/:id/visit` : 1 comptage
  par visiteur / texte (ou corps) / jour.
- `src/middlewares/track-visit.ts` ne gère **plus que la présence temps réel**
  (`visitor_presence`, compteur admin « en ligne ») — plus aucun comptage par GET.
- `GET /api/visit-statistics` (admin, verrou inchangé) : `visits_today` =
  **visiteurs distincts du jour** ; séries = `totaux_jour` (visiteurs) +
  `daily_stats` (ouvertures). Noms de champs d'API **inchangés**.

### 7.5 Limites connues (assumées ou à corriger plus tard)

- **Plusieurs personnes derrière une même IP (NAT / CGNAT opérateur) comptent
  pour UN visiteur** — limite propre à l'identification par IP seule (option A
  validée : un changement de navigateur ne crée pas un faux visiteur).
- Empreinte IPv6 ramenée au préfixe **/64** ; IPv4 mappée (`::ffff:`) normalisée.
- Robots : liste courte de User-Agents (`bot`, `crawler`, `curl`, `wget`,
  `headless`, …) + chemins de santé, dans `src/utils/visitor-id.ts`.
- Détection des lignes insérées vérifiée sur sqlite (local) ; si un dialecte
  renvoie un résultat inconnu, le comptage préfère **ne pas** compter
  (sous-comptage plutôt que sur-comptage).
- En production derrière un proxy : `TRUST_PROXY=true` **et** proxy unique en
  amont, sinon l'IP vue est celle du proxy (tous les visiteurs fusionneraient).

### 7.6 Historique `visits` (IP en clair) — traitement en 3 étapes

```bash
cd strapi-backend
node scripts/visits-history.mjs export            # 1. export CSV (réalisé le 21/10/2026, .tmp-scripts/, ignoré par git)
node scripts/visits-history.mjs aggregate --apply  # 2. totaux/jour (COUNT DISTINCT ip) — ACCORD EXPLICITE REQUIS
node scripts/visits-history.mjs anonymize --apply  # 3. ip_address / user_agent = NULL — ACCORD EXPLICITE REQUIS
```

Sans `--apply`, les étapes 2 et 3 sont des dry-runs (aperçu à l'écran).
L'anonymisation refuse de s'exécuter si aucun export n'existe.

### 7.7 Confidentialité affichée et conformité

- Page « À propos » (`front/src/components/AProposPage.jsx`, clés
  `apropos.anonymat_titre` / `apropos.anonymat_visites`) : « Nous comptons les
  visites de façon anonyme : votre adresse IP n'est pas conservée, seule une
  empreinte irréversible valable un jour est utilisée. » — traduit fr/en ;
  **libellé malgache marqué « TODO: à valider par un locuteur natif »**
  (convention du projet §5).
- Mises à jour des mentions `transparence.anonymat` /
  `transparence.engagement_texte` et de l'aide `stats.consultations_aide_2`.
- **À FAIRE VALIDER avec votre encadrant** : la conformité du dispositif avec
  la loi malgache sur la protection des données personnelles. Ce document ne
  l'affirme pas.
