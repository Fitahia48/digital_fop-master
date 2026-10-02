# Migration Express.js → Strapi 5 — Journal

> Backend cible : `strapi-backend/` (Strapi 5, TypeScript), même PostgreSQL, front React/Vite conservé.
> Le dossier `backend/` reste en référence jusqu'à la bascule complète validée.

## Statut global

| Étape | État |
|---|---|
| 0. Audit du schéma réel (`backend/src/`) | ✅ fait (re-vérifié : migrations + routes + controllers) |
| 1. Validation du mapping table → content-type | ✅ validé |
| 2. Init `strapi-backend/` | ✅ fait — **connexion PostgreSQL validée par un boot réel** |
| 3. Content-types | ✅ fait — 16 content-types (3a–3j) tous bootés et validés sur postgres |
| 4. Auth (Users & Permissions) + migration users | ✅ users migrés (5) + hash conservés + permissions rôles (Public 32 / Auth 52 / Admin 116) |
| 5. Logique custom (search, transparence, lifecycles mail) | ✅ fait — **boot + tests API de bout en bout** (détail en fin de document) |
| 6. Migration des données | ✅ **appliquée sur la base dev (2026-09-28)** — compteurs legacy = `strapi_*` vérifiés (médias non téléversés : fichiers absents du disque) |
| 7. Adaptation frontend | ✅ fait — front branché sur Strapi via routes legacy-compat (`:1337`), auth `/api/v1/auth/*` via `auth-compat`, logout porté |

Aucune ligne de code Strapi n'est écrite tant que l'étape 1 n'est pas validée.

---

## 1. Inventaire des tables réellement présentes (lu depuis les migrations)

Sources : `backend/migrations/init.sql`, `backend/migrations/002_add_legal_lifecycle.sql`,
`backend/src/migrations/003…010`. Un `009_*` est absent (pas un trou fonctionnel : la
numérotation saute de 008 à 010).

### 1.1 Tables métier

**`users`** — `id`, `nom`, `prenom`, `email` (unique), `password`, `is_staff`, `is_superuser`,
`is_active`, `date_joined`, `langue_preferee` (fr/en/mg, mig. 008).
→ Mots de passe hashés **bcryptjs** (`auth.controller.js`, `bcrypt.hash(password, 12)`).

**`auth_tokens`** — `id`, `user_id`(→users), `token`, `created_at`. Refresh tokens maison.

**`domaines`** — `id`, `nom` (unique).

**`documents`** — `id`, `type`, `objet`, `numero`, `date`, `conseil` (déf. `Autre`),
`domaine_id`(→domaines), `fichier`, `pdf_file`, `status` (déf. `en_vigueur`),
`date_entree_vigueur`, `last_modified_by`(→users), `last_modified_at`, `modification_details`,
`inclus_journal`, `date_journal`, `numero_journal`, `page_journal`, `visits`, `telechargements`,
`resume_simplifie` (mig. 004, **un seul champ, pas de variantes _fr/_en/_mg**).
Contrainte : `status IN ('en_vigueur','abrogé','modifié','abroge','modifie')` (valeurs accentuées
legacy encore autorisées).

**`document_relations`** — `id`, `document_source_id`(→documents), `document_cible_id`(→documents),
`type_relation` (`modifie`/`abroge`/`complete`), `date_creation`. Contraintes : unicité du triplet,
pas d'auto-relation.

**`actualites`** — `id`, `conseil` (déf. `CONSEIL DES MINISTRES`), `titre`, `date`, `lieu`,
`texte`, `categorie` (`actualite`/`offre`/`nouveaute`).

**`remarks`** — `id`, `email`, `message`, `created_at`. (Remarques usagers, admin peut lister/suppr.)

**`type_corps`** — `id`, `nom` (unique).

**`corps`** — `id`, `nom`, `numero` (unique), `description`, `type_id`(→type_corps),
`date_creation`, `status` (texte libre ; `actif`/`inactif` via endpoint dédié), `fichier`,
`pdf_file`, `visits`, `telechargements`.

**`organigramme`** — `id`, `nom`, `poste`, `service` (déf. `Cabinet`), `parent_id`(→organigramme,
self-relation), `ordre`, `actif`.
→ **`corps` et `organigramme` sont deux tables distinctes**, la structure n'est pas fusionnée.

**`subscribers`** — `id`, `email` (unique), `is_confirmed`, `unsubscribe_token`, `confirm_token`,
`created_at`, `langue_preferee`.

**`demarches`** — `id`, `user_id`(→users), `type_demarche` (`copie_certifiee`/`attestation`/
`demande_information`/`autre`), `objet`, `document_id`(→documents, nullable), `statut`
(`soumise`/`en_cours`/`traitee`/`rejetee`), `commentaire_admin`, `created_at`, `updated_at`.

**`demarche_pieces_jointes`** — `id`, `demarche_id`(→demarches), `fichier`, `uploaded_at`.

**`demarche_timeline`** — `id`, `demarche_id`(→demarches), `statut`, `commentaire`,
`modifie_par`(→users, nullable), `created_at`. **Journal append-only** (jamais UPDATE/DELETE).

**`favoris`** — `id`, `user_id`(→users), `document_id`(→documents), `created_at`.
Unicité (user, document).

**`historique_recherche`** — `id`, `user_id`(→users), `terme_recherche`, `created_at`.

**`faq`** — `id`, `question_fr`, `question_en`, `question_mg`, `reponse_fr`, `reponse_en`,
`reponse_mg`, `categorie`, `ordre`, `created_at`. FR obligatoire (repli).

### 1.2 Tables techniques / analytiques (pas des ressources éditoriales)

| Table | Rôle | Remplaçable par Strapi ? |
|---|---|---|
| `visits` | comptage visites (middleware global) | ❌ log brut → à garder hors content-type |
| `document_stats` / `corps_stats` | compteurs daily/monthly/yearly | ❌ agrégats → SQL custom ou table dédiée |
| `api_quota_usage` | quota journalier Google PSE | ❌ état technique |
| `auth_tokens` | refresh tokens maison | ✅ supprimé (géré par U&P Strapi) |
| `schema_migrations` | suivi des migrations SQL | ✅ n/a |

