import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import ItemsContener from './ItemsContener'
import SocialIcons from './SocialIcons'
import { Icons } from './MenuFooter'
import RemarkForm from './RemarkForm'
import SubscribeForm from './SubscribeForm'
import { requestOnboardingRestart } from './OnboardingTour'
import { scrollToTop } from '../utils/scrollToTop'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleInfo, faCircleQuestion, faMapLocationDot, faScaleBalanced } from '@fortawesome/free-solid-svg-icons'

const LOGIN_PATH = '/portail-gestion/connexion'

const Footer = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()

  if (location.pathname === LOGIN_PATH) {
    return null
  }

  return (
    <footer className="bg-gray-900 z-50 text-white mt-20">
      <div className="md:flex md:justify-between md:items-start sm:px-12 px-4 bg-[#ffffff19] py-7">
        <div className="md:w-2/5">
          <h1 className="lg:text-4xl text-3xl font-semibold lg:leading-normal mb-6 md:mb-0">
            {t('footer.titre')}
          </h1>
          <p className="lg:text-sm text-sm">
            {t('footer.description')}
          </p>
        </div>
        <div className="mt-6 md:mt-0 md:w-3/5 md:pl-10 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <RemarkForm />
          <div id="subscribe-section">
            <SubscribeForm />
          </div>
        </div>
      </div>
      {/* Aide : FAQ et relance de la visite guidée */}
      <div className="sm:px-12 px-4 py-4 border-t border-white/10 flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link
          to="/aide"
          onClick={() => location.pathname === '/aide' && scrollToTop()}
          className="inline-flex items-center gap-2 text-gray-300 hover:text-yellow-300 transition"
        >
          <FontAwesomeIcon icon={faCircleQuestion} /> {t('footer.aide_faq')}
        </Link>
        <span className="text-gray-600" aria-hidden="true">|</span>
        <Link
          to="/a-propos"
          onClick={() => location.pathname === '/a-propos' && scrollToTop()}
          className="inline-flex items-center gap-2 text-gray-300 hover:text-yellow-300 transition"
        >
          <FontAwesomeIcon icon={faCircleInfo} /> {t('footer.a_propos')}
        </Link>
        <span className="text-gray-600" aria-hidden="true">|</span>
        <button
          type="button"
          onClick={() => requestOnboardingRestart(navigate)}
          className="inline-flex items-center gap-2 text-gray-300 hover:text-yellow-300 transition"
        >
          <FontAwesomeIcon icon={faMapLocationDot} /> {t('footer.revoir_le_guide')}
        </button>
      </div>
      <ItemsContener />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10 text-center pt-2 text-gray-400 text-sm pb-8">
        <span>{t('footer.droits')}</span>
        <span>{t('footer.mentions')}</span>
        <SocialIcons Icons={Icons} />
      </div>
    </footer>
  )
}

export default Footer