/**
 * Sélecteur de période cohérent pour toutes les statistiques :
 * boutons empilés (Aujourd'hui / 7 jours / 30 jours / …) + plage de dates
 * native quand l'écran le supporte réellement. Aucune période n'est créée :
 * les presets sont fournis par l'appelant, qui les aligne sur l'API.
 * Accessible : role="group", aria-pressed, focus visible.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

const PERSONNALISEE = 'personnalisee';

const PeriodSelector = ({
  presets,
  valeur,
  onChange,
  dates = { debut: '', fin: '' },
  onDatesChange,
  afficherPersonnalisee = false,
  libelleGroupe,
}) => {
  const { t } = useTranslation();

  const liste = afficherPersonnalisee
    ? [...presets, { id: PERSONNALISEE, libelle: t('stats.periode_personnalisee') }]
    : presets;

  const majDate = (champ, val) => onDatesChange?.({ ...dates, [champ]: val });

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label={libelleGroupe || t('stats.periode_groupe')}
        className="flex flex-wrap gap-2"
      >
        {liste.map((p) => {
          const actif = valeur === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={actif}
              onClick={() => onChange(p.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                actif
                  ? 'bg-blue-800 border-blue-800 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {p.libelle}
            </button>
          );
        })}
      </div>

      {valeur === PERSONNALISEE && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="periode-debut" className="block text-xs font-medium text-gray-600 mb-1">
              {t('stats.date_debut')}
            </label>
            <input
              id="periode-debut"
              type="date"
              value={dates.debut}
              onChange={(e) => majDate('debut', e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="periode-fin" className="block text-xs font-medium text-gray-600 mb-1">
              {t('stats.date_fin')}
            </label>
            <input
              id="periode-fin"
              type="date"
              value={dates.fin}
              onChange={(e) => majDate('fin', e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PeriodSelector;
