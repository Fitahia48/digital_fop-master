import React, { useContext } from 'react'
import { useDispatch } from 'react-redux'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRightFromBracket, faCommentDots } from '@fortawesome/free-solid-svg-icons'
import { userContext } from './Context'
import { logout, reset } from '../features/auth/authSlice'
import { useNavigate, useLocation } from 'react-router-dom'
import ChatWidget from './ChatWidget'
import { useTranslation } from 'react-i18next'

const LOGIN_PATH = '/portail-gestion/connexion'

const RightColumn = () => {
  const location = useLocation()
  const { user, setUser, setIsAdmin } = useContext(userContext)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  if (location.pathname === LOGIN_PATH) {
    return null
  }

  const handleLogout = () => {
    dispatch(logout())
    setUser('')
    setIsAdmin(false)
    dispatch(reset())
    navigate('/portail-gestion/connexion')
  }

  const isConnected = Boolean(user?.refresh)

  return (
    <>
      {/* Assistant MTeFOP — coin inférieur droit, bouton rond */}
      <ChatWidget />

      {/* Déconnecter — au-dessus du bouton assistant, plus petit et compact */}
      {isConnected && (
        <button
          type="button"
          onClick={handleLogout}
          title={t('menu.deconnecter')}
          aria-label={t('menu.deconnecter')}
          className="fixed bottom-20 right-6 z-[60] inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm hover:border-red-500 hover:text-red-600 hover:bg-red-50 transition"
        >
          <FontAwesomeIcon icon={faRightFromBracket} className="shrink-0" />
          {t('menu.deconnecter')}
        </button>
      )}
    </>
  )
}

export default RightColumn
