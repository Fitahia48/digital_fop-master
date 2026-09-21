import React, { useContext, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ToastContainer } from 'react-toastify'
import Login from './components/Login';
import Dashboard from './components/Dashboard'
import Accueil from './components/Accueil';
import Menu from './components/Menu';
import 'react-toastify/dist/ReactToastify.css';
import ResetPassword from './components/ResetPassword';
import axios from 'axios';
import AjouterDocument from './components/AddDocs';
import EditDocument from './components/EditDoc';
import { userContext } from './components/Context';
import CorpsForm from './components/AjoutCorps';
import ProtectedRoute from './components/ProtectedRoute';
import axiosInstance from './components/AxiosConfig';
import ResetPasswordConfirmPage from './components/ResetPasswordConfirmPage';
import Header from './components/Header';
import Footer from './components/Footer';
import AddActus from './components/AddActus';
import RemarkForm from "./components/RemarkForm";
import AdminRemarks from "./components/AdminRemarks";
import Documents from './components/AfficherDocs';
import AnimatedCard from './components/AnimatedCard';
import OrganigrammePage from './components/OrganigrammePage';
import CorpsFilteredList from './components/CorpsFilteredList';
import EditCorpsForm from './components/EditCorpsForm';
import ConfirmSubscriptionPage from './pages/ConfirmSubscriptionPage';
import UnsubscribePage from './pages/UnsubscribePage';
import SearchShortcut from './components/SearchShortcut';
import HelpPage from './pages/HelpPage';
import Register from './components/Register';
import ActivateAccountPage from './pages/ActivateAccountPage';
import DemarcheForm from './components/DemarcheForm';
import MesDemarches from './components/MesDemarches';
import MesFavoris from './components/MesFavoris';
import AdminFaq from './components/AdminFaq';
import ChatWidget from './components/ChatWidget';
import OfflineBanner from './components/OfflineBanner';
import TransparencePage from './components/TransparencePage';
axios.defaults.withCredentials = true;

const App = () => {
    const { user, setUser, isAdmin, setIsAdmin, setSelectedDomaine } = useContext(userContext)
    const [token] = useState(JSON.parse(localStorage.getItem('user')))
    useEffect(() => {
        if (token) {
            setUser(token)
        }
    }, [])
    // Récupère le profil (rôle admin) quand un token est présent
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await axiosInstance.get('/api/v1/auth/users/me/', {
                    headers: { Authorization: `Bearer ${token.access}` },
                });
                setIsAdmin(Boolean(res.data.is_staff || res.data.is_superuser));
            } catch (err) {
                console.error('Erreur lors de la récupération du profil :', err);
                setIsAdmin(false);
            }
        };
        if (token?.access) {
            fetchProfile();
        }
    }, [])

    return (
        <>
            <div className='bg-gray-900'>
                <Header />
                <ToastContainer />
                <Router>
                    <SearchShortcut />
                    {/* Bandeau hors-ligne (F10) : visible uniquement sans connexion */}
                    <OfflineBanner />
                    <Menu user={user} onSelectDomaine={setSelectedDomaine} />
                    {/* Cible du lien d'évitement « Aller au contenu principal » (Header) */}
                    <main id="contenu-principal">
                    <Routes>
                        <Route path="/" element={<Accueil />} />
                        <Route path='/login' element={<Login />} />
                        <Route path='/resetpassword' element={<ResetPassword />} />
                        <Route path='/password/reset/confirm/:uid/:token' element={<ResetPasswordConfirmPage />} />
                        <Route path='/subscribe/confirm/:token' element={<ConfirmSubscriptionPage />} />
                        <Route path='/unsubscribe/:token' element={<UnsubscribePage />} />
                        <Route path='/dashboard' element={<ProtectedRoute isAuthenticated={user.refresh}><Dashboard /></ProtectedRoute>} />
                        <Route path='/AjoutDoc' element={<ProtectedRoute isAuthenticated={user.refresh}><AjouterDocument /></ProtectedRoute>} />
                        <Route path="/edit/:id" element={<ProtectedRoute isAuthenticated={user.refresh}><EditDocument /></ProtectedRoute>} />
                        <Route path="/editCorps/:id" element={<ProtectedRoute isAuthenticated={user.refresh}><EditCorpsForm /></ProtectedRoute>} />
                        <Route path='/AjoutCorps' element={<ProtectedRoute isAuthenticated={user.refresh}><CorpsForm /></ProtectedRoute>} />
                        <Route path='/AjoutActus' element={<ProtectedRoute isAuthenticated={user.refresh}><AddActus /></ProtectedRoute>} />
                        <Route path="/remarks" element={<RemarkForm />} />
                        <Route path='/AfficherDoc' element={<Documents isAdmin={isAdmin} />} />
                        <Route path='/status' element={<CorpsFilteredList />} />
                        <Route path="/admin/remarks" element={<ProtectedRoute isAuthenticated={user.refresh}><AdminRemarks /></ProtectedRoute>} />
                        <Route path="/animated" element={<AnimatedCard />} />
                        <Route path="/organigramme" element={<OrganigrammePage />} />
                        <Route path="/aide" element={<HelpPage />} />
                        {/* Page publique (F12) : accessible sans connexion, aucune route protégée */}
                        <Route path="/transparence" element={<TransparencePage />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/activate/:uid/:token" element={<ActivateAccountPage />} />
                        <Route path="/demarches/nouvelle" element={<DemarcheForm />} />
                        <Route path="/mes-demarches" element={<MesDemarches />} />
                        <Route path="/mes-favoris" element={<MesFavoris />} />
                        <Route path="/admin/faq" element={<ProtectedRoute isAuthenticated={user.refresh}><AdminFaq /></ProtectedRoute>} />
                        <Route path='*' element={<Accueil />} />
                    </Routes>
                    </main>
                    {/* Le Footer doit rester dans le Router : il utilise useNavigate (« Revoir le guide ») */}
                    <Footer />
                    {/* Bulle de chat FAQ (F9) : doit être dans le Router pour pouvoir naviguer */}
                    <ChatWidget />
                </Router>
            </div>

        </>
    );
};

export default App;
