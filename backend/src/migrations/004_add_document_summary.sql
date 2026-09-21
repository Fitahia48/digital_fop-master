-- Migration 004 : Mode "langage clair" — résumé simplifié des textes juridiques
-- Idempotente : utilise IF NOT EXISTS
-- Colonne saisie manuellement par un administrateur (aucune génération automatique).

ALTER TABLE documents ADD COLUMN IF NOT EXISTS resume_simplifie TEXT;

COMMENT ON COLUMN documents.resume_simplifie IS
  'Résumé du texte en langage clair (optionnel), saisi par un administrateur.';
