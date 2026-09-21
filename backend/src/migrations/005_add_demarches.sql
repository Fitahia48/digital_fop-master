-- Migration 005 : Démarches en ligne (demande de document / attestation à distance)
-- Idempotente : utilise IF NOT EXISTS

-- Table principale des démarches usagers
CREATE TABLE IF NOT EXISTS demarches (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_demarche    VARCHAR(50) NOT NULL,
  objet            TEXT NOT NULL,
  document_id      INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  statut           VARCHAR(20) NOT NULL DEFAULT 'soumise'
                   CHECK (statut IN ('soumise', 'en_cours', 'traitee', 'rejetee')),
  commentaire_admin TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demarches_user     ON demarches(user_id);
CREATE INDEX IF NOT EXISTS idx_demarches_statut   ON demarches(statut);
CREATE INDEX IF NOT EXISTS idx_demarches_document ON demarches(document_id);

-- Pièces jointes (justificatifs) rattachées à une démarche
CREATE TABLE IF NOT EXISTS demarche_pieces_jointes (
  id          SERIAL PRIMARY KEY,
  demarche_id INTEGER NOT NULL REFERENCES demarches(id) ON DELETE CASCADE,
  fichier     VARCHAR(500) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demarche_pieces_demarche ON demarche_pieces_jointes(demarche_id);

COMMENT ON TABLE demarches IS 'Demandes à distance des usagers (copie certifiée, attestation, demande d''information).';
COMMENT ON COLUMN demarches.statut IS 'Cycle de vie : soumise, en_cours, traitee, rejetee.';