---

## 2. Mapping proposé table → content-type Strapi

| Table SQL | Content-type Strapi (API id) | Type | Notes |
|---|---|---|---|
| `documents` | `document` | collectionType | `status` en **enumeration** (`en_vigueur`/`abroge`/`modifie`, on normalise les valeurs accentuées) |
| `domaines` | `domaine` | collectionType | relation 1-N depuis `document` |
| `document_relations` | `document-relation` | collectionType | 2 relations vers `document` + enum `type_relation` (voir décision D4) |
| `actualites` | `actualite` | collectionType | `categorie` en enumeration (`actualite`/`offre`/`nouveaute`) |
| `corps` + `type_corps` | `corps` + `type-corps` | collectionType | `status` enum `actif`/`inactif` ; relation N-1 vers `type-corps` |
| `organigramme` | `organigramme` | collectionType | self-relation `parent` |
| `demarches` | `demarche` | collectionType | enum `statut`; relation user (U&P), relation document, 1-N pieces_jointes et timeline |
| `demarche_pieces_jointes` | `demarche-piece-jointe` | collectionType | champ media + relation demarche |
| `demarche_timeline` | `demarche-timeline` | collectionType | relation demarche ; **API create-only** (voir D3) |
| `favoris` | `favori` | collectionType | relations user (U&P) + document, unicité (user, document) |
| `historique_recherche` | `historique-recherche` | collectionType | relation user ; création serveur uniquement |
| `subscribers` | `subscriber` | collectionType | `is_confirmed`, `confirm_token`, `unsubscribe_token`, `langue_preferee` |
| `faq` | `faq` | collectionType | i18n ou 3 champs (voir D1) |
| `users` | plugin `users-permissions` | — | script `migrate-users.ts` (bcrypt ↔ Strapi : voir D5) |
| `remarks` | `remark` | collectionType | **confirmé** : routé dans `documents.routes.js` (`GET/POST /api/remarks/`, `DELETE` admin), CRUD dans `documents.controller.js` |
| `app_ratings` | `app-rating` | collectionType | **confirmé** : `apprating.routes.js` (`/submit-rating/`, `/app-ratings/`, `/average-rating/`, `/total-stars/`) |

### Champs → types Strapi (extraits clés)

**`document`** : `type` texte court, `objet` text (requis), `numero` texte (requis, indexé),
`date` date (requis), `conseil` texte (déf. Autre), `domaine` relation N-1, `fichier` media,
`pdf_file` media, `status` enumeration, `date_entree_vigueur` date, `last_modified_by` relation
user (U&P), `last_modified_at` datetime, `modification_details` text, `inclus_journal` booléen,
`date_journal` date, `numero_journal` texte, `page_journal` texte, `visits` integer,
`telechargements` integer, `resume_simplifie` text (voir D6).

**`demarche`** : `type_demarche` enumeration, `objet` text, `user` relation user (U&P),
`document` relation N-1 (nullable), `statut` enumeration, `commentaire_admin` text.

---

## 3. Décisions à valider avant toute création

- **D1 — FAQ : i18n natif Strapi vs 3 champs texte.** Recommandation : **i18n natif**
  (un `faq` localisé fr/en/mg, `categorie`/`ordre` non localisés). Meilleure intégration
  Content-Type Builder + API `?locale=`, évite 6 champs dupliqués. Contrepartie : le repli
  « si traduction vide → fr » change de logique (Strapi retombe sur la locale par défaut).
- **D2 — Périmètre.** `corps`/`type_corps`, `actualites`, `remarks`, `app_ratings`, `visits`
  existent bel et bien dans le code mais ne figuraient pas tous dans ta liste. Les inclure ?
- **D3 — Timeline append-only.** Empêcher update/delete via permissions Strapi (create only)
  et/ou lifecycle `beforeUpdate`/`beforeDelete` qui lève une erreur.
- **D4 — Relations document.** En Strapi, une relation ne porte pas de champ `type_relation`.
  Recommandation : content-type dédié `document-relation` (2 relations document + enum).
