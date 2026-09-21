-- 008_add_user_language.sql
-- Préférence de langue (fr / en / mg) utilisée pour choisir la langue des emails
-- automatiques (P0/P1). On stocke aussi la préférence des abonnés anonymes pour
-- que les alertes de publication respectent leur langue.
--
-- Idempotente et SANS bloc DO : certaines installations PostgreSQL ont le
-- langage plpgsql indisponible (échec de chargement de plpgsql.dll), ce qui
-- ferait échouer tout `DO $$ ... $$`. On utilise donc DROP CONSTRAINT IF EXISTS.

ALTER TABLE users       ADD COLUMN IF NOT EXISTS langue_preferee VARCHAR(2) NOT NULL DEFAULT 'fr';
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS langue_preferee VARCHAR(2) NOT NULL DEFAULT 'fr';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_langue_preferee_check;
ALTER TABLE users ADD  CONSTRAINT users_langue_preferee_check
  CHECK (langue_preferee IN ('fr', 'en', 'mg'));

ALTER TABLE subscribers DROP CONSTRAINT IF EXISTS subscribers_langue_preferee_check;
ALTER TABLE subscribers ADD  CONSTRAINT subscribers_langue_preferee_check
  CHECK (langue_preferee IN ('fr', 'en', 'mg'));
