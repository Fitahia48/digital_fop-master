-- ============================================================
-- Schema PostgreSQL - digital_fop (equivalent Django models)
-- ============================================================

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    email VARCHAR(254) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    is_staff BOOLEAN DEFAULT FALSE,
    is_superuser BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT FALSE,
    date_joined TIMESTAMPTZ DEFAULT NOW()
);

-- AUTH TOKENS (refresh tokens)
CREATE TABLE IF NOT EXISTS auth_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DOMAINES
CREATE TABLE IF NOT EXISTS domaines (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) UNIQUE NOT NULL
);

-- DOCUMENTS
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    objet TEXT NOT NULL,
    numero TEXT NOT NULL,
    date DATE NOT NULL,
    conseil VARCHAR(50) DEFAULT 'Autre',
    domaine_id INTEGER REFERENCES domaines(id) ON DELETE SET NULL,
    fichier VARCHAR(500),
    pdf_file VARCHAR(500),
    status VARCHAR(30) DEFAULT 'en_vigueur' CHECK (status IN ('en_vigueur', 'abrogé', 'modifié', 'abroge', 'modifie')),
    date_entree_vigueur DATE,
    last_modified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    last_modified_at TIMESTAMPTZ,
    modification_details TEXT,
    inclus_journal BOOLEAN DEFAULT FALSE,
    date_journal DATE,
    numero_journal VARCHAR(20),
    page_journal VARCHAR(20),
    visits INTEGER DEFAULT 0,
    telechargements INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_documents_objet ON documents(objet);
CREATE INDEX IF NOT EXISTS idx_documents_numero ON documents(numero);

-- DOCUMENT RELATIONS (Vie juridique des textes)
CREATE TABLE IF NOT EXISTS document_relations (
    id SERIAL PRIMARY KEY,
    document_source_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_cible_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    type_relation VARCHAR(20) NOT NULL CHECK (type_relation IN ('modifie', 'abroge', 'complete')),
    date_creation TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_doc_relation UNIQUE (document_source_id, document_cible_id, type_relation),
    CONSTRAINT chk_no_self_relation CHECK (document_source_id != document_cible_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_rel_source ON document_relations(document_source_id);
CREATE INDEX IF NOT EXISTS idx_doc_rel_cible ON document_relations(document_cible_id);

-- API QUOTA USAGE (Google PSE quota journalier)
CREATE TABLE IF NOT EXISTS api_quota_usage (
    date DATE PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0
);

-- DOCUMENT STATS
CREATE TABLE IF NOT EXISTS document_stats (
    id SERIAL PRIMARY KEY,
    date DATE DEFAULT CURRENT_DATE,
    daily_count INTEGER DEFAULT 0,
    monthly_count INTEGER DEFAULT 0,
    yearly_count INTEGER DEFAULT 0,
    UNIQUE(date)
);

-- ACTUALITES
CREATE TABLE IF NOT EXISTS actualites (
    id SERIAL PRIMARY KEY,
    conseil VARCHAR(50) DEFAULT 'CONSEIL DES MINISTRES',
    titre VARCHAR(200) NOT NULL,
    date DATE DEFAULT '2024-01-01',
    lieu VARCHAR(100) NOT NULL,
    texte TEXT NOT NULL
);

-- REMARKS
CREATE TABLE IF NOT EXISTS remarks (
    id SERIAL PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TYPE CORPS
CREATE TABLE IF NOT EXISTS type_corps (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) UNIQUE NOT NULL
);

-- CORPS
CREATE TABLE IF NOT EXISTS corps (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255),
    numero VARCHAR(50) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    type_id INTEGER REFERENCES type_corps(id) ON DELETE SET NULL,
    date_creation DATE NOT NULL,
    status VARCHAR(50),
    fichier VARCHAR(500),
    pdf_file VARCHAR(500),
    visits INTEGER DEFAULT 0,
    telechargements INTEGER DEFAULT 0
);

-- CORPS STATS
CREATE TABLE IF NOT EXISTS corps_stats (
    id SERIAL PRIMARY KEY,
    date DATE DEFAULT CURRENT_DATE,
    daily_count INTEGER DEFAULT 0,
    monthly_count INTEGER DEFAULT 0,
    yearly_count INTEGER DEFAULT 0,
    UNIQUE(date)
);

-- VISITS
CREATE TABLE IF NOT EXISTS visits (
    id SERIAL PRIMARY KEY,
    ip_address INET NOT NULL,
    user_agent TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    visit_date DATE DEFAULT CURRENT_DATE
);

-- APP RATINGS
CREATE TABLE IF NOT EXISTS app_ratings (
    id SERIAL PRIMARY KEY,
    stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
    session_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORGANIGRAMME
CREATE TABLE IF NOT EXISTS organigramme (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(150) NOT NULL,
    poste VARCHAR(150) NOT NULL,
    service VARCHAR(150) DEFAULT 'Cabinet',
    parent_id INTEGER REFERENCES organigramme(id) ON DELETE CASCADE,
    ordre INTEGER DEFAULT 0,
    actif BOOLEAN DEFAULT TRUE
);

-- CATEGORIES ACTUALITES (actualite / offre / nouveaute)
ALTER TABLE actualites ADD COLUMN IF NOT EXISTS categorie VARCHAR(30) DEFAULT 'actualite';