- **D5 — Mots de passe.** bcryptjs (12 rounds) : Strapi utilise aussi bcrypt mais préfixe/paramètres
  à vérifier. Si incompatible → forcer réinitialisation au 1er login (ne pas casser l'auth en silence).
- **D6 — `resume_simplifie`.** La migration réelle 004 ne crée **qu'un seul** champ texte
  (pas de `_fr/_en/_mg` contrairement à l'hypothèse). Le garder monolingue ?
- **D7 — Tables analytiques** (`visits`, `*_stats`, `api_quota_usage`) : les laisser hors Strapi
  (accès SQL direct / service custom) plutôt que d'en faire des content-types ?
- **D8 — Statuts accentués legacy** (`abrogé`, `modifié`) : normaliser vers `abroge`/`modifie`
  pendant la migration ?

---

## 4. Journal des décisions validées

| # | Décision | Validé le |
|---|---|---|
| Mapping | **Périmètre complet** : tous les content-types listés en §2 sont créés (y compris `remark` et `app-rating`). | 2026-09-23 |
| D1 | **FAQ : i18n natif Strapi.** Un content-type `faq` localisé fr/en/mg ; `question`/`reponse` localisés, `categorie`/`ordre` partagés. Le repli « traduction vide → FR » est désormais porté par la locale par défaut Strapi. | 2026-09-23 |
| D3 | **Timeline : permissions API uniquement.** Content-type `demarche-timeline` exposé en **create-only** via les permissions Users & Permissions ; pas de lifecycle garde-fou. | 2026-09-23 |
| D6 | **`resume_simplifie` reste monolingue** (un seul champ texte, conforme à la migration 004 réelle). | 2026-09-23 |
| D8 | **Statuts accentués normalisés** : `abrogé`→`abroge`, `modifié`→`modifie` pendant la migration de données. Enumeration Strapi : `en_vigueur`/`abroge`/`modifie`. | 2026-09-23 |

### Étape 4 — Auth (Users & Permissions) + migration users ✅ (users)

**D5 tranché — mots de passe compatibles, hash legacy conservés.** L'ancien backend et Strapi 5
utilisent **la même lib `bcryptjs`**. Les hash legacy sont des chaînes `$2a$12$` (60 chars)
vérifiées en base ; `bcrypt.compare` côté Strapi (`plugin-users-permissions user.service
validatePassword(password, hash)`) les accepte tel quel → **les usagers gardent leur mot de passe,
aucun reset**. Décision actée 2026-09-23 (option « conserver les hash legacy »).

**Pièges techniques relevés (importants) :**
1. **`schema.json` d'extension = REMPLACEMENT, pas fusion.** Strapi 5 fait un merge superficiel
   (`{...schemaPlugin, ...schemaExtension}` dans `core/dist/loaders/plugins/index.js`
   `applyUserExtension`) → l'attribut `attributes` de notre extension d'`user` **écrasait**
   entièrement celui du plugin (perte de `username`, `email`, `password`, `confirmed`, `blocked`,
   `role`…). Fix : reprendre **tous** les attributs de base U&P dans l'extension
   (`src/extensions/users-permissions/content-types/user/schema.json`).
   À ré-appliquer pour toute future extension de content-type plugin.
2. **Le Document Service re-hash `type:'password'`.** Toute string passée à un attribut password
   via `strapi.documents()` est re-hashée (`core/dist/services/document-service/attributes/
   transforms.js`). Impossible d'injecter un hash legacy par ce chemin.
3. **Contournement : couche bas-niveau `strapi.db.query(uid).create()`.** (Le pattern utilisé par
   U&P lui-même pour créer ses rôles.) Il **n'applique pas** le rehash (password = simple string au
   niveau DB) et **génère automatiquement le `documentId`** (`transform-content-types-to-models.mjs`
   `default: createDocumentId`). → Injection directe du hash legacy, **sans SQL brut ni reset**.
4. **Script one-shot Strapi** : `compileStrapi()` → `createStrapi(appContext).load()` … `destroy()`
   (pattern de `strapi/dist/src/cli/commands/console.mjs`). Le projet étant CJS, compiler le script
   d'abord (`npx tsc scripts/x.ts --outDir .tmp-scripts --module CommonJS --moduleResolution Node
   --esModuleInterop --skipLibCheck`) puis `node .tmp-scripts/x.js` (le `.ts` direct est interprété
   ESM par Node 24 → échec `ERR_UNSUPPORTED_DIR_IMPORT` sur `lodash/fp`).
5. `pg` requiert des types : déclaration locale minimale `scripts/pg.d.ts` (pas de `@types/pg`)
   pour la compilation du script.

**Script `strapi-backend/scripts/migrate-users.ts`** (exécuté, réexécutable — idempotent par email) :
- Pool `pg` → lit `users` legacy (id, nom, prenom, email, password, is_staff, is_superuser,
  is_active, date_joined, langue_preferee).
- Crée le rôle U&P **« Administrateur »** (si absent) via `roleService.createRole` + permissions
  `getActions({ defaultEnable: true })`.
- Pour chaque user : skip si email déjà dans `up_users` ; injecte
  `strapi.db.query('plugin::users-permissions.user').create({ data: { username: email, email,
  provider: 'local', password: <hash legacy>, confirmed: is_active, blocked: false, role,
  nom, prenom, langue_preferee } })`.
- Mapping : `is_staff || is_superuser` → Administrateur, sinon Authenticated.
- CLI : `--dry-run` par défaut (affiche le plan), `--apply` pour écrire.

**Résultat `--apply` (2026-09-23, base dev)** : rôle « Administrateur » créé (id 3) ; 5 users
migrés (`admin@digitalfop.mg`, `admin@test.com`, `admin.test@mtefop.mg` → Administrateur ;
`user.test@mtefop.mg`, `noperm.test@mtefop.mg` → Authenticated). Hash `$2a$12$` conservés à
l'identique, `confirmed=true`, `blocked=false`, `provider=local`. Colonnes `up_users` complétées
par le boot (username, email, password, confirmed, blocked, provider + table de liens
`up_users_role_lnk`).

**Login validé de bout en bout** via le service U&P (`validatePassword`) :
`user.test@mtefop.mg` + `TestUser2026!` → true ; mauvais mot de passe → false ;
`admin.test@mtefop.mg` + `TestAdmin2026!` → true. La table `users` legacy est **intacte**.

**Permissions rôles (script `scripts/assign-permissions.ts`, exécuté 2026-09-23)** : matrice d'accès
relevée depuis le legacy (analyse des routes/middlewares `backend/src/routes` + `middleware/auth.js` :
`authenticate`, `optionalAuthenticate`, `isAdmin`). Le service U&P `role.updateRole(id, { permissions })`
**remplace** exactement les permissions actives du rôle (diff old/new) → le script reconstruit les
listes complètes (auth de base + content-api), l'Admin n'est pas touché.

- **Public (32 actions)** : lectures `find`/`findOne` sur document, domaine, document-relation,
  actualite, corps, type-corps, organigramme, faq ; création publique remark (POST remarque anonyme),
  app-rating (soumission note), subscriber (subscribe) ; upload find/findOne ; auth publiques
  (register, callback/login, refresh, forgot/resetPassword, emailConfirmation…).
- **Authenticated (52 actions)** : tout le Public + auth connectée (me, logout, changePassword,
  getSessions, revokeSession) + données personnelles `demarche` (create/find/findOne),
  `demarche-piece-jointe` (create/find/findOne), `demarche-timeline` (**create-only, D3**),
  `favori` (create/find/findOne/delete), `historique-recherche` (create/find/findOne), upload.upload.
- **Administrateur (116 actions, inchangé)** : CRUD complet sur tous les content-types + users/roles.
- **Ownership** (user ne voit que SES démarches/favoris, timeline propriétaire ou admin) → étape 5
  (lifecycles/controllers), conforme D3/D7.

**Restant étape 4** : modalités connexion/logout côté API (endpoints `/api/auth/local` U&P vs routes
maison) — relèvera de l'étape 7 (adaptation front) — et création éventuelle d'un compte admin Strapi.

---

- Projet créé avec `create-strapi@latest strapi-backend --typescript --use-npm --no-run --skip-cloud --skip-db`
  (le `--quickstart=false` du brief n'est pas un flag valide en Strapi 5 ; `--skip-db` évite toute saisie
  interactive de mot de passe). Version Strapi : **5.54.0**.
- `postgres` branché : `config/database.ts` lit désormais **`DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`**
  (les mêmes que `backend/src/config/db.js`), `DATABASE_CLIENT=postgres`.
  `strapi-backend/.env` reprend ces variables depuis `backend/.env` (les valeurs secrètes n'ont jamais transité
  par le chat : extraction shell directe fichier → fichier).
- Driver **`pg`** ajouté aux dépendances (nécessaire pour le client postgres de Strapi 5).
- `strapi-backend/.gitignore` ajouté (build, `.tmp`, `.env`, `node_modules`).
- **Boot de validation réussi** : Strapi s'est connecté à PostgreSQL, a exécuté ses migrations internes
  (tables système `strapi_*`, `admin_users`, `up_*` créées — aucune table métier touchée) et a servi l'API
  sur `http://localhost:1337` (réponse Strapi formatée vérifiée). Instance arrêtée après test.
  Commandes de démarrage : `npm run develop` (normal) ; pour un boot sans compiler l'admin :
  `npx strapi develop --no-watch-admin --no-build-admin`.
- **Piège rencontré (noté pour info)** : npm 11.17 avait laissé `node_modules/@types/express` **vide**
  (c'est un *peer optionnel* de `jwks-rsa`, non rempli par npm). TypeScript tentait malgré tout de le charger
  implicitement → `error TS2688: Cannot find type definition file for 'express'`. **Fix : supprimer le dossier
  vide** (ne pas installer `@types/express`, il n'est pas requis).

⚠️ **Risque de collision de noms de tables (important pour l'étape 3).** Strapi 5 crée une table SQL par
content-type en se basant sur son champ `collectionName`, **pas** sur l'API id. Si on nomme le content-type
`document` avec `collectionName: "documents"`, Strapi voudrait gérer la table `documents` existante et pourrait
la faire migrer/modifier. **Stratégie retenue : préfixer tous les `collectionName` (`strapi_documents`,
`strapi_demarches`, …)** pour que Strapi crée ses propres tables et ne touche jamais les tables métier
Express/PostgreSQL. Les données seront copiées table legacy → table Strapi à l'étape 6.

### Décisions restant à trancher

- **D2** — périmètre : ✅ tranché (complet) ci-dessus.
- **D4** — relations document : content-type dédié `document-relation` (2 relations + enum). Validé par le périmètre complet.
- **D5** — mots de passe bcryptjs ↔ Strapi : à confirmer techniquement à l'étape 4.
- **D7** — tables analytiques (`visits`, `*_stats`, `api_quota_usage`) laissées **hors Strapi** (accès SQL/service custom). Validé par le périmètre complet.

---

## 5. Étape 3 — content-types (en cours)

### 3a. `domaine` + `document` + extension `user` U&P ✅

Fichiers créés dans `strapi-backend/src/` :
- `api/domaine/content-types/domaine/schema.json` — `collectionName: strapi_domaines`, champ `nom` (req, unique), relation 1-N `documents`.
- `api/document/content-types/document/schema.json` — `collectionName: strapi_documents`.
  Colonnes SQL `documents` mappées : `type` (string req), `objet` (text req, indexé), `numero`
  (string req, indexé), `date` (date req), `conseil` (string déf. `Autre`), `domaine`
  (relation N-1 vers `domaine`), `fichier`/`pdf_file` (media), `status` (enumeration
  `en_vigueur`/`abroge`/`modifie` déf. `en_vigueur`), `date_entree_vigueur` (date),
  `last_modified_by` (relation N-1 vers user U&P), `last_modified_at` (datetime),
  `modification_details` (text), `inclus_journal` (bool déf. false), `date_journal`,
  `numero_journal`, `page_journal` (string), `visits`/`telechargements` (integer déf. 0),
  `resume_simplifie` (text monolongue, D6). `draftAndPublish: false`.
- `extensions/users-permissions/content-types/user/schema.json` — ajout de `nom`, `prenom`,
  `langue_preferee` (enumeration fr/en/mg) + relation inverse `documents_modified`.

**Validation** : boot `npx strapi develop --no-watch-admin --no-build-admin` ✅ sur postgres —
schémas chargés, tables `strapi_domaines` / `strapi_documents` créées, aucune table métier
legacy modifiée.

⚠️ **Point d'attention** : le `.env` retrouvé pointait vers `DATABASE_CLIENT=sqlite` (probablement
réécrit par un boot de test ultérieur). Rebascule en `postgres` opérée et re-validée. À surveiller :
ne pas relancer un `create-strapi`/`setup` qui réinitialiserait le client.

**Ordre de création** : `document` référence des types créés plus tard (`document-relation`,
`demarche`) → Strapi ne boote pas si la cible d'une relation n'existe pas. Stratégie : on crée
dans l'ordre des dépendances et on n'ajoute les relations « vers l'avant » qu'au moment où la
cible existe. Les relations `relations_source`/`relations_cible`/`demarches` de `document`
seront ajoutées aux étapes 3b et 3f.

### 3b. `document-relation` ✅

- `api/document-relation/content-types/document-relation/schema.json` —
  `collectionName: strapi_document_relations`. Mappage SQL `document_relations` :
  `document_source` (relation N-1 → `document`, inverse `relations_source`),
  `document_cible` (relation N-1 → `document`, inverse `relations_cible`),
  `type_relation` (enumeration `modifie`/`abroge`/`complete`, requis), `date_creation`
  (datetime). Relations inverses `relations_source`/`relations_cible` ajoutées sur `document`.
- Validation boot ✅ postgres.

⚠️ Les contraintes SQL `UNIQUE (source, cible, type)` et `source != cible` ne sont pas
exprimables par `schema.json` Strapi → garde-fou à prévoir en lifecycle (`beforeCreate`) lors de
l'étape de logique custom si on veut les préserver à l'écriture.

### 3c. `actualite` ✅

- `api/actualite/content-types/actualite/schema.json` — `collectionName: strapi_actualites`.
  Mappage SQL `actualites` : `conseil` (string déf. `CONSEIL DES MINISTRES`), `titre`
  (string req), `date` (date), `lieu` (string req), `texte` (text req — **text brut, pas
  richtext**, fidèle à la colonne TEXT legacy et au rendu front actuel), `categorie`
  (enumeration `actualite`/`offre`/`nouveaute` déf. `actualite`).
- Validation boot ✅ postgres.

### 3d. `type-corps` + `corps` ✅

- `api/type-corps/content-types/type-corps/schema.json` — `collectionName: strapi_type_corps`,
  `nom` (string req unique), relation 1-N `corps`. **pluralName `types-corps`** (le singulier
  `type-corps` et le pluriel ne doivent pas être identiques — contrainte Strapi).
- `api/corps/content-types/corps/schema.json` — `collectionName: strapi_corps`. Mappage SQL
  `corps` : `nom`, `numero` (string req unique), `description` (text req), `type`
  (relation N-1 → `type-corps`), `date_creation` (date req), `status`
  (enumeration `actif`/`inactif`), `fichier`/`pdf_file` (media), `visits`/`telechargements`
  (integer déf. 0).
- ⚠️ **Décision nommage** : Strapi 5 exige `singularName ≠ pluralName` (validation d'unicité) →
  or « corps » est invariable en français. **`corps` → pluralName `organismes`**. L'URL legacy
  `/api/corps/` devra être adaptée côté front ou exposée via une route custom (étape 7).
- Validation boot ✅ postgres (échec initial `The plural name "corps" should be unique` corrigé).

### 3e. `organigramme` ✅

- `api/organigramme/content-types/organigramme/schema.json` — `collectionName: strapi_organigramme`.
  Mappage SQL `organigramme` : `nom` (req), `poste` (req), `service` (déf. `Cabinet`), self-relation
  hiérarchique `parent` (manyToOne, nom Strapi `parent` ↔ inverse `enfants`), `ordre` (integer déf. 0),
  `actif` (boolean déf. true).
- Validation boot ✅ postgres.

### 3f. `demarche` + `demarche-piece-jointe` + `demarche-timeline` ✅

- `api/demarche` — `collectionName: strapi_demarches`. `type_demarche` (enumeration
  `copie_certifiee`/`attestation`/`demande_information`/`autre`), `objet` (text req), `user`
  (relation N-1 → user U&P), `document` (relation N-1 → `document`, nullable), `statut`
  (enumeration `soumise`/`en_cours`/`traitee`/`rejetee` déf. `soumise`), `commentaire_admin`
  (text), relation 1-N `pieces_jointes` et 1-N `timeline`. Relation `demarches` ajoutée sur
  `document`.
- `api/demarche-piece-jointe` — `collectionName: strapi_demarche_pieces_jointes`. `demarche`
  (relation N-1), `fichier` (media, req), `uploaded_at` (datetime).
- `api/demarche-timeline` — `collectionName: strapi_demarche_timeline`. `demarche` (relation N-1),
  `statut` (enumeration req), `commentaire` (text), `modifie_par` (relation N-1 → user U&P).
  ⚠️ **`created_at` SQL supprimé du schéma** : Strapi gère déjà une colonne système `created_at`
  (le champ manuel entrait en collision SQL `la colonne « created_at » est spécifiée plus d'une fois`).
  Le timestamp legacy `demarche_timeline.created_at` sera mappé sur le `createdAt` Strapi pendant la
  migration de données (étape 6).
- Extension user U&P : relations inverses `demarches` et `timeline_edits` ajoutées.
- Validation boot ✅ postgres.

### 3g. `favori` + `historique-recherche` ✅

- `api/favori` — `collectionName: strapi_favoris`. `user` (relation N-1 → user U&P), `document`
  (relation N-1 → `document`). ⚠️ Champs `created_at` SQL retirés (collision colonne système Strapi,
  cf. 3f) → le timestamp legacy sera mappé sur `createdAt` à l'étape 6. Unicité (user, document) :
  garde-fou à prévoir (étape 5).
- `api/historique-recherche` — `collectionName: strapi_historique_recherche`. `user` (relation N-1 →
  user U&P), `terme_recherche` (string req), `created_at` retiré (idem).
- Relations inverses ajoutées : `user.favoris`, `user.historique_recherches`, `document.favoris`.
- Validation boot ✅ postgres.

### 3h. `subscriber` ✅

- `api/subscriber` — `collectionName: strapi_subscribers`. `email` (email req unique), `is_confirmed`
  (boolean déf. false), `unsubscribe_token` (string unique), `confirm_token` (string unique),
  `langue_preferee` (enumeration fr/en/mg déf. fr). `created_at` retiré (collision système Strapi).
- Validation boot ✅ postgres.

### 3i. `faq` (i18n natif, D1) ✅

- **Plugin i18n** : en Strapi 5, la traduction est un **plugin interne toujours activé**
  (`@strapi/i18n` dans les `INTERNAL_PLUGINS` du core — pas d'installation supplémentaire).
- `api/faq` — `collectionName: strapi_faqs`, `pluginOptions: { i18n: { localized: true } }`.
  `question`/`reponse` (text req, **localisés**), `categorie` (string, **non localisé**),
  `ordre` (integer déf. 0, **non localisé**). Mapping SQL : `question_fr/en/mg` et `reponse_fr/en/mg`
  deviennent des traductions du même champ ; `categorie`/`ordre` restent partagés.
- ⚠️ En migration (étape 6) : chaque FAQ legacy devra être créée dans la locale **fr**, puis les
  traductions en/en mg attachées via `?locale=`. Le repli « traduction vide → fr » est porté par la
  locale par défaut Strapi (D1).
- Validation boot ✅ postgres (localisation effective constatée via le boot de création de table).

### 3j. `remark` + `app-rating` ✅

- `api/remark` — `collectionName: strapi_remarks`. `email` (email req), `message` (text req).
- `api/app-rating` — `collectionName: strapi_app_ratings`. `stars` (integer req, min 1 max 5),
  `session_id` (string req). `created_at` géré par Strapi.
- Validation boot ✅ postgres.

## Étape 3 — Bilan ✅

16 content-types créés via schema.json (tous `draftAndPublish: false`, `collectionName` préfixé
`strapi_` pour ne jamais toucher les tables legacy) :
`domaine`, `document`, `document-relation`, `actualite`, `type-corps` (+pluriel `types-corps`),
`corps` (+pluriel `organismes`), `organigramme`, `demarche`, `demarche-piece-jointe`,
`demarche-timeline`, `favori`, `historique-recherche`, `subscriber`, `faq` (i18n), `remark`,
`app-rating`. + extension content-type `user` U&P (`nom`, `prenom`, `langue_preferee` et relations
inverses).

Vérification SQL finale : toutes les tables `strapi_*` présentes en base ; tables métier legacy
(`documents`, `users`, `demarches`, …) **intactes** — aucune migration/altération par Strapi.

Rappels pour la suite :
- Permissions & rôles : `demarche-timeline` en create-only (D3), favoris, etc.
- Garde-fous lifecycle : unicité favori (user, document), unicité document-relation + pas d'auto-relation.
- Logique custom : search, transparence, emails (mailer.js → hooks afterCreate/afterUpdate).

---

## Étape 5 — Logique custom ✅ (portage complète + validation réelle)

Toute la logique métier du backend Express est portée dans `strapi-backend/src/`
et **exposée aux URLs legacy** (décision : routes custom Strapi reprenant les chemins
de `backend/src/routes/`, pour ne rien changer côté front).

### Endpoints custom portés

| Legacy | Strapi (même URL) | Fichier |
|---|---|---|
| `POST /api/search` (+ historique) | idem + `GET /api/search/history` | `api/search` |
| `GET /api/transparence/stats/` | idem | `api/transparence` |
| `GET /api/visit-statistics/` | idem | `api/statistics` |
| `GET /api/most-visited/`, `/api/document-stats/`, `/api/documents-stats/`, `/api/suggestions/` | idem + variantes `/documents/...` | `api/document/controllers/document.ts` |
| `POST /api/documents/:id/visit/\|telechargement/`, `PATCH /api/documents/:id/status/` | idem | idem |
| `GET /api/corps-filter/`, `/api/corps-professionnels/`, `/api/most-visited-corps/`, `/api/corps-stats/`, `/api/corps-stats1/` | idem | `api/corps` |
| `POST /api/corps/:id/visit/\|telechargement/`, `PATCH /api/corps/:id/update_status/` | idem | idem |
| `POST/GET /api/favoris/`, `DELETE /api/favoris/:id/` | idem | `api/favori` (core désactivé) |
| `GET /api/demarches/` (admin, `?statut=`), `/mine/`, `/:id/timeline/`, `PATCH /:id/status/` | idem | `api/demarche` |
| `POST /api/faq/ask/` | idem | `api/faq` |
| `POST /api/send-response/` (admin) | idem (+ `/api/remarks/send-response`) | `api/remark` |
| `GET /api/app-ratings/average_rating/`, `/total_stars/` | idem (+ variantes tiretées) | `api/app-rating` |
| `POST /api/subscribers/subscribe/`, `GET /confirm/:token/`, `/unsubscribe/:token/` | idem | `api/subscriber` |

Les réponses conservent la **forme legacy** (`{ count, results }`, snake_case,
`created_at`, `usager_*`, `document_numero`, `nb_pieces_jointes`, médias en URL)
→ `MesFavoris.jsx`, `MesDemarches.jsx`, `AdminDemarches.jsx`, `DemarcheTimelineModal.jsx`
fonctionnent sans modification.

### Comptage des visites

Nouveau middleware global `src/middlewares/track-visit.ts` (référencé
`global::track-visit` dans `config/middlewares.ts`) : portage exact de `trackVisit`
(GET uniquement, exclusions visit-statistics/suggestions/app-ratings/media/*.css…).
La table analytique `visits` reste **hors Strapi** (D7, SQL direct).

### Emails & lifecycle

`src/utils/mailer.ts` + `src/utils/email-templates.ts` (gabarits FR/EN/MG copiés
depuis `backend/src/templates`) ; hooks `afterCreate` sur `document` et `actualite`
→ notification des abonnés confirmés ; email de changement de statut d'une démarche
et de réponse à une remarque.

### Permissions

`scripts/assign-permissions.ts` mis à jour :
- Public **32** actions (inchangé) ;
- Authenticated **54** actions : ajout des handlers custom `demarche.mine`,
  `demarche.timeline`, `favori.addFavori/myFavoris/removeFavori`,
  `search.getSearchHistory` ; suppression des routes core `favori.*` (désormais
  désactivées au profit des routes custom avec contrôle de propriété) ;
- **Administrateur : toutes les actions** réactivées (`getActions({defaultEnable:true})`)
  — les handlers custom (stats admin, `updateStatus`, `sendResponse`…) n'étaient
  pas couverts par l'attribution initiale. Exécution : `--apply` (idempotent).

`isAdminUser` (`src/utils/errors.ts`) teste désormais aussi le **nom** du rôle
(le rôle custom « Administrateur » peut avoir `type` vide selon la version).

### Bugs corrigés pendant la validation (importants)

1. **Contrôleurs sans `export default`** (`search`, `transparence`, `statistics`) :
   Strapi ne charge un contrôleur que via l'export par défaut (`importDefault`).
   Sans lui, le boot échouait : *« Error creating endpoint POST /search: Cannot
   read properties of undefined (reading 'webSearch') »*. Export par défaut ajouté.
2. **Forme des relations dans les lifecycles** : dans `beforeCreate`, `data.user` /
   `data.document` peuvent arriver sous forme `{ set: [...] }` → le filtre
   `{ id: <objet> }` levait *« Invalid key set at user »*. Helper
   `src/utils/relations.ts` (`extractRelationRef`, `relationFilter`) et garde-fous
   `favori` / `document-relation` réécrits.
3. **Id numérique vs `documentId`** : le front legacy appelle les routes avec
   l'**id numérique** (`/documents/12/visit/`), pas le `documentId` Strapi.
   Helper `src/utils/by-ref.ts` (`findOneByRef`) utilisé par les contrôleurs
   document, corps, favori et démarche.
4. **Collision de routes favori** : les routes core `/favoris` (GET/POST/DELETE)
   doublonnaient les routes custom legacy → core désactivé (`only: []`).

### Validation (boot réel + tests API)

- Boot `npx strapi develop --no-build-admin --no-watch-admin` ✅ (postgres,
  « Strapi started successfully », aucune erreur de route).
- Tests exécutés : login U&P user/admin ; `GET/POST/DELETE /api/favoris`
  (forme legacy + idempotence) ; `POST /api/demarches` (forme legacy) ;
  `GET /api/demarches/mine/`, `GET /api/demarches/` (admin, `usager_*`),
  `GET /api/demarches/:id/timeline/` (2 entrées append-only) ;
  `PATCH /api/demarches/:id/status/` ; `POST /api/documents/:id/visit|telechargement`
  (compteurs incrémentés) + `PATCH /api/documents/:id/status/` (statut normalisé) ;
  `POST /api/corps/:id/visit|telechargement` + `PATCH /api/corps/:id/update_status/` ;
  `GET /api/visit-statistics` (admin) ; `GET /api/search/history` ;
  endpoints publics transparence / corps-stats / suggestions / most-visited (200).
- Reste à l'étape 7 : adapter les URLs **CRUD core** (`/api/organismes` → `/api/corps`,
  `/api/typecorps`, `/api/v1/auth/*` → U&P, corps `{data,meta}` → `{count,results}`)
  et brancher le front sur `http://localhost:1337`.

---

## Étape 6 — Migration des données (script prêt, `--apply` à exécuter)

**Script `strapi-backend/scripts/migrate-data.ts`** (compilé comme migrate-users.ts, cf. pièges
étape 4 — point 4) : copie les 16 tables métier legacy vers les tables Strapi `strapi_*`,
dans l'ordre des dépendances (domaines → documents → document-relations → … → faq).

### Fonctionnement

- **Écriture via `strapi.db.query(uid).create()`** (couche bas-niveau, même choix que
  migrate-users.ts) : les lifecycles DB sont désactivés pendant la migration via
  **`app.db.lifecycles.disable()`** (mécanisme officiel `@strapi/database`,
  `lifecycles/index.js`) →
  **aucun email aux abonnés** (hooks `afterCreate` document/actualite) ni garde-fou
  bloquant (unicité favori / document-relation : déjà garantie côté legacy — contrainte SQL
  `UNIQUE (user_id, document_id)` et triplet relation). Contrepartie assumée : le subscriber
  timestamps est désactivé aussi → le script fournit `createdAt`/`updatedAt` explicitement
  (timestamps legacy conservés).
- **Médias** : fichiers de `backend/media/documents/` téléversés via le service upload
  officiel (`strapi.plugin('upload').service('upload').upload()` avec `fileInfo.folder`),
  rangés dans un dossier médiathèque « **Migration legacy** », puis rattachés à l'entrée
  via `strapi.documents(uid).update({ documentId, data: { fichier: fileId } })` (même
  pattern que les contrôleurs — le champ media est une relation morph, pas une colonne).
  Cache par nom de fichier : un fichier partagé (ex. `fichier` = `pdf_file`) n'est stocké
  qu'une fois.
- **FAQ i18n (D1)** : vérifie/crée les locales fr/en/mg (fr = locale par défaut), crée la
  variante fr via `documents().create({ locale: 'fr' })`, puis les variantes en/mg via
  `documents().update({ documentId, locale, data })` — **update() sur une locale absente
  crée la traduction liée au même documentId** (comportement vérifié dans
  `core/dist/services/document-service/repository.js`, cf. issue #24445).
- **Statuts normalisés (D8)** : `normalizeStatus()` — trim + lowercase + suppression des
  diacritiques (`abrogé`/`Abrogé` → `abroge`, `En vigueur` → `en_vigueur`).
- **Organigramme** : calcul de profondeur avec détection de cycles `parent_id` (fallback
  « sans parent » + warning), création par profondeur croissante (le parent existe toujours).
- **Timestamps legacy** : `demarche_timeline.created_at` → `createdAt` Strapi (comme prévu
  en §3f) ; idem favoris, historique, remarks, app-ratings, pièces jointes (`uploaded_at`).
- **Idempotence** : en `--apply`, chaque bloc est sauté si la table Strapi cible n'est pas vide
  (`db.query(uid).count()`). Réexécution sans danger.
- **CLI** : dry-run par défaut ; `--apply` pour écrire ; `--only=bloc1,bloc2` pour restreindre
  (noms : domaines, documents, document-relations, actualites, type-corps, corps, remarks,
  subscribers, organigramme, app-ratings, demarches, demarche-pieces-jointes,
  demarche-timeline, favoris, historique-recherche, faq) ; `--skip-media` pour copier les
  lignes sans téléverser les fichiers.

### Validation (dry-run réel sur la base dev, 2026-09-24)

- Boot Strapi OK (postgres, sans écrire) ; lecture legacy : 3 domaines, 15 documents,
  6 actualités, 1 remark, 2 subscribers, 4 organigramme, 1 app-rating, 6 faq
  (type-corps/corps/démarches/favoris vides en dev).
- Statuts réels en base : `en_vigueur` + `abrogé` (accentué) → normalisation nécessaire
  et couverte.
- ⚠️ **Fichiers médias legacy absents du disque** (`backend/media/documents/` est vide —
  le seed documente des chemins de référence : `backend/scripts/seed.js` ligne 31 : *« les
  chemins de fichiers de test n'existent pas sur disque »*). Constaté aussi : 3 formats de
  chemin cohabitent en base (`documents/x.pdf`, `/media/documents/x.pdf`,
  `media/documents/x.pdf`). Le script résout les 3 formats, log un warning par fichier
  absent et continue (entrée créée sans média). Les vrais fichiers devront être déposés
  dans `backend/media/documents/` avant `--apply` pour être téléversés.

### ✅ Application réelle (2026-09-28)

Bogue bloquant corrigé avant l'application : les modules route-only `auth-compat` et
`legacy-compat` contenaient un **content-type placeholder** avec `singularName === pluralName`,
ce qui faisait échouer le boot Strapi (`The plural name "auth-compat" should be unique`,
`validateContentTypesUnicity`). Une API Strapi **n'a pas besoin de content-type** (comme
`search`/`statistics`/`transparence`) → les deux placeholders ont été **supprimés** (src **et**
`dist/`, car `compileStrapi()` ne purge pas les fichiers retirés du build incrémental).

Commande : `node .tmp-scripts/migrate-data.js --apply --skip-media` (médias absents du disque).
L'application passe les locales fr/en/mg, la locale par défaut est basculée sur `fr`.

**Contrôle des compteurs (legacy → `strapi_*`)** :

| Table legacy | Legacy | Strapi |
|---|---:|---:|
| `domaines` | 3 | 3 |
| `documents` | 15 | 15 |
| `document_relations` | 0 | 0 |
| `actualites` | 6 | 6 |
| `type_corps` | 0 | 0 |
| `corps` | 0 | 0 |
| `remarks` | 1 | 1 |
| `subscribers` | 2 | 2 |
| `organigramme` | 4 | 4 |
| `app_ratings` | 1 | 1 |
| `demarches` / pieces / timeline | 0 | 0 |
| `favoris` / `historique_recherche` | 0 | 0 |
| `faq` | 6 | 6 documents (18 lignes = 6 × fr/en/mg) |

- Statuts documents normalisés (D8) : `en_vigueur` 13, `abroge` 2 — **aucune valeur accentuée**.
- Locales FAQ : `fr` 6, `en` 6, `mg` 6 (repli FR porté par la locale par défaut).

### Reste à faire (étape 6)

1. Déposer les vrais fichiers dans `backend/media/documents/` puis relancer un `--apply`
   ciblé `--only=documents` (les entrées existent déjà : le bloc n'est pas réexécuté — il
   faudra d'abord vider/nettoyer les lignes concernées ou attacher les médias manuellement).
2. Optionnel : rattacher `last_modified_by` (relation user U&P — résolvable par email comme
   dans `getUserMap()`) si l'historique de modification doit être conservé.

---

## Étape 7 — Adaptation frontend ✅

Le front React/Vite est branché sur Strapi (`http://localhost:1337`, surchargeable via
`VITE_API_URL`) **sans réécriture des composants** : Strapi rejoue les URLs legacy
(`/api/documents/`, `/api/corps/`, `/api/favoris/`, `/api/demarches/…`) et conserve la forme
de réponse `{ count, results }` (snake_case, `created_at`, médias en URL).

### Ce qui a été adapté côté front

- **`AxiosConfig.jsx`** — `baseURL` → Strapi (`:1337`) + `withCredentials` (cookie httpOnly) ;
  rafraîchissement **automatique** de l'access token via `/api/v1/auth/jwt/refresh/`
  (rotation du refresh, file d'attente anti-rafale, rejeu unique sur 401).
- **`features/auth/authService.js`** — login/register/reset/activation via `/api/v1/auth/*`
  (module `auth-compat`, qui délègue à Users & Permissions en gardant les réponses legacy).
- **`Utils.jsx`** — `resolveFileUrl` résout les médias Strapi (`/uploads/…`) et retombe sur
  les anciens chemins legacy (`:8000`) pour les fichiers historiques.

### Côté Strapi (routes legacy retenues)

- `legacy-compat` : `GET /api/corps/`, `GET /api/organigramme/`.
- Controllers surchargés (forme legacy) : `document`, `corps` (+ CRUD `/api/corps/...`),
  `type-corps` (`/api/typecorps`), `demarche` (`/api/demarches/`, `/mine`, `/timeline`, `/status`),
  `favori`, `faq`, `remark`, `app-rating`, `subscriber`, `search`, `statistics`,
  `transparence`.
- `auth-compat` : `POST /api/v1/auth/jwt/create`, `/jwt/refresh`, `/users`,
  `/users/activation`, `/users/reset_password`, `/users/reset_password_confirm`,
  `GET /api/v1/auth/users/me`, **`POST /api/v1/auth/logout`**.

### Ajout de session — `POST /api/v1/auth/logout`

Le front appelle `POST /api/v1/auth/logout/` (déjà câblé dans `authService.logout`), mais
l'endpoint n'existait pas côté Strapi. Ajouté dans `api/auth-compat` :
- identifie la session par le **refresh token** (cookie httpOnly `strapi_up_refresh` ou body)
  et la révoque via `sessionManager('users-permissions').revokeSessionById(...)` ;
  à défaut retombe sur le Bearer (`invalidateRefreshToken`) ;
- **purge le cookie** httpOnly ;
- **best effort** : toute erreur est avalée et la réponse reste `200` (le front a déjà vidé
  son `localStorage`).

### Vérifications

- `strapi-backend` : `npx tsc --noEmit` ✅ (0 erreur).
- `front` : `npm run build` ✅ (build Vite/PWA OK).
