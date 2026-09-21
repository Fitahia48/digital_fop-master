import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { register, reset } from '../features/auth/authSlice';
import { toast } from 'react-toastify';

const Register = () => {
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    email: '',
    password: '',
    re_password: '',
  });
  const { nom, prenom, email, password, re_password } = formData;

  const dispatch = useDispatch();
  const { t } = useTranslation();
  const { isSuccess, isError, message } = useSelector((state) => state.auth);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password !== re_password) {
      toast.error(t('auth.mdp_differents'));
      return;
    }
    dispatch(register({ nom, prenom, email, password, re_password }));
  };

  useEffect(() => {
    if (isSuccess) {
      toast.success(t('auth.compte_cree'));
      setFormData({ nom: '', prenom: '', email: '', password: '', re_password: '' });
    }
    if (isError) {
      // Le backend renvoie { champ: [messages] } ou { detail }
      const detail = typeof message === 'object' && message !== null
        ? Object.values(message).flat().join(' ')
        : String(message || '');
      toast.error(detail || t('auth.inscription_erreur'));
    }
    dispatch(reset());
  }, [isSuccess, isError, message, dispatch]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-transparent mt-32">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-semibold text-center text-gray-800 mb-2">{t('auth.titre_inscription')}</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          {t('auth.intro_inscription')}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="register-nom" className="block text-gray-700 font-medium mb-2">{t('auth.nom')}</label>
              <input
                id="register-nom"
                type="text"
                name="nom"
                value={nom}
                onChange={handleChange}
                required
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="register-prenom" className="block text-gray-700 font-medium mb-2">{t('auth.prenom')}</label>
              <input
                id="register-prenom"
                type="text"
                name="prenom"
                value={prenom}
                onChange={handleChange}
                required
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="register-email" className="block text-gray-700 font-medium mb-2">{t('auth.email')}</label>
            <input
              id="register-email"
              type="email"
              name="email"
              value={email}
              onChange={handleChange}
              required
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="register-password" className="block text-gray-700 font-medium mb-2">
              {t('auth.mot_de_passe')} <span className="text-gray-500 font-normal">{t('auth.mot_de_passe_aide')}</span>
            </label>
            <input
              id="register-password"
              type="password"
              name="password"
              value={password}
              onChange={handleChange}
              required
              minLength={8}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="register-re-password" className="block text-gray-700 font-medium mb-2">
              {t('auth.confirmer_mot_de_passe')}
            </label>
            <input
              id="register-re-password"
              type="password"
              name="re_password"
              value={re_password}
              onChange={handleChange}
              required
              minLength={8}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="bg-blue-900 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition duration-200"
          >
            {t('auth.creer_mon_compte')}
          </button>
        </form>

        <p className="text-sm text-gray-600 text-center mt-4">
          {t('auth.deja_compte')}{' '}
          <Link to="/login" className="text-blue-700 hover:underline">{t('auth.se_connecter')}</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
