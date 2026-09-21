import React, { useContext, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { logout, reset } from '../features/auth/authSlice'
import { userContext } from './Context'
import biblio from "../assets/logo.png"
import axiosInstance from './AxiosConfig'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRightFromBracket, faHouse, faCircleQuestion, faFileSignature, faFolderOpen, faUserPlus, faStar } from '@fortawesome/free-solid-svg-icons';
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
  };
  // const { user } = useSelector((state) => state.auth)
  const { user, setUser } = useContext(userContext)

  const handleLogout = () => {
    dispatch(logout())
    setUser('')
    dispatch(reset())
    navigate("/")
  }
  return (
    <>
      <nav className="fixed container top-28 w-3/4 mx-auto sm:w-[1500px] md:w-[1500px] sm:text-sm md:text-sm rounded-lg left-0 right-0 bg-white shadow-xl p-2 z-50 ">
        <div className="flex items-center justify-between">
          <div className='gap-x-4 flex  text-black text-lg font-bold ml-8'>
            <div className='shrink-0'>
              <img src={biblio} alt='' className='size-6 ' />
            </div>
            <div>
              <h3 className='text-yellow-950 sm:text-sm md:text-lg'>Digital Library</h3>
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
                <li>
                  <Link
                    to={"/"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    <FontAwesomeIcon icon={faHouse} className='px-2 mb-0.5' />{t('menu.accueil')}
                  </Link>
                </li>
                <li>
                  <select
                    name="domaine"
                    onChange={handleChangeDomaine}
                    aria-label={t('menu.acces_par_theme_label')}
                    className="text-gray-700 border rounded-lg px-3 py-1">
                    <option value="">{t('menu.acces_par_theme')}</option>
                    {
                      domaines.map((dom) => (
                        <option key={dom.id} value={dom.id}>{dom.nom}</option>
                      ))
                    }
                  </select>
                </li>
                <li>
                  <Link
                    to={"/status"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.status_particuliers')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/AfficherDoc"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.recherche')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/organigramme"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.organigramme')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/dashboard"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.dashboard')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/demarches/nouvelle"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    <FontAwesomeIcon icon={faFileSignature} className='px-2 mb-0.5' />{t('menu.demarches_en_ligne')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/mes-demarches"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    <FontAwesomeIcon icon={faFolderOpen} className='px-2 mb-0.5' />{t('menu.mes_demarches')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/mes-favoris"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    <FontAwesomeIcon icon={faStar} className='px-2 mb-0.5' />{t('menu.mes_favoris')}
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={handleRevoirGuide}
                    title={t('menu.revoir_guide_title')}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    <FontAwesomeIcon icon={faCircleQuestion} className='px-2 mb-0.5' />{t('menu.revoir_guide')}
                  </button>
                </li>
                <li>
                  <Link
                    to={"/"}
                    onClick={handleLogout}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.deconnecter')}<FontAwesomeIcon icon={faRightFromBracket} className='px-2' />
                  </Link>
                </li>
              </>
            ) : (
              <>
                {/* Ajout des nouvelles options */}
                <li>
                  <Link
                    to={"/"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.accueil')}
                  </Link>
                </li>
                <li>
                  <select
                    name="domaine"
                    onChange={handleChangeDomaine}
                    aria-label={t('menu.acces_par_theme_label')}
                    className="text-gray-700 border rounded-lg px-3 py-1">
                    <option value="">{t('menu.acces_par_theme')}</option>
                    {
                      domaines.map((dom) => (
                        <option key={dom.id} value={dom.id}>{dom.nom}</option>
                      ))
                    }
                  </select>
                </li>
                <li>
                  <Link
                    to={"/status"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.status_particuliers')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/AfficherDoc"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.recherche')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/organigramme"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.organigramme')}
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={handleRevoirGuide}
                    title={t('menu.revoir_guide_title')}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.revoir_guide')}
                  </button>
                </li>
                <li>
                  <Link
                    to={"/animated"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.a_propos')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/login"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.se_connecter')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/register"}
                    className="inline-flex items-center gap-1.5 bg-blue-900 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-600 transition duration-200"
                  >
                    <FontAwesomeIcon icon={faUserPlus} />{t('menu.creer_compte')}
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>
        {isMenuOpen && (
          <ul id="menu-principal-mobile" className="flex-col md:hidden  animate__animated animate__zoomInRight">
            {user?.refresh ? (
              <>
                <li>
                  <Link
                    to={"/"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.accueil')}
                  </Link>
                </li>
                <li>
                  <select
                    name="domaine"
                    onChange={handleChangeDomaine}
                    aria-label={t('menu.acces_par_theme_label')}
                    className="text-gray-700 border rounded-lg px-3 py-1">
                    <option value="">{t('menu.acces_par_theme')}</option>
                    {
                      domaines.map((dom) => (
                        <option key={dom.id} value={dom.id}>{dom.nom}</option>
                      ))
                    }
                  </select>
                </li>
                <li>
                  <Link
                    to={"/status"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.status_particuliers')}
                  </Link>
                </li>
                <li>
                  <Link to={"/demarches/nouvelle"} className="text-gray-700 hover:text-blue-500 font-medium transition duration-200">
                    {t('menu.demarches_en_ligne')}
                  </Link>
                </li>
                <li>
                  <Link to={"/mes-demarches"} className="text-gray-700 hover:text-blue-500 font-medium transition duration-200">
                    {t('menu.mes_demarches')}
                  </Link>
                </li>
                <li>
                  <Link to={"/mes-favoris"} className="text-gray-700 hover:text-blue-500 font-medium transition duration-200">
                    {t('menu.mes_favoris')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/dashboard"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.dashboard')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/organigramme"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.organigramme')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/"}
                    onClick={handleLogout}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.deconnecter')}
                  </Link>
                </li>
              </>
            ) : (
              <>
                {/* Ajout des nouvelles options */}
                <li>
                  <Link
                    to={"/"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.accueil')}
                  </Link>
                </li>
                <li>
                  <select
                    name="domaine"
                    onChange={handleChangeDomaine}
                    aria-label={t('menu.acces_par_theme_label')}
                    className="text-gray-700 border rounded-lg px-3 py-1">
                    <option value="">{t('menu.acces_par_theme')}</option>
                    {
                      domaines.map((dom) => (
                        <option key={dom.id} value={dom.id}>{dom.nom}</option>
                      ))
                    }
                  </select>
                </li>
                <li>
                  <Link
                    to={"/AfficherDoc"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.recherche')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/status"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    Statuts
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/organigramme"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.organigramme')}
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={handleRevoirGuide}
                    title={t('menu.revoir_guide_title')}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.revoir_guide')}
                  </button>
                </li>
                <li>
                  <Link
                    to={"/animated"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.a_propos')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/login"}
                    className="text-gray-700 hover:text-blue-500 font-medium transition duration-200"
                  >
                    {t('menu.se_connecter')}
                  </Link>
                </li>
                <li>
                  <Link
                    to={"/register"}
                    className="inline-flex items-center gap-1.5 bg-blue-900 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-600 transition duration-200"
                  >
                    <FontAwesomeIcon icon={faUserPlus} />{t('menu.creer_compte')}
                  </Link>
                </li>
              </>
            )}
          </ul>
        )}
      </nav>
    </>
  )
}

export default Menu