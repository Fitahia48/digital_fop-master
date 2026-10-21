import React, { useContext, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { logout, reset } from '../features/auth/authSlice'
import { userContext } from './Context'
import biblio from "../assets/logo.png"
import axiosInstance from './AxiosConfig'
import { requestOnboardingRestart } from './OnboardingTour'

const Menu = ({ onSelectDomaine }) => {
  const [domaines, setDomaines] = useState([])
  const [isMenuOpen, SetisMenuOpen] = useState(false)
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { t } = useTranslation()
  const { user, setUser, isAdmin, setIsAdmin } = useContext(userContext)

  const handleRevoirGuide = () => {
    SetisMenuOpen(false)
    requestOnboardingRestart(navigate)
  }

  const toggleMenu = () => {
    SetisMenuOpen(!isMenuOpen)
  }

  const handleLogout = () => {
    SetisMenuOpen(false) // referme le panneau mobile si ouvert
    dispatch(logout()) // vide le localStorage + révoque le refresh token (best effort)
    setUser('')
    setIsAdmin(false) // pas d'état admin fantôme après déconnexion
    dispatch(reset())
    navigate("/")
  }

  useEffect(() => {
    axiosInstance.get('/api/domaines/')
      .then(response => setDomaines(response.data.results))
      .catch(error => console.error("Erreur est survenue lors du recuperation des domaines", error))
  }, [])

  const handleChangeDomaine = (e) => {
    const selectedDomaine = e.target.value;
    if (selectedDomaine) {
      onSelectDomaine(selectedDomaine);
      navigate("/AfficherDoc");
    }
  }

  // Définition des éléments du menu (ordre, identité, règles d'affichage conservés)
  const menuItems = [
    {
      id: 'home',
      labelKey: 'menu.accueil',
      route: '/',
      authOnly: false,
      type: 'link'
    },
    {
      id: 'theme-selector',
      labelKey: null, // cas spécial : select
      route: null,
      authOnly: false,
      type: 'select'
    },
    {
      id: 'status',
      labelKey: 'menu.status_particuliers',
      route: '/status',
      authOnly: false,
      type: 'link'
    },
    {
      id: 'search',
      labelKey: 'menu.recherche',
      route: '/AfficherDoc',
      authOnly: false,
      type: 'link'
    },
    {
      id: 'organigramme',
      labelKey: 'menu.organigramme',
      route: '/organigramme',
      authOnly: false,
      type: 'link'
    },
    {
      id: 'dashboard',
      labelKey: 'menu.dashboard',
      route: '/dashboard',
      authOnly: true,
      type: 'link'
    },
    {
      // Espace admin : visible UNIQUEMENT pour un administrateur (adminOnly).
      id: 'abonnes',
      labelKey: 'menu.abonnes_admin',
      route: '/admin/abonnes',
      authOnly: true,
      adminOnly: true,
      type: 'link'
    },
    {
      id: 'revoir-guide',
      labelKey: 'menu.revoir_guide',
      route: null,
      authOnly: false,
      type: 'button',
      onClick: handleRevoirGuide
    },
    {
      id: 'a-propos',
      labelKey: 'menu.a_propos',
      route: '/a-propos',
      authOnly: false,
      type: 'link'
    },
    {
      id: 'logout',
      labelKey: 'menu.deconnecter',
      route: null,
      authOnly: true,
      type: 'button',
      variant: 'outline',
      onClick: handleLogout
    }
  ];

  // Filtrage selon l'authentification (sans changer les règles) —
  // adminOnly en plus : l'élément n'apparaît que pour un administrateur.
  const authItems = menuItems.filter(
    item => (!item.authOnly || user?.refresh) && (!item.adminOnly || isAdmin)
  );
  const unauthItems = menuItems.filter(item => !item.authOnly && !item.adminOnly);

  // Rendu d'un élément selon son type
  const renderItem = (item) => {
    switch (item.type) {
      case 'link':
        return (
          <li key={item.id}>
            <NavLink
              to={item.route}
              end
              className={({ isActive }) => `
                inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium text-gray-700 transition-colors duration-150
                hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                ${isActive ? 'bg-blue-50 text-blue-900 font-semibold' : ''}
              `}
            >
              {t(item.labelKey)}
            </NavLink>
          </li>
        );
      case 'select':
        return (
          <li key={item.id}>
            <select
              name="domaine"
              onChange={handleChangeDomaine}
              aria-label={t('menu.acces_par_theme_label')}
              className="w-44 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 focus:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 sm:w-52"
            >
              <option value="">{t('menu.acces_par_theme')}</option>
              {
                domaines.map((dom) => (
                  <option key={dom.id} value={dom.id}>{dom.nom}</option>
                ))
              }
            </select>
          </li>
        );
      case 'button':
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={item.onClick}
              title={item.id === 'revoir-guide' ? t('menu.revoir_guide_title') : t('menu.deconnecter')}
              aria-label={item.id === 'revoir-guide' ? t('menu.revoir_guide_title') : t('menu.deconnecter')}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2
                ${item.variant === 'outline'
                  ? 'border border-gray-200 bg-gray-50 text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700'
                  : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}
            >
              {t(item.labelKey)}
            </button>
          </li>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <nav className="fixed left-0 right-0 top-28 z-50 mx-auto w-[94%] max-w-[1600px] rounded-xl border border-gray-100 bg-white p-1 shadow-md">
        <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4 sm:py-2.5 lg:px-5 lg:py-2">
          {/* Marque : icône + titre sur une ligne, en revanche de l'écran */}
          <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
            <div className="shrink-0">
              <img src={biblio} alt="" className="size-6" />
            </div>
            <h3 className="text-xs font-bold leading-tight text-yellow-950 tracking-tight sm:text-sm lg:text-base">{t('menu.bibliotheque')}</h3>
          </div>

          <div className="md:hidden">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors duration-150"
              onClick={toggleMenu}
              aria-label={isMenuOpen ? t('menu.fermer_menu') : t('menu.ouvrir_menu')}
              aria-expanded={isMenuOpen}
              aria-controls="menu-principal-mobile"
            >
              <svg
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                className="h-5 w-5"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Liens bureau : espacement régulier, pas de retour à la ligne.
              min-w-0 + overflow-x-auto : sur les écrans étroits (1280–1500 px),
              la barre déborde (items en nowrap) — le défilement horizontal rend
              les derniers items (« À propos », « Déconnecter ») atteignables au
              lieu de les couper hors écran. Aucun changement visuel quand tout
              tient (>= ~1600 px). */}
          <ul className="hidden min-w-0 items-center gap-x-1 gap-y-1.5 whitespace-nowrap overflow-x-auto md:flex lg:gap-x-2 xl:gap-x-2.5">
            {user?.refresh ? (
              <>
                {authItems.map(renderItem)}
              </>
            ) : (
              <>
                {unauthItems.map(renderItem)}
              </>
            )}
          </ul>
        </div>
      </nav>

      {isMenuOpen && (
        <ul
          id="menu-principal-mobile"
          className="flex-col space-y-1 bg-white border-t border-gray-100 rounded-b-xl border-gray-100 md:hidden xl:hidden animate-[fadeIn_0.15s_ease-out]"
        >
          {user?.refresh ? (
            <>
              {authItems.map(renderItem)}
            </>
          ) : (
            <>
              {unauthItems.map(renderItem)}
            </>
          )}
        </ul>
      )}
    </>
  );
};

export default Menu;
