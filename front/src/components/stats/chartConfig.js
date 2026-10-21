/**
 * Source UNIQUE de la configuration Chart.js des statistiques (étape 2).
 *
 * - Enregistrement unique des seuls éléments Chart.js utilisés par l'app
 *   (courbes + barres) : plus de `ChartJS.register` dupliqué ailleurs.
 * - Palette : bleu institutionnel + accent jaune + gris (au plus 5 couleurs
 *   par graphique). La couleur seule ne porte jamais un sens : les valeurs
 *   sont écrites en clair (fin des barres, infobulles, tableaux).
 * - Formats : nombres « 1 234 » selon la langue, dates courtes lisibles
 *   (« lun. 20 oct. ») dans le fuseau Indian/Antananarivo, pourcentages
 *   avec une décimale. Aucune valeur brute (NaN → « — »).
 * - Aucune librairie supplémentaire : Chart.js suffit.
 */
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Enregistrement unique (remplace les 3 blocs dupliqués des anciens écrans).
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

/** Palette du site : bleu institutionnel, accent jaune, gris neutres. */
export const PALETTE = {
  bleu: '#1e3a8a', // série principale (blue-900)
  bleuClair: '#3b82f6', // série secondaire (blue-500)
  jaune: '#eab308', // accent (yellow-500)
  gris: '#9ca3af', // gris pour le reste (gray-400)
  grisFonce: '#6b7280', // gris texte/barres (gray-500)
};

// Formats (nombres/dates/pourcentages) : source unique dans `formats.js`,
// importés ici (usage interne) et re-exportés pour que les graphiques
// n'aient qu'une seule porte d'entrée : `chartConfig.js`.
// Les compteurs sans graphique importent `formats.js` (Chart.js reste lazy).
import {
  localeDe,
  formatNombre,
  formatPourcent,
  dateCourte,
  dateLongue,
} from './formats';

export { localeDe, formatNombre, formatPourcent, dateCourte, dateLongue };

const GRILLE = 'rgba(17, 24, 39, 0.06)'; // grille horizontale très discrète

/**
 * Options communes des courbes (évolution dans le temps).
 * - lignes fines et lisses, points visibles seulement au survol,
 * - axe Y commençant à 0, grille discrète, axes étiquetés,
 * - infobulle : date complète + « libellé : valeur ».
 * - `labelsDates` : true si les labels sont des dates (formatage axe + titre).
 */
export const optionsCourbe = ({ langue, axeX, axeY, legende = false, labelsDates = true }) => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  elements: {
    line: { tension: 0.35, borderWidth: 2 },
    point: { radius: 0, hoverRadius: 5, hitRadius: 12, borderWidth: 2 },
  },
  plugins: {
    legend: {
      display: legende,
      position: 'top',
      align: 'start',
      labels: { usePointStyle: true, boxWidth: 8, color: '#374151', font: { size: 12 } },
    },
    tooltip: {
      backgroundColor: 'rgba(17, 24, 39, 0.92)',
      padding: 10,
      cornerRadius: 6,
      callbacks: {
        title: (items) =>
          labelsDates && items.length ? dateLongue(langue, items[0].label) : undefined,
        label: (ctx) => ` ${ctx.dataset.label} : ${formatNombre(langue, ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: Boolean(axeY), text: axeY || '', color: '#6b7280', font: { size: 11 } },
      ticks: { precision: 0, color: '#6b7280', maxTicksLimit: 6 },
      grid: { color: GRILLE },
      border: { display: false },
    },
    x: {
      title: { display: Boolean(axeX), text: axeX || '', color: '#6b7280', font: { size: 11 } },
      ticks: {
        color: '#6b7280',
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 10,
        callback: labelsDates
          ? function xTick(value) {
              return dateCourte(langue, this.getLabelForValue(value));
            }
          : undefined,
      },
      grid: { display: false },
      border: { display: false },
    },
  },
});

/**
 * Options communes des barres HORIZONTALES triées (comparaison de catégories,
 * noms longs lisibles). Valeurs écrites au bout de chaque barre via
 * `pluginValeurFin`. Axe X étiqueté + commence à 0.
 */
export const optionsBarres = ({ langue, axeX, axeY }) => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { right: 56 } }, // place pour la valeur en fin de barre
  elements: { bar: { borderWidth: 0, borderRadius: 4 } },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(17, 24, 39, 0.92)',
      padding: 10,
      cornerRadius: 6,
      callbacks: {
        label: (ctx) => ` ${formatNombre(langue, ctx.parsed.x)}`,
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      title: { display: Boolean(axeX), text: axeX || '', color: '#6b7280', font: { size: 11 } },
      ticks: { precision: 0, color: '#6b7280', maxTicksLimit: 6 },
      grid: { color: GRILLE },
      border: { display: false },
    },
    y: {
      title: { display: Boolean(axeY), text: axeY || '', color: '#6b7280', font: { size: 11 } },
      ticks: { color: '#374151', font: { size: 12 } },
      grid: { display: false },
      border: { display: false },
    },
  },
});

/**
 * Plugin maison (aucune librairie externe) : écrit la valeur en bout de
 * barre, en gris foncé lisible (contraste AA sur blanc), sans déborder.
 */
export const pluginValeurFin = (langue) => ({
  id: 'valeurFin',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach((bar, idx) => {
        const texte = formatNombre(langue, ds.data[idx]);
        if (texte === '—') return;
        const largeur = ctx.measureText(texte).width;
        const xFin = Math.min(bar.x + 6, chartArea.right - largeur);
        ctx.fillText(texte, xFin, bar.y);
      });
    });
    ctx.restore();
  },
});

/**
 * Résumé textuel d'une courbre pour lecteur d'écran (accessibilité) :
 * « Visiteurs différents : 18 oct. = 120 · 19 oct. = 98 · … ». Le libellé
 * de la série vient de l'appelant (traduit) ; aucune grammaire inventée.
 */
export const resumeCourbe = (langue, libelle, labels, valeurs, maxPoints = 8) => {
  const paires = [];
  for (let i = 0; i < labels.length && paires.length < maxPoints; i += 1) {
    const date = dateCourte(langue, labels[i]);
    const val = formatNombre(langue, valeurs[i]);
    if (date) paires.push(`${date} = ${val}`);
    else paires.push(val);
  }
  const suite = labels.length > maxPoints ? ' …' : '';
  return `${libelle} : ${paires.join(' · ')}${suite}`;
};
