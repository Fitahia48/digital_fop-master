-- Migration 002: Suivi de la vie juridique des textes réglementaires
-- 1. Mise à jour de la colonne status avec contrainte CHECK et valeur par défaut 'en_vigueur'
ALTER TABLE documents ALTER COLUMN status TYPE VARCHAR(30);

-- Harmonisation des valeurs existantes
UPDATE documents
SET status = 'en_vigueur'
WHERE status IS NULL OR status IN ('En vigueur', 'en vigueur', 'vigueur');

UPDATE documents
SET status = 'abrogé'
WHERE status IN ('Abrogé', 'abrogé', 'Abroge', 'abroge');

UPDATE documents
SET status = 'modifié'
WHERE status IN ('Modifié', 'modifié', 'Modifie', 'modifie');

-- Définir la valeur par défaut
ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'en_vigueur';

-- Contrainte CHECK pour valider les statuts autorisés
ALTER TABLE documents DROP CONSTRAINT IF EXISTS chk_documents_status;
ALTER TABLE documents ADD CONSTRAINT chk_documents_status
    CHECK (status IN ('en_vigueur', 'abrogé', 'modifié', 'abroge', 'modifie'));

-- 2. Ajout de la date d'entrée en vigueur (distincte de la date de signature/publication)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS date_entree_vigueur DATE;

-- 3. Table des relations inter-textes (modifie, abroge, complete)
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
