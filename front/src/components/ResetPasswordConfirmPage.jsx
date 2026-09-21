import React, { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { useNavigate, useParams } from 'react-router-dom'
import { resetPasswordConfirm } from '../features/auth/authSlice'

const ResetPasswordConfirmPage = () => {

  const { uid, token } = useParams()
  const [formData, setFormData] = useState({
    'new_password': '',
    're_new_password': ''
  })
  const { new_password, re_new_password } = formData
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const { isLoading, isError, isSuccess, message } = useSelector((state) => state.auth)

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (new_password !== re_new_password) {
      toast.error(t('auth.mdp_differents'));
      return;
    }
    const userData = {
      uid,
      token,
      new_password,
      re_new_password
    };
    dispatch(resetPasswordConfirm(userData));
  };

  useEffect(() => {
    if (isError) {
      toast.error(message);
    }
    if (isSuccess) {
      navigate("/");
      toast.success(t('auth.reset_succes'));
    }
  }, [isError, isSuccess, message, navigate]);


  return (
    <div className="flex items-center justify-center min-h-screen bg-transparent">
      <div className="flex bg-white rounded-lg shadow-lg overflow-hidden w-1/2">
        <div className="hidden md:block w-1/2 bg-cover bg-center animate__animated animate__flipInY"
          style={{
            backgroundImage: "url('../../public/confirm.png')", width: "50%",
            height: "auto", backgroundSize: "cover",
            backgroundPosition: "center",
          }}>
        </div>
        <div className="w-full max-w-sm bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-semibold text-center text-gray-800 mb-4">{t('auth.reset_confirm_titre')}</h1>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <input
                type="password"
                name="new_password"
                value={new_password}
                onChange={handleChange}
                placeholder={t('auth.nouveau_mot_de_passe')}
                aria-label={t('auth.nouveau_mot_de_passe')}
                className="w-full px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="mb-4">
              <input
                type="password"
                name="re_new_password"
                value={re_new_password}
                onChange={handleChange}
                placeholder={t('auth.confirmer_nouveau_mot_de_passe')}
                aria-label={t('auth.confirmer_nouveau_mot_de_passe')}
                className="w-full px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {t('auth.confirmer')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ResetPasswordConfirmPage