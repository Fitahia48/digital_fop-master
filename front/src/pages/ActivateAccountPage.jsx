import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../components/AxiosConfig';

/**
 * Page atteinte via le lien d'activation reçu par email :
 * /activate/:uid/:token — appelle POST /api/v1/auth/users/activation/
 * (endpoint existant) avec le couple { uid, token }.
 */
const ActivateAccountPage = () => {
  const { uid, token } = useParams();
  const { t } = useTranslation();
  const [state, setState] = useState({ status: 'loading', message: '' });

  useEffect(() => {
    const activate = async () => {
      try {
        const res = await axiosInstance.post('/api/v1/auth/users/activation/', { uid, token });
        setState({ status: 'success', message: res.data.detail || 'Compte activé avec succès.' });
      } catch (err) {
        const detail = err.response?.data?.detail || "Lien d'activation invalide ou expiré.";
        setState({ status: 'error', message: detail });
      }
    };
    activate();
  }, [uid, token]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-transparent mt-32">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
        {state.status === 'loading' && (
          <>
            <h1 className="text-xl font-semibold text-gray-800 mb-3">{t('auth.activation_cours')}</h1>
            <p className="text-gray-500">{t('auth.activation_attente')}</p>
          </>
        )}
        {state.status === 'success' && (
          <>
            <h1 className="text-xl font-semibold text-emerald-700 mb-3">{t('auth.activation_succes')}</h1>
            <p className="text-gray-600 mb-6">{state.message}</p>
            <Link
              to="/login"
              className="inline-block bg-blue-900 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition"
            >
              {t('auth.se_connecter')}
            </Link>
          </>
        )}
        {state.status === 'error' && (
          <>
            <h1 className="text-xl font-semibold text-red-700 mb-3">{t('auth.activation_echec')}</h1>
            <p className="text-gray-600 mb-6">{state.message}</p>
            <Link to="/register" className="text-blue-700 hover:underline">
              {t('auth.activation_recreer')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default ActivateAccountPage;
