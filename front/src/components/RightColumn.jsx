import React from 'react'
import { useLocation } from 'react-router-dom'
import ChatWidget from './ChatWidget'

const LOGIN_PATH = '/portail-gestion/connexion'

/**
 * Colonne droite : uniquement l'assistant MTeFOP (coin inférieur droit).
 * Le bouton « Déconnecter » qui se trouvait au-dessus a été retiré :
 * la déconnexion vit désormais uniquement dans le menu (en haut), dont le
 * handler a été corrigé (setUser / setIsAdmin manquaient → ReferenceError).
 */
const RightColumn = () => {
  const location = useLocation()

  if (location.pathname === LOGIN_PATH) {
    return null
  }

  return <ChatWidget />
}

export default RightColumn
