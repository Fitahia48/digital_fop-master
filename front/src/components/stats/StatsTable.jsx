/**
 * Tableau de statistiques stylé : en-tête clair, colonnes alignées (texte à
 * gauche, nombres à droite), lignes zébrées, tri au clic sur les en-têtes
 * (désactivé tant qu'on n'a pas cliqué : l'ordre d'origine de l'API est
 * conservé), nombre de lignes limité + « Voir plus », top 3 mis en avant sans
 * exagération. Défilement horizontal propre sur mobile. <caption> + th scope.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNombre } from './chartConfig';

/**
 * Colonnes : [{ cle, libelle, type: 'texte'|'nombre', triable?, rendu? }]
 * - rendu: (ligne) => nœud React pour une cellule sur mesure (libellés…)
 * lignes : objets bruts de l'API (aucun calcul métier ici).
 * cleLigne : (ligne, index) => clé de rendu stable.
 */
const StatsTable = ({
  colonnes,
  lignes,
  caption,
  cleLigne = (_l, i) => i,
  triInitial = null,
  afficherInitialement = 10,
  meta = null, // { nom, valeur } → mise en avant du top 3 sur une colonne
  vide = null,
}) => {
  const { t, i18n } = useTranslation();
  const [tri, setTri] = useState(triInitial); // null | { cle, sens: 'asc'|'desc' }
  const [visibles, setVisibles] = useState(afficherInitialement);

  // Tri uniquement après clic utilisateur → l'ordre livré par l'API reste
  // l'ordre par défaut (chiffres et classements inchangés).
  const lignesTriees = useMemo(() => {
    if (!tri) return lignes;
    const col = colonnes.find((c) => c.cle === tri.cle);
    if (!col) return lignes;
    const copie = [...lignes];
    copie.sort((a, b) => {
      let va = col.rendu ? undefined : a[tri.cle];
      let vb = col.rendu ? undefined : b[tri.cle];
      if (col.type === 'nombre') {
        va = Number(va);
        vb = Number(vb);
        if (!Number.isFinite(va)) va = -Infinity;
        if (!Number.isFinite(vb)) vb = -Infinity;
        return tri.sens === 'asc' ? va - vb : vb - va;
      }
      va = String(va ?? '').toLowerCase();
      vb = String(vb ?? '').toLowerCase();
      const cmp = va.localeCompare(vb);
      return tri.sens === 'asc' ? cmp : -cmp;
    });
    return copie;
  }, [lignes, tri, colonnes]);

  const cliqueTri = (col) => {
    if (!col.triable && col.type !== 'nombre') return;
    setTri((prev) => {
      // 1er clic : desc sur les nombres, asc sur le texte ; puis bascule.
      if (prev?.cle !== col.cle) return { cle: col.cle, sens: col.type === 'nombre' ? 'desc' : 'asc' };
      return { cle: col.cle, sens: prev.sens === 'asc' ? 'desc' : 'asc' };
    });
    setVisibles(afficherInitialement);
  };

  if (lignes.length === 0) {
    return <p className="text-sm text-gray-600 py-6 text-center">{vide ?? t('stats.vide')}</p>;
  }

  const affichees = lignesTriees.slice(0, visibles);
  const cacherReste = lignesTriees.length > afficherInitialement;

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="min-w-full text-left border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-blue-900 text-white">
            {colonnes.map((col) => {
              const triable = Boolean(col.triable) || col.type === 'nombre';
              const actif = tri?.cle === col.cle;
              return (
                <th
                  key={col.cle}
                  scope="col"
                  aria-sort={actif ? (tri.sens === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`py-2.5 px-3 font-semibold text-xs uppercase tracking-wide ${
                    col.type === 'nombre' ? 'text-right' : 'text-left'
                  }`}
                >
                  {triable ? (
                    <button
                      type="button"
                      onClick={() => cliqueTri(col)}
                      className={`inline-flex items-center gap-1 hover:text-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 rounded px-1 -mx-1 ${
                        actif ? 'text-yellow-300' : ''
                      }`}
                    >
                      {col.libelle}
                      <span aria-hidden="true" className="text-[10px]">
                        {actif ? (tri.sens === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.libelle
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="text-gray-800">
          {affichees.map((ligne, idx) => {
            const rang = idx + 1;
            const estTop3 = meta ? rang <= 3 : false;
            const zebre = estTop3 ? 'bg-amber-50/70' : idx % 2 === 1 ? 'bg-gray-50' : 'bg-white';
            return (
              <tr key={cleLigne(ligne, idx)} className={`border-b border-gray-100 ${zebre}`}>
                {colonnes.map((col) => (
                  <td
                    key={col.cle}
                    className={`py-2 px-3 ${
                      col.type === 'nombre'
                        ? `text-right tabular-nums ${
                            estTop3 && meta?.nom === col.cle
                              ? 'font-semibold text-gray-900'
                              : 'text-gray-700'
                          }`
                        : 'text-left'
                    }`}
                  >
                    {col.rendu
                      ? col.rendu(ligne)
                      : col.type === 'nombre'
                        ? formatNombre(i18n.language, ligne[col.cle])
                        : ligne[col.cle] ?? '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {cacherReste && (
        <button
          type="button"
          onClick={() =>
            setVisibles((v) =>
              v >= lignesTriees.length ? afficherInitialement : Math.min(lignesTriees.length, v + 10)
            )
          }
          className="mt-3 mx-auto block px-4 py-1.5 text-sm font-medium text-blue-800 border border-blue-200 rounded-lg hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
        >
          {visibles >= lignesTriees.length
            ? t('stats.reduire')
            : t('stats.voir_plus', {
                reste: Math.min(10, lignesTriees.length - visibles),
              })}
        </button>
      )}
    </div>
  );
};

export default StatsTable;
