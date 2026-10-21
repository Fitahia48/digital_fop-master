import React, { useContext, useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
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
import ScrollToTop from './components/ScrollToTop';
import AddActus from './components/AddActus';
import RemarkForm from "./components/RemarkForm";
import AdminRemarks from "./components/AdminRemarks";
import AdminSubscribers from "./components/AdminSubscribers";
import Documents from './components/AfficherDocs';
import AnimatedCard from './components/AnimatedCard';
import OrganigrammePage from './components/OrganigrammePage';
import CorpsFilteredList from './components/CorpsFilteredList';
import EditCorpsForm from './components/EditCorpsForm';
import ConfirmSubscriptionPage from './pages/ConfirmSubscriptionPage';
import UnsubscribePage from './pages/UnsubscribePage';
import SearchShortcut from './components/SearchShortcut';
import HelpPage from './pages/HelpPage';
import ActivateAccountPage from './pages/ActivateAccountPage';
import AdminFaq from './components/AdminFaq';
import ChatWidget from './components/ChatWidget';
import OfflineBanner from './components/OfflineBanner';
import RightColumn from './components/RightColumn';
import TransparencePage from './components/TransparencePage';
import DocumentFiche from './components/DocumentFiche';
import AProposPage from './components/AProposPage';
// Page unique à onglets des statistiques (chargée en lazy : Chart.js et les
// graphiques ne sont téléchargés qu'à l'ouverture de la page).
const AdminStats = lazy(() => import('./components/AdminStats'));
axios.defaults.withCredentials = true;

// Comptage anonyme des visites : UN SEUL ping par session de navigateur au
// montage de l'application (et non à chaque changement de page). Le serveur
// ne compte ce visiteur qu'une seule fois par jour (fuseau Madagascar) ; les
// erreurs sont ignorées silencieusement — le comptage ne bloque jamais la
// navigation. Le garde ci-dessous neutralise aussi le double montage de
// React.StrictMode en développement.
let visiteurPingue = false;

const App = () => {
    const { user, setUser, isAdmin, setIsAdmin, setSelectedDomaine } = useContext(userContext)
    const [token] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('user') || 'null')
        } catch {
            return null
        }
    })
    useEffect(() => {
        if (token) {
            setUser(token)
        }
    }, [])
    // Récupère le profil (rôle admin) quand un token est présent.
    // Étape 7 : /api/v1/auth/users/me/ est servi par Strapi (module auth-compat),
    // la forme de réponse legacy est conservée (is_staff/is_superuser issus du
    // rôle U&P). On ne force PAS l'en-tête Authorization ici : l'intercepteur
    // d'AxiosConfig ajoute le Bearer et gère son renouvellement, et un header
    // figé au montage empêcherait ce renouvellement (401 définitif).
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await axiosInstance.get('/api/v1/auth/users/me/');
                setIsAdmin(Boolean(res.data.is_staff || res.data.is_superuser));
            } catch (err) {
                const status = err.response?.status;
                // 401 = plus de session valide : on repasse en visiteur anonyme.
                if (status === 401) {
                    setUser({})
                    setIsAdmin(false)
                    return;
                }
                console.error('Erreur lors de la récupération du profil :', err);
                setIsAdmin(false);
            }
        };
        if (token?.access) {
            fetchProfile();
        }
    }, [])

    // Session purgée par AxiosConfig (refresh refusé) → on vide le contexte.
    useEffect(() => {
        const onExpired = () => {
            setUser({})
            setIsAdmin(false)
        }
        window.addEventListener('auth:session-expired', onExpired)
        return () => window.removeEventListener('auth:session-expired', onExpired)
    }, [])

    // Visite de l'application — 1 appel au montage (voir visiteurPingue).
    useEffect(() => {
        if (visiteurPingue) return
        visiteurPingue = true
        axiosInstance.post('/api/visites/ping/').catch(() => {})
    }, [])

    return (
        <>
            <div className='bg-gray-900'>
                <Header />
                <ToastContainer />
                <Router>
                    {/* Remet la page en haut à chaque navigation : les liens du
                        pied de page ouvrent sinon la nouvelle page à la même
                        hauteur de défilement (on restait sur le bas de page). */}
                    <ScrollToTop />
                    <SearchShortcut />
                    {/* Bandeau hors-ligne (F10) : visible uniquement sans connexion */}
                    <OfflineBanner />
                    <Menu user={user} onSelectDomaine={setSelectedDomaine} />
                    {/* Cible du lien d'évitement « Aller au contenu principal » (Header) */}
                    <main id="contenu-principal">
                    <Routes>
                        <Route path="/" element={<Accueil />} />
                        {/* Connexion administrateur : URL non listée dans la
                            navigation publique (aucun lien vers elle). */}
                        <Route path='/portail-gestion/connexion' element={<Login />} />
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
                        {/* Fiche documentaire à URL stable (P1) — publique, le serveur
                            renvoie 404 pour les notices non validées */}
                        <Route path='/documents/:id' element={<DocumentFiche />} />
                        <Route path='/status' element={<CorpsFilteredList />} />
                        <Route path="/admin/remarks" element={<ProtectedRoute isAuthenticated={user.refresh}><AdminRemarks /></ProtectedRoute>} />
                        {/* Espace « Abonnés » : ProtectedRoute + vérification admin
                            réalisée dans AdminSubscribers (appel /users/me) ; le
                            serveur refuse aussi tout non-admin (double verrou). */}
                        <Route path="/admin/abonnes" element={<ProtectedRoute isAuthenticated={user.refresh}><AdminSubscribers /></ProtectedRoute>} />
                        {/* Statistiques administrateur : page unique à onglets.
                            Même verrou que les anciennes sections du dashboard
                            (authentification) — aucune règle d'accès modifiée. */}
                        <Route
                            path="/admin/statistiques"
                            element={
                                <ProtectedRoute isAuthenticated={user.refresh}>
                                    <Suspense
                                        fallback={(
                                            <div className="flex items-center justify-center py-24" role="status">
                                                <span className="animate-spin rounded-full h-8 w-8 border-4 border-yellow-500 border-t-transparent" />
                                                <span className="sr-only">Chargement…</span>
                                            </div>
                                        )}
                                    >
                                        <AdminStats />
                                    </Suspense>
                                </ProtectedRoute>
                            }
                        />
                        <Route path="/animated" element={<AnimatedCard />} />
                        <Route path="/organigramme" element={<OrganigrammePage />} />
                        <Route path="/aide" element={<HelpPage />} />
                        {/* Page transparence désormais réservée aux admins */}
                        <Route path="/transparence" element={<ProtectedRoute isAuthenticated={user.refresh}><TransparencePage /></ProtectedRoute>} />
                        {/* Page institutionnelle publique « À propos » (Single Type éditable en admin) */}
                        <Route path="/a-propos" element={<AProposPage />} />
                        <Route path="/activate/:uid/:token" element={<ActivateAccountPage />} />
                        <Route path="/admin/faq" element={<ProtectedRoute isAuthenticated={user.refresh}><AdminFaq /></ProtectedRoute>} />
                        <Route path='*' element={<Accueil />} />
                    </Routes>
                    </main>
                    {/* Le Footer doit rester dans le Router : il utilise useNavigate (« Revoir le guide ») */}
                    <Footer />
                    {/* Colonne droite : assistant MTeFOP (déconnexion uniquement dans le menu) */}
                    <RightColumn />
                </Router>
            </div>

        </>
    );
};

export default App;