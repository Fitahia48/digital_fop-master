import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import axiosInstance from '../components/AxiosConfig';

const UnsubscribePage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    const doUnsubscribe = async () => {
      try {
        const res = await axiosInstance.get(`/api/subscribers/unsubscribe/${token}/`);
        setMessage(res.data.detail || "Vous avez bien été désabonné. Vous ne recevrez plus d'alertes.");
        setStatus('success');
        toast.success('Désabonnement effectué avec succès.');
      } catch (err) {
        const msg =
          err.response?.data?.detail || 'Lien de désabonnement invalide ou déjà utilisé.';
        setMessage(msg);
        setStatus('error');
        toast.error(msg);
      }
    };
    doUnsubscribe();
  }, [token]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 px-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-yellow-500 border-t-transparent mx-auto mb-4" />
            <p className="text-gray-600">Traitement en cours…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-green-500 text-5xl mb-4">✓</div>
            <h1 className="text-2xl font-semibold text-gray-800 mb-2">Désabonnement confirmé</h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-semibold rounded-lg transition-colors"
              id="unsub-home-btn"
            >
              Retour à l'accueil
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-red-500 text-5xl mb-4">✗</div>
            <h1 className="text-2xl font-semibold text-gray-800 mb-2">Désabonnement impossible</h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors"
              id="unsub-error-home-btn"
            >
              Retour à l'accueil
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default UnsubscribePage;
