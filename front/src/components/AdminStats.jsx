/**
 * Page unique à onglets des statistiques administrateur (/admin/statistiques)
 * — décision validée « page unique à onglets (Visiteurs / Consultations /
 * Textes / Corps) ».
 *
 * - Accès : route <ProtectedRoute> dans App.jsx — EXACTEMENT le même verrou
 *   que l'ancien écran (sections du dashboard) : aucune règle d'accès
 *   modifiée, rien n'est visible qui ne l'était déjà.
 * - Lazy loading : chaque panneau (et donc Chart.js) n'est chargé qu'à
 *   l'ouverture de son onglet ; un onglet déjà ouvert reste monté (masqué)
 *   pour ne pas recharger ses données.
 * - Onglets accessibles : role tablist/tab/tabpanel, flèches ← →, focus
 *   visible, ancrage #visiteurs #textes #consultations #corps utilisé par les
 *   raccourcis du tableau de bord.
 */
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faFileLines,
  faScaleBalanced,
  faBuilding,
} from '@fortawesome/free-solid-svg-icons';

const VisiteursPanel = lazy(() => import('./stats/VisiteursPanel'));
const TextesPanel = lazy(() => import('./stats/TextesPanel'));
const ConsultationsPanel = lazy(() => import('./stats/ConsultationsPanel'));
const CorpsPanel = lazy(() => import('./stats/CorpsPanel'));

const ONGLETS = [
  { id: 'visiteurs', icone: faChartLine, cle: 'stats.onglet_visiteurs' },
  { id: 'textes', icone: faFileLines, cle: 'stats.onglet_textes' },
  { id: 'consultations', icone: faScaleBalanced, cle: 'stats.onglet_consultations' },
  { id: 'corps', icone: faBuilding, cle: 'stats.onglet_corps' },
];

const Panneau = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center py-20" role="status">
      <span
        className="animate-spin rounded-full h-8 w-8 border-4 border-blue-800 border-t-transparent"
        aria-hidden="true"
      />
      <span className="sr-only">{t('stats.chargement')}</span>
    </div>
  );
};

const AdminStats = () => {
  const { t } = useTranslation();

  // Onglet initial : ancrage #… éventuel (raccourcis dashboard), sinon le 1er.
  const [actif, setActif] = useState(() => {
    const hash = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
    return ONGLETS.some((o) => o.id === hash) ? hash : ONGLETS[0].id;
  });
  // Onglets déjà ouverts : restent montés (aucun rechargement).
  const [montes, setMontes] = useState(() => new Set([actif]));
  const refsOnglets = useRef([]);

  useEffect(() => {
    setMontes((prev) => new Set(prev).add(actif));
    // Ancre partageable sans rechargement (history API, sans toucher au routeur).
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', `#${actif}`);
    }
  }, [actif]);

  const activer = (id) => setActif(id);

  const clavier = (event, index) => {
    let suivant = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      suivant = (index + 1) % ONGLETS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      suivant = (index - 1 + ONGLETS.length) % ONGLETS.length;
    } else if (event.key === 'Home') {
      suivant = 0;
    } else if (event.key === 'End') {
      suivant = ONGLETS.length - 1;
    }
    if (suivant !== null) {
      event.preventDefault();
      setActif(ONGLETS[suivant].id);
      refsOnglets.current[suivant]?.focus();
    }
  };

  const contenu = {
    visiteurs: <VisiteursPanel />,
    textes: <TextesPanel />,
    consultations: <ConsultationsPanel />,
    corps: <CorpsPanel />,
  };

  return (
    <div className="bg-gray-50 min-h-[60vh] py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">{t('stats.page_titre')}</h1>
        <p className="text-sm text-gray-500 mb-5">{t('stats.page_sous_titre')}</p>

        <div
          role="tablist"
          aria-label={t('stats.onglets_nav')}
          className="flex flex-wrap gap-2 mb-6"
        >
          {ONGLETS.map((o, index) => {
            const selectionne = actif === o.id;
            return (
              <button
                key={o.id}
                ref={(el) => {
                  refsOnglets.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`onglet-${o.id}`}
                aria-controls={`panneau-${o.id}`}
                aria-selected={selectionne}
                tabIndex={selectionne ? 0 : -1}
                onClick={() => activer(o.id)}
                onKeyDown={(e) => clavier(e, index)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                  selectionne
                    ? 'bg-blue-800 border-blue-800 text-white shadow-sm'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <FontAwesomeIcon icon={o.icone} aria-hidden="true" />
                {t(o.cle)}
              </button>
            );
          })}
        </div>

        {ONGLETS.filter((o) => montes.has(o.id)).map((o) => (
          <div
            key={o.id}
            role="tabpanel"
            id={`panneau-${o.id}`}
            aria-labelledby={`onglet-${o.id}`}
            hidden={actif !== o.id}
          >
            <Suspense fallback={<Panneau />}>{contenu[o.id]}</Suspense>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminStats;
