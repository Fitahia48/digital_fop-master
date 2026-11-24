#  Bibliothèque Numérique DEAJ — MTeFoP

Application web de **bibliothèque numérique** du Ministère du Travail, de l'Emploi et de la Fonction Publique (MTeFoP) de Madagascar.

Elle permet de **consulter, rechercher, publier et gérer** des textes officiels (lois, décrets, ordonnances, arrêtés), avec un assistant IA intégré et une interface multilingue (Français, Anglais, Malagasy).

---

##  Structure du projet

```
digital_fop-master/
├── front/                  # Frontend React (Vite + Tailwind CSS)
└── strapi-backend/         # Backend CMS Strapi 5 (API REST)
```

---

##  Technologies utilisées

### Frontend (`front/`)

| Technologie | Rôle |
|---|---|
| **React 18** | Framework UI principal |
| **Vite 5** | Bundler / serveur de développement |
| **Tailwind CSS 3** | Framework CSS utilitaire |
| **React Router DOM 6** | Navigation SPA |
| **Redux Toolkit + Redux Persist** | Gestion de l'état global |
| **Axios** | Requêtes HTTP vers l'API Strapi |
| **i18next / react-i18next** | Internationalisation (FR / EN / MG) |
| **Framer Motion** | Animations UI |
| **Chart.js / React Chart.js 2** | Graphiques et statistiques |
| **PDF.js** | Visualisation de documents PDF |
| **React Toastify** | Notifications |
| **Driver.js** | Tour guidé / onboarding utilisateur |
| **FontAwesome** | Icônes |
| **Playwright** | Tests end-to-end |
| **PWA (vite-plugin-pwa)** | Support Progressive Web App |

### Backend (`strapi-backend/`)

| Technologie | Rôle |
|---|---|
| **Strapi 5** | CMS headless / API REST |
| **Node.js ≥ 20** | Environnement d'exécution |
| **SQLite** (défaut) | Base de données locale (développement) |
| **PostgreSQL** | Base de données production |
| **MySQL** | Alternative supportée |
| **Nodemailer** | Envoi d'e-mails (abonnements, alertes) |
| **PDFKit / pdf-to-img** | Génération et conversion de PDF |
| **Sharp** | Traitement d'images |
| **Gemini API (Google)** | Assistant IA intégré (chatbot) |

---

##  Base de données

Le backend Strapi supporte **3 bases de données** configurables via la variable `DATABASE_CLIENT` :

### SQLite (par défaut — développement)
Aucune installation nécessaire. Le fichier de base est créé automatiquement dans :
```
strapi-backend/.tmp/data.db
```

### PostgreSQL (recommandé pour la production)
```env
DATABASE_CLIENT=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=digitallibrary_db1
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe
```

### MySQL
```env
DATABASE_CLIENT=mysql
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=strapi
DATABASE_USERNAME=strapi
DATABASE_PASSWORD=votre_mot_de_passe
```

---

##  Prérequis

- **Node.js** `>= 20.x`
- **npm** `>= 6.x`
- (Optionnel) **PostgreSQL** ou **MySQL** pour la production

---

##  Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/Fitahia48/digital_fop.git
cd digital_fop-master
```

---

### 2. Installer et configurer le Backend (Strapi)

```bash
cd strapi-backend
npm install
```

Créer le fichier de configuration `.env` à la racine du dossier `strapi-backend/` :

```env
HOST=0.0.0.0
PORT=1337
APP_KEYS=votre_cle_1,votre_cle_2
API_TOKEN_SALT=votre_sel
ADMIN_JWT_SECRET=votre_secret_admin
JWT_SECRET=votre_secret_jwt
TRANSFER_TOKEN_SALT=votre_sel_transfer
ENCRYPTION_KEY=votre_cle_chiffrement

# Base de données (SQLite par défaut, PostgreSQL recommandé en production)
DATABASE_CLIENT=sqlite
# DATABASE_CLIENT=postgres
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=digitallibrary_db1
# DB_USER=postgres
# DB_PASSWORD=votre_mot_de_passe

