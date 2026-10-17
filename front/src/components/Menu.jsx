import React, { useContext, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { logout, reset } from '../features/auth/authSlice'
import { userContext } from './Context'
import biblio from "../assets/logo.png"
import axiosInstance from './AxiosConfig'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse, faCircleQuestion, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { requestOnboardingRestart } from './OnboardingTour';

const Menu = ({ onSelectDomaine }) => {
  const [domaines, setDomaines] = useState([])
  const [isMenuOpen, SetisMenuOpen] = useState(false)
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { t } = useTranslation()
  const handleRevoirGuide = () => {
    SetisMenuOpen(false)
    requestOnboardingRestart(navigate)
  }

  const toggleMenu = () => {
    SetisMenuOpen(!isMenuOpen)
  }
  const handleLogout = () => {
    dispatch(logout())
    setUser('')
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
  const { user, setUser } = useContext(userContext)

  // Define menu items configuration
  const menuItems = [
    {
      id: 'home',
      labelKey: 'menu.accueil',
      route: '/',
      icon: <FontAwesomeIcon icon={faHouse} className='px-2 mb-0.5' />,
      authOnly: false,
      type: 'link'
    },
    {
      id: 'theme-selector',
      labelKey: null, // special case for select
      route: null,
      icon: null,
      authOnly: false,
      type: 'select'
    },
    {
      id: 'status',
      labelKey: 'menu.status_particuliers',
      route: '/status',
      icon: null,
      authOnly: false,
      type: 'link'
    },
    {
      id: 'search',
      labelKey: 'menu.recherche',
      route: '/AfficherDoc',
      icon: null,
      authOnly: false,
      type: 'link'
    },
    {
      id: 'organigramme',
      labelKey: 'menu.organigramme',
      route: '/organigramme',
      icon: null,
      authOnly: false,
      type: 'link'
    },
    {
      id: 'dashboard',
      labelKey: 'menu.dashboard',
      route: '/dashboard',
      icon: null,
      authOnly: true,
      type: 'link'
    },
    {
      id: 'revoir-guide',
      labelKey: 'menu.revoir_guide',
      route: null,
      icon: <FontAwesomeIcon icon={faCircleQuestion} className='px-2 mb-0.5' />,
      authOnly: false,
      type: 'button',
      onClick: handleRevoirGuide
    },
    {
      id: 'a-propos',
      labelKey: 'menu.a_propos',
      route: '/a-propos',
      icon: null,
      authOnly: false,
      type: 'link'
    },
    {
      id: 'logout',
      labelKey: 'menu.deconnecter',
      route: null,
      icon: <FontAwesomeIcon icon={faRightFromBracket} className='px-2' />,
      authOnly: true,
      type: 'link',
      onClick: handleLogout
    }
  ];

  // Filter items based on authentication
  const authItems = menuItems.filter(item => !item.authOnly || user?.refresh);
  const unauthItems = menuItems.filter(item => !item.authOnly);

  // Render a menu item based on its type
  const renderItem = (item) => {
    switch (item.type) {
      case 'link':
        return (
          <li key={item.id}>
            <NavLink
              to={item.route}
              end
              className={({ isActive }) => `
                text-gray-700 hover:text-blue-500 font-medium transition duration-200
                ${isActive ? 'text-blue-600 font-semibold' : ''}
              `}
            >
              {item.icon}
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
              className="text-gray-700 border rounded-lg px-3 py-1"
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
              title={t('menu.revoir_guide_title')}
              className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
            >
              {item.icon}
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
      <nav className="fixed container top-28 w-3/4 mx-auto max-w-[1500px] sm:text-sm md:text-sm rounded-lg left-0 right-0 bg-white shadow-xl p-2 z-50 ">
        <div className="flex items-center justify-between">
          <div className='gap-x-4 flex  text-black text-lg font-bold ml-8'>
            <div className='shrink-0'>
              <img src={biblio} alt='' className='size-6 ' />
            </div>
            <div>
              <h3 className='text-yellow-950 sm:text-sm md:text-lg'>{t('menu.bibliotheque')}</h3>
            </div>
          </div>

          <div className="md:hidden ">
            <button
              className="text-black"
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
                className="w-6 h-6">
                <path d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </button>
          </div>
          <ul className="hidden md:flex space-x-6 mr-2 animate__animated animate__zoomInRight">
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
        <ul id="menu-principal-mobile" className="flex-col md:hidden  animate__animated animate__zoomInRight">
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
}

export default Menu;