import React, { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axiosInstance from './AxiosConfig';
import { useDispatch, useSelector } from 'react-redux'
import { login, reset } from '../features/auth/authSlice'
import { toast } from 'react-toastify';
import { userContext } from './Context';

function Login() {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        "email": "",
        "password": "",
    })
    const { setUser } = useContext(userContext)

    const [token] = useState(JSON.parse(localStorage.getItem('user')))

    const { email, password } = formData

    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { user, isLoading, isError, isSuccess, message } = useSelector((state) => state.auth)

    const handleChange = (e) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value
        })
        )
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        const userData = {
            email,
            password,
        }
        dispatch(login(userData))
    }
    useEffect(() => {
        if (isError) {
            toast.error(t('auth.identifiants_invalides'))
        }

        if (isSuccess || user) {



            if (JSON.parse(localStorage.getItem('user'))) {
                setUser(JSON.parse(localStorage.getItem('user')))
                // Redirection différenciée : admin → dashboard, usager standard → accueil
                const redirectAfterLogin = async () => {
                    try {
                        const stored = JSON.parse(localStorage.getItem('user'));
                        const res = await axiosInstance.get('/api/v1/auth/users/me/', {
                            headers: { Authorization: `Bearer ${stored?.access}` },
                        });
                        const isAdminUser = Boolean(res.data.is_staff || res.data.is_superuser);
                        if (isAdminUser) {
                            navigate("/dashboard");
                            toast.success(t('auth.bienvenue_dashboard'));
                        } else {
                            navigate("/");
                            toast.success(t('auth.bienvenue_usager'));
                        }
                    } catch {
                        // En cas d'échec du profil, comportement historique par prudence
                        navigate("/dashboard");
                    }
                };
                redirectAfterLogin();
            }

        }

        dispatch(reset());
    }, [isError, isSuccess, user, message, navigate]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-transparent">
            <div className="flex flex-col md:flex-row bg-white rounded-lg shadow-lg overflow-hidden w-full md:w-1/2 lg:w-1/2">

                {/* Image Section */}
                <div className="w-full md:w-1/2 bg-cover bg-center animate__animated animate__flipInY lg:mt-5"
                    style={{ backgroundImage: "url('../../public/login2.jpg')", height: "300px", backgroundSize: "cover", backgroundPosition: "center" }}>
                </div>

                {/* Form Section */}
                <div className="w-full md:w-1/2 p-6 animate__animated animate__jackInTheBox">
                    <h1 className="text-2xl font-semibold text-center text-gray-800 mb-4">{t('auth.se_connecter')}</h1>
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <input
                                type="email"
                                name="email"
                                value={email}
                                onChange={handleChange}
                                placeholder={t('auth.email')}
                                aria-label={t('auth.email')}
                                className="w-full px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="mb-4">
                            <input
                                type="password"
                                name="password"
                                value={password}
                                onChange={handleChange}
                                placeholder={t('auth.mot_de_passe')}
                                aria-label={t('auth.mot_de_passe')}
                                className="w-full px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="flex items-center justify-between mb-4">
                            <a href="/resetpassword" className="text-sm text-indigo-500 hover:underline">
                                {t('auth.mot_de_passe_oublie')}
                            </a>
                        </div>
                        <button
                            type="submit"
                            className="w-full px-4 py-2 text-sm font-medium rounded-xl text-white bg-gradient-to-r from-blue-800 to-teal-600 hover:from-blue-600 hover:to-teal-700 transition ..."
                        >
                            {t('auth.se_connecter')}
                        </button>
                        <p className="text-sm text-gray-600 text-center mt-4">
                            {t('auth.pas_encore_compte')}{' '}
                            <Link to="/register" className="text-indigo-500 hover:underline">
                                {t('auth.creer_compte')}
                            </Link>
                        </p>
                    </form>
                </div>
            </div>
        </div>

    );
}

export default Login;