# Assistant IA Gemini (optionnel)
GEMINI_API_KEY=votre_cle_api_gemini
GEMINI_MODEL=gemini-2.0-flash

# Configuration e-mail (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre_email@gmail.com
SMTP_PASS=votre_mot_de_passe_application

# URL du frontend
FRONTEND_URL=http://localhost:5173
```

Lancer le backend en mode développement :

```bash
npm run dev
```

> Le panneau d'administration Strapi est accessible sur : **http://localhost:1337/admin**

---

### 3. Créer le compte administrateur Strapi

```bash
node scripts/create-admin.cjs
```

---

### 4. Installer et démarrer le Frontend

```bash
cd ../front
npm install
npm run dev
```

> L'application est accessible sur : **http://localhost:5173**

---

##  Scripts disponibles

### Backend (`strapi-backend/`)

| Commande | Description |
|---|---|
| `npm run dev` | Démarrer en mode développement |
| `npm run build` | Compiler pour la production |
| `npm run start` | Démarrer en mode production |

### Frontend (`front/`)

| Commande | Description |
|---|---|
| `npm run dev` | Démarrer le serveur de développement |
| `npm run build` | Générer le build de production |
| `npm run preview` | Prévisualiser le build de production |
| `npm run lint` | Vérifier le code avec ESLint |

---

##  Collections / Modules de l'API

L'API Strapi expose les collections suivantes :

| Collection | Description |
|---|---|
| `document` | Textes juridiques (lois, décrets, ordonnances…) |
| `corps` | Corps de métiers de la fonction publique |
| `domaine` | Domaines thématiques des documents |
| `actualite` | Actualités et publications |
| `faq` | Questions fréquentes |
| `organigramme` | Structure organisationnelle |
| `a-propos` | Informations institutionnelles |
| `subscriber` | Abonnés aux alertes de publication |
| `app-rating` | Notes et évaluations de l'application |
| `remark` | Remarques et retours des utilisateurs |
| `statistics` | Statistiques de consultation |
| `visites` | Suivi des visites |
| `search` | Recherche documentaire |
| `transparence` | Données de transparence |

---

## Fonctionnalités principales

- **Recherche avancée** de textes juridiques par mots-clés, domaine, type de document
- **Consultation de PDF** en ligne sans téléchargement
- **Assistant IA** (chatbot) basé sur Gemini API
- **Interface multilingue** : Français, Anglais, Malagasy
- **Authentification** administrateur avec gestion des rôles
- **Abonnement** aux alertes de nouvelles publications par e-mail
- **Statistiques** de consultation et de visites
- **Application PWA** installable sur mobile et desktop
- **Accessibilité** (ARIA, navigation clavier)
- **Tour guidé** pour les nouveaux utilisateurs (Driver.js)

---

##  Structure du frontend

```
front/src/
├── assets/          # Images, logos
├── components/      # Composants React (Accueil, Header, Footer, Docs…)
│   └── stats/       # Composants de statistiques
├── locales/         # Fichiers de traduction (fr, en, mg)
│   ├── fr/
│   ├── en/
│   └── mg/
└── store/           # Configuration Redux
```

---

##  Variables d'environnement importantes

>  Ne jamais versionner le fichier `.env` sur Git. Utiliser `.env.example` comme modèle.

| Variable | Description |
|---|---|
| `DATABASE_CLIENT` | Type de base : `sqlite`, `postgres`, `mysql` |
| `DB_HOST` / `DB_NAME` | Connexion PostgreSQL |
| `GEMINI_API_KEY` | Clé API pour l'assistant IA Gemini |
| `SMTP_HOST` / `SMTP_USER` | Configuration serveur e-mail |
| `FRONTEND_URL` | URL du frontend (pour les liens dans les mails) |
| `JWT_SECRET` | Clé secrète pour les tokens JWT |

---

## Auteur

Développé par **Fitahiandraibe**
 [rahasafitahiandraibe@gmail.com]

---

## Licence

Projet développé pour la **Ministère du Travail, de l'Emploi et de la Fonction Publique**
