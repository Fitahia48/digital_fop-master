import React, { useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { userContext } from "./Context";
import axiosInstance from "./AxiosConfig";

/**
 * Garde de route pour l'espace d'administration.
 *
 * - Vérifie la session ET le rôle via /api/v1/auth/users/me/ (le Bearer est
 *   ajouté par l'intercepteur d'AxiosConfig ; un fetch brut ne l'enverrait pas).
 * - N'affiche jamais les enfants avant la fin de la vérification : sinon la
 *   page montait brièvement, lançait tous ses appels API, puis était démontée
 *   par la redirection — boucle de rechargement.
 * - `requireSuperAdmin` réserve la route au rôle super-administrateur.
 * - Un mot de passe provisoire limite l'accès au profil ; la page de profil
 *   elle-même reste affichable (sinon redirection vers elle-même en boucle).
 */
const ProtectedRoute = ({ isAuthenticated, children, requireSuperAdmin }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { setUser, setIsAdmin, setIsSuperAdmin } = useContext(userContext);
  const [access, setAccess] = useState("checking");

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      setAccess("checking");
      return () => {
        cancelled = true;
      };
    }

    setAccess("checking");
    const checkRole = async () => {
      try {
        const res = await axiosInstance.get("/api/v1/auth/users/me/");
        if (cancelled) return;

        const data = res.data || {};
        setIsAdmin(Boolean(data.is_staff || data.is_superuser));
        setIsSuperAdmin(Boolean(data.is_superadmin));

        if (data.doit_changer_mot_de_passe) {
          setAccess("must_change");
        } else if (requireSuperAdmin && !data.is_superadmin) {
          setAccess("denied");
        } else {
          setAccess("allowed");
        }
      } catch (err) {
        if (cancelled) return;

        if (err.response?.status === 401) {
          setUser({});
          setIsAdmin(false);
          setIsSuperAdmin(false);
        }
        setAccess("denied");
      }
    };

    checkRole();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, requireSuperAdmin, setUser, setIsAdmin, setIsSuperAdmin]);

  if (!isAuthenticated) {
    return <Navigate to="/portail-gestion/connexion" replace />;
  }

  if (access === "checking") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gray-50" role="status">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-yellow-500 border-t-transparent" />
        <span className="sr-only">{t("administrateurs.chargement")}</span>
      </div>
    );
  }

  if (access === "denied") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <h1 className="mb-2 text-xl font-semibold text-gray-800">
            {t("profil.acces_refuse_titre")}
          </h1>
          <p className="mb-6 text-gray-600">{t("profil.acces_refuse")}</p>
          <Navigate to="/portail-gestion/connexion" replace />
        </div>
      </div>
    );
  }

  if (access === "must_change") {
    // La page de profil est la seule autorisée tant que le mot de passe
    // provisoire n'a pas été remplacé. Rediriger depuis cette page vers
    // elle-même provoquerait une boucle de navigation.
    if (pathname === "/portail-gestion/profil") {
      return children;
    }
    return <Navigate to="/portail-gestion/profil" replace />;
  }

  return children;
};

export default ProtectedRoute;
