/**
 * P1 — Source UNIQUE de la liste contrôlée des types de documents.
 *
 * Utilisée par : SearchBar (filtre), AddDocs (saisie), EditDoc (saisie),
 * components/stats/TextesPanel & ConsultationsPanel — afin que filtres, formulaires, statistiques
 * et données portent les MÊMES valeurs, après migration `p1-migrate.ts`.
 *
 * La valeur stockée en base (`document.type`) est la forme canonique `value`.
 * L'affichage passe par i18n (`documentsTypes.${value}`), avec repli sur le
 * libellé français.
 *
 * ⚠️ Ne pas modifier sans mettre à jour `ALIASES` dans
 * `strapi-backend/scripts/p1-migrate.ts` (migration des valeurs historiques).
 */
export const DOCUMENT_TYPES = [
  { value: 'constitution', label: 'Constitution' },
  { value: 'traites_internationaux', label: 'Traités internationaux' },
  { value: 'convention', label: 'Convention' },
  { value: 'loi_organique', label: 'Loi organique' },
  { value: 'loi_ordinaires', label: 'Lois ordinaires' },
  { value: 'ordonnance', label: 'Ordonnance' },
  { value: 'decret', label: 'Décret' },
  { value: 'arrete_interministeriel', label: 'Arrêté interministériel' },
  { value: 'arrete', label: 'Arrêté' },
  { value: 'circulaire', label: 'Circulaire' },
  { value: 'note', label: 'Note' },
];

/** Libellé affichable : i18n si la clé existe, sinon libellé canonique FR. */
export const documentTypeLabel = (value, t) => {
  const canon = DOCUMENT_TYPES.find((d) => d.value === value);
  if (!canon) return value || '—'; // valeur inconnue affichée telle quelle
  return t ? t(`documentsTypes.${value}`, { defaultValue: canon.label }) : canon.label;
};

/** Vérifie qu'une valeur appartient à la liste contrôlée. */
export const isKnownType = (value) => DOCUMENT_TYPES.some((d) => d.value === value);
