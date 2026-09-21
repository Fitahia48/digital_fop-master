import React, { useState } from 'react';
import { toast } from 'react-toastify';
import axiosInstance from './AxiosConfig';

const SubscribeForm = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Veuillez saisir une adresse email.');
      return;
    }

    setLoading(true);
    try {
      const res = await axiosInstance.post('/api/subscribers/subscribe/', { email: trimmed });
      toast.success(res.data.detail || 'Inscription prise en compte. Vérifiez votre boîte mail.');
      setEmail('');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Une erreur est survenue. Veuillez réessayer.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold text-white mb-1">
        Restez informé(e) des nouveautés
      </h3>
      <p className="text-gray-300 text-sm mb-3">
        Recevez une alerte par email à chaque publication d'un document ou d'une actualité.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Votre adresse email"
          disabled={loading}
          required
          className="flex-1 px-4 py-2 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:opacity-60"
          aria-label="Adresse email pour l'abonnement aux actualités"
          id="subscribe-email-input"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          id="subscribe-submit-btn"
        >
          {loading ? 'Envoi…' : "S'abonner"}
        </button>
      </form>
    </div>
  );
};

export default SubscribeForm;
