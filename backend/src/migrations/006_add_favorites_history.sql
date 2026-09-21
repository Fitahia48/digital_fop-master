-- Migration 006 : Favoris usager + historique de recherche synchronisé
-- Idempotente : utilise IF NOT EXISTS

-- Documents sauvegardés par un usager (un seul favori par couple usager/document)
CREATE TABLE IF NOT EXISTS favoris (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_favori_user_document UNIQUE (user_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_favoris_user     ON favoris(user_id);
CREATE INDEX IF NOT EXISTS idx_favoris_document ON favoris(document_id);

-- Historique des recherches (enregistré uniquement pour un usager connecté)
CREATE TABLE IF NOT EXISTS historique_recherche (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terme_recherche VARCHAR(255) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historique_user_date ON historique_recherche(user_id, created_at DESC);

COMMENT ON TABLE favoris IS 'Documents mis en favori par un usager connecté.';
COMMENT ON TABLE historique_recherche IS 'Historique des recherches par usager connecté, synchronisé entre appareils.';
