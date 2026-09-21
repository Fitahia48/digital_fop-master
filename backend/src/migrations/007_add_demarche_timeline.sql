-- Migration 007 : Traçabilité des démarches (journal d'étapes append-only)
-- Idempotente : utilise IF NOT EXISTS

CREATE TABLE IF NOT EXISTS demarche_timeline (
  id          SERIAL PRIMARY KEY,
  demarche_id INTEGER NOT NULL REFERENCES demarches(id) ON DELETE CASCADE,
  statut      VARCHAR(20) NOT NULL
              CHECK (statut IN ('soumise', 'en_cours', 'traitee', 'rejetee')),
  commentaire TEXT,
  modifie_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demarche_timeline_demarche ON demarche_timeline(demarche_id, created_at);

COMMENT ON TABLE demarche_timeline IS
  'Journal append-only des changements de statut : chaque changement insère une ligne, jamais de UPDATE ni DELETE.';

-- Backfill idempotent : les démarches créées avant cette migration n'ont pas
-- d'entrée initiale. On insère « soumise » datée de leur created_at si absente.
INSERT INTO demarche_timeline (demarche_id, statut, commentaire, modifie_par, created_at)
SELECT d.id, 'soumise', 'Demande enregistrée.', NULL, d.created_at
FROM demarches d
WHERE NOT EXISTS (
  SELECT 1 FROM demarche_timeline t WHERE t.demarche_id = d.id
);
