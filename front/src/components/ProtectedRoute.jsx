import React from "react";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ isAuthenticated, children }) => {
  if (!isAuthenticated) {
    // Utilisateur non connecté → page de connexion (hors navigation publique)
    return <Navigate to="/portail-gestion/connexion" />;
  }
  // Si tout est bon, affichez le composant enfant
  return children;
};

export default ProtectedRoute;
