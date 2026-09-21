-- Migration 003 : Abonnements aux actualités et documents
-- Idempotente : utilise IF NOT EXISTS

CREATE TABLE IF NOT EXISTS subscribers (
  id                SERIAL PRIMARY KEY,
  email             VARCHAR(255) NOT NULL UNIQUE,
  is_confirmed      BOOLEAN NOT NULL DEFAULT FALSE,
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
  confirm_token     UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index sur les tokens pour des lookups rapides
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token ON subscribers (unsubscribe_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_confirm_token     ON subscribers (confirm_token);
