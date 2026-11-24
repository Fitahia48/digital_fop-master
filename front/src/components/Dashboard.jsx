import React, { useState, useEffect, useContext, useRef } from 'react';
import axiosInstance from './AxiosConfig';
import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faComment, faFileAlt, faChartBar, faStar, faUsers, faCircleQuestion, faSquarePlus, faScaleBalanced } from '@fortawesome/free-solid-svg-icons';
import { FaStar } from "react-icons/fa";
import { userContext } from './Context';
import { Link } from 'react-router-dom';
import RealTimeVisitors from './RealTimeVisitors';

import Documents from './AfficherDocs';
import AdminRemarks from './AdminRemarks';
import CorpsFilteredList from './CorpsFilteredList';

const Dashboard = () => {
  const { user } = useContext(userContext);
  const [showRemarks, setShowRemarks] = useState(false);
  const [totalStars, setTotalStars] = useState(0);

  // Refs pour chaque section
  const sections = {
    documents: useRef(null),
    status: useRef(null),
    remarques: useRef(null),
    etoiles: useRef(null),
    // Les anciennes sections « statistiques » et « transparence » ont été
    // remplacées par des raccourcis vers /admin/statistiques et /transparence
    // (page unique à onglets, composants communs).
  };

  const scrollTo = (sectionName) => {
    sections[sectionName]?.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const res = await axiosInstance.get("/api/app-ratings/total_stars/");
        setTotalStars(res.data.total_stars);
      } catch (error) {
        console.error("Erreur lors de la récupération des étoiles :", error);
      }
    };
    fetchStars();
  }, []);

  const formatNumber = (num) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "k";
    return num;
  };

  const cards = [
    { label: "Documents", icon: faFileAlt, section: "documents" },
    { label: "Status", icon: faUsers, section: "status" },
    { label: "Remarques", icon: faComment, section: "remarques" },
    { label: "Étoiles", icon: faStar, section: "etoiles" },
  ];

  return (
    <>
      {/* Section principale de navigation + actions - Design amélioré et centré */}
      <section className="pt-10 pb-10 shadow-sm">
        {/* En-tête de bienvenue centré avec design amélioré */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {/* Compteur de visiteurs — centré au-dessus du titre */}
          <div className="flex justify-center mb-6">
            <RealTimeVisitors />
          </div>

          {/* Bloc de bienvenue centralisé avec design moderne */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center gap-3 px-6 py-3 bg-blue-50 border border-blue-200 rounded-full mb-6">
              <FontAwesomeIcon icon={faScaleBalanced} className="text-blue-700 text-2xl" aria-hidden="true" />
              <span className="text-xl font-bold text-blue-900">Espace Administrateur</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-3">
              Tableau de bord
            </h1>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Gérez les documents, corps professionnels, remarques et consultez les statistiques
            </p>
          </div>

          {/* Grille de navigation centrée */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Liens vers sections (scrollTo) */}
            {cards.map(({ label, icon, section }) => (
              <motion.div
                key={section}
                className="bg-white shadow-md rounded-xl p-6 flex items-center space-x-4 cursor-pointer hover:bg-blue-50 hover:shadow-lg transition-all duration-200 border border-gray-100"
                onClick={() => scrollTo(section)}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-xl">
                  <FontAwesomeIcon icon={icon} className="text-blue-700 text-2xl" aria-hidden="true" />
                </div>
                <span className="text-lg font-semibold text-gray-800">{label}</span>
              </motion.div>
            ))}

            {/* Raccourcis vers la page unique de statistiques + transparence,
                et cartes d'ajout + gestion FAQ */}
            {[
              { label: "Statistiques", to: "/admin/statistiques", icon: faChartBar, color: "bg-purple-100 text-purple-700" },
              { label: "Transparence", to: "/transparence", icon: faScaleBalanced, color: "bg-amber-100 text-amber-700" },
              { label: "Ajouter un document", to: "/AjoutDoc", icon: faSquarePlus, color: "bg-emerald-100 text-emerald-700" },
              { label: "Ajouter un corps", to: "/AjoutCorps", icon: faSquarePlus, color: "bg-indigo-100 text-indigo-700" },
              { label: "Gérer la FAQ (chat)", to: "/admin/faq", icon: faCircleQuestion, color: "bg-rose-100 text-rose-700" }
            ].map(({ label, to, icon, color }, index) => (
              <motion.div
                key={`ajout-${index}`}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="bg-white shadow-md rounded-xl p-6 flex items-center space-x-4 cursor-pointer hover:shadow-lg transition-all duration-200 border border-gray-100"
              >
                <Link to={to} className="flex items-center space-x-4 w-full">
                  <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${color}`}>
                    <FontAwesomeIcon
                      icon={icon}
                      className="text-2xl"
                    />
                  </div>
                  <span className="text-md font-medium text-gray-800">{label}</span>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Sections */}
      <section ref={sections.documents}>
        <Documents isAdmin={true} />
      </section>

      <section ref={sections.status} className="mt-10">
        <h2 className="text-2xl font-semibold text-gray-300 text-center p-10">Status Particulier</h2>
        <CorpsFilteredList isAdmin={true} />
      </section>

      <section ref={sections.remarques} className="flex flex-col items-center justify-center mt-10">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-semibold text-gray-300">Voir les remarques des visiteurs</h2>
          <button
            onClick={() => setShowRemarks(!showRemarks)}
            aria-label="Afficher les remarques"
            className="focus:outline-none"
          >
            <FontAwesomeIcon icon={faComment} className="text-white h-10 w-10 hover:text-yellow-300" />
          </button>
        </div>
        {showRemarks && <AdminRemarks />}
      </section>

      <section ref={sections.etoiles} className="rounded-xl bg-white shadow-lg mt-8 w-full max-w-xl mx-auto p-6">
        <h2 className="text-2xl font-semibold text-gray-800 text-center">
          Total des étoiles reçues :
          <span className="ml-2 text-yellow-400 font-bold inline-flex items-center space-x-2">
            {formatNumber(totalStars)}
            <motion.div
              whileHover={{ scale: 1.3, rotate: -10 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <FaStar size={24} color="#ffc107" className="cursor-pointer transition-colors duration-300" />
            </motion.div>
          </span>
        </h2>
      </section>
    </>
  );
};

export default Dashboard;