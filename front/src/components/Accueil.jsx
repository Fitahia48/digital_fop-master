import React, { useState, useEffect, useRef, useMemo, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import img1 from "/1.jpg";
import img2 from "/3.jpg";
import img3 from "/9.jpg";
import img4 from '../assets/Images/Image1.png';
import img5 from '../assets/Images/Image2.png';
import Documents from './AfficherDocs';
import AfficheActus from './AfficheActus';
import AnimatedCard from './AnimatedCard';
import axiosInstance from './AxiosConfig';
import AppRating from './AppRating';
import SubscribeForm from './SubscribeForm';
import OnboardingTour from './OnboardingTour';
import { motion } from "framer-motion";
import { userContext } from './Context';
// Formats des statistiques SANS Chart.js (le compteur reste léger).
import { formatNombre } from './stats/formats';

const Accueil = () => {
  const { t, i18n } = useTranslation();
  const { isAdmin } = useContext(userContext);
  const [active, setActive] = useState(0);
  const [prev, setPrev] = useState(0);
  const [data, setData] = useState({ totalVisits: 0, uniqueVisitors: 0, totalVisitsPerDay: [], uniqueVisitorsPerDay: [], visitsToday: 0 });
  // Refs
  const contentRef = useRef(null);
  const prevRef = useRef(null);
  const nextRef = useRef(null);
  const nameRef = useRef("");
  const textRef = useRef("");

  // Textes des slides : les clés i18n contiennent du <strong> (rendu innerHTML, contenu statique des JSON)
  const sliderContent = useMemo(() => [
    {
      img: img1,
      name: t('accueil.slide1_titre'),
      Text: t('accueil.slide1_texte'),
      textKey: 'accueil.slide1_texte',
    },
    {
      img: img2,
      name: t('accueil.slide2_titre'),
      Text: t('accueil.slide2_texte'),
      textKey: 'accueil.slide2_texte',
    },
    {
      img: img3,
      name: t('accueil.slide3_titre'),
      Text: t('accueil.slide3_texte'),
      textKey: 'accueil.slide3_texte',
    },
    {
      img: img4,
      name: t('accueil.slide4_titre'),
      Text: t('accueil.slide4_texte'),
      textKey: 'accueil.slide4_texte',
    },
    {
      img: img5,
      name: t('accueil.slide5_titre'),
      Text: t('accueil.slide5_texte'),
      textKey: 'accueil.slide5_texte',
    },
  ], [t]);
  const Slide = (type) => {
    let local;
    if (type === 'next') {
      local = active + 1;
      setActive(local >= sliderContent.length ? 0 : local);
    }

    if (type === 'prev') {
      local = active - 1;
      setActive(local < 0 ? sliderContent.length - 1 : local);
    }
    setPrev(active);
  };
  const scrollDown = () => {
    window.scrollTo({
      top: window.innerHeight,
      behavior: 'smooth'
    });
  };

  // Effect hook to handle initial setup and automatic slide change
  useEffect(() => {
    // Initial animations setup
    contentRef.current.style.left = '-100%';
    prevRef.current.style.left = '-10%';
    nextRef.current.style.right = '-10%';

    // Simulate slide transition
    setTimeout(() => {
      nameRef.current.innerText = sliderContent[active].name;
      // Les traductions contiennent du <strong> : innerHTML assumé (contenu statique des JSON, pas d'entrée utilisateur)
      textRef.current.innerHTML = sliderContent[active].Text;
      contentRef.current.style.left = '5%';
      prevRef.current.style.left = '0%';
      nextRef.current.style.right = '0%';
    }, 1000);

    // Automatic slide change every 10 seconds
    const intervalId = setInterval(() => {
      setActive((prevActive) => (prevActive === sliderContent.length - 1 ? 0 : prevActive + 1));
    }, 10000);

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, [active, sliderContent]);

  // Fetch statistics only for admins
  useEffect(() => {
    if (isAdmin) {
      fetchStatistics();
    }
  }, [isAdmin]);

  const fetchStatistics = async () => {
    try {
      const { data: stats } = await axiosInstance.get("/api/visit-statistics/");
      setData({
        totalVisits: stats.total_visits || 0,
        uniqueVisitors: stats.unique_visitors || 0,
        totalVisitsPerDay: stats.total_visits_per_day || [],
        uniqueVisitorsPerDay: stats.unique_visitors_perDay || [],
        visitsToday: stats.visits_today || 0,
      });
    } catch (error) {
      console.error("Erreur lors de la récupération des statistiques :", error);
      setData({ totalVisits: 0, uniqueVisitors: 0, totalVisitsPerDay: [], uniqueVisitorsPerDay: [], visitsToday: 0 });
    }
  };

  return (
    <>
      {/* Visite guidée (1re visite uniquement, relançable depuis le pied de page) */}
      <OnboardingTour />
      <div className="relative shadow-lg overflow-hidden ">
        {/* Slider Container */}
        <div className="w-full h-[300px] sm:h-[400px] md:h-[500px] lg:h-[600px] relative">
          {sliderContent.map((slide, i) => (
            <>
              <img
                key={i}
                src={slide.img}
                alt="slideImg"
                className={`h-full w-full absolute object-cover inset-0 duration-[2.5s] ease-out transition-[clip-path] ${i === active ? "clip-visible" : "clip-hidden"}`}
              />
            </>
          ))}
        </div>
        {/* Compteur de visiteurs du jour — visible des administrateurs uniquement.
            Libellé explicite + indicateur « en direct » discret ; pulsation
            respectant prefers-reduced-motion (motion-reduce:animate-none). */}
        {isAdmin && (
          <div className="fixed-visits text-white" role="status">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-300">
              {t('accueil.visitors_today')}
            </p>
            <p className="text-3xl font-bold tabular-nums leading-tight">
              {formatNombre(i18n.language, data.visitsToday)}
            </p>
            <p className="text-[11px] text-gray-300 mt-0.5">{t('stats.compteur_aide')}</p>
            <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-green-300">
              <span
                className="h-2 w-2 rounded-full bg-green-400 animate-pulse motion-reduce:animate-none"
                aria-hidden="true"
              />
              {t('stats.en_direct')}
            </span>
          </div>
        )}
        {/* Navigation Buttons */}
        <div>
          <button id="back" ref={prevRef} onClick={() => Slide("prev")} className="absolute left-2 sm:left-4 top-1/2 transform -translate-y-1/2 text-white text-3xl sm:text-4xl hover:scale-125 transition-transform">
            <ion-icon name="chevron-back-outline"></ion-icon>
          </button>
          <button id="forward" ref={nextRef} onClick={() => Slide("next")} className="absolute right-2 sm:right-4 top-1/2 transform -translate-y-1/2 text-white text-3xl sm:text-4xl hover:scale-125 transition-transform">
            <ion-icon name="chevron-forward-outline"></ion-icon>
          </button>
        </div>

        {/* Slider Content */}
        <div className="content" ref={contentRef}>
          <div className="flex flex-col justify-center h-full">
            <h1 ref={nameRef} className="text-xl sm:text-2xl md:text-3xl lg:text-4xl text-white font-bold">
              {sliderContent[active].name}
            </h1>
            <p ref={textRef} className="mt-2 sm:mt-3 text-sm sm:text-base md:text-lg lg:text-xl text-left text-white">
              {sliderContent[active].Text}
            </p>
          </div>
        </div>
        {/* Flèche pour descendre */}
        <motion.div
          className="absolute bottom-0.5 sm:bottom-10 md:bottom-12 lg:bottom-16 left-1/2 transform -translate-x-1/2 cursor-pointer text-white backdrop-blur-sm sm:backdrop-blur-md md:backdrop-blur-lg lg:backdrop-blur-xl p-2 sm:p-3 md:p-4 rounded-lg"
          onClick={scrollDown}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: "mirror" }}
        >
          <ion-icon
            name="chevron-down-circle-outline"
            className="text-4xl sm:text-5xl md:text-6xl lg:text-5xl hover:text-gray-300"
          ></ion-icon>
        </motion.div>
      </div>

      {/* Other Components */}
      <Documents />
      <div>
        <h1 id="onboarding-news" className="text-2xl font-semibold text-gray-400 px-5 py-5 flex flex-col items-center justify-center">{t('accueil.actualites')}</h1>
        <AfficheActus />
      </div>
      {/* Alertes de publication (abonnement email) */}
      <section
        id="subscribe-section"
        className="bg-gray-900 py-8 px-4 sm:px-12 mt-10"
        aria-label="S'abonner aux alertes de publication"
      >
        <div className="max-w-3xl mx-auto">
          <SubscribeForm />
        </div>
      </section>
      <div className='bg-gradient-to-br from-primary/70 grid place-items-center'>
        <AnimatedCard />
      </div>
      <div className='apprating'>
        <AppRating />
      </div>
    </>
  );
};

export default Accueil;