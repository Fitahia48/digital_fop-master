import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import axiosInstance from "./AxiosConfig";

const RealTimeVisitors = () => {
  const { t } = useTranslation();
  const [visitors, setVisitors] = useState(0);

  const formatNumber = (num) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "k";
    return num;
  };

  useEffect(() => {
    const fetchVisitors = async () => {
      try {
        const res = await axiosInstance.get("/api/visit-statistics/");
        // Visiteurs (uniques) du jour — fuseau Madagascar. L'API expose aussi
        // `visitors_online` (présence sur 5 min), non affiché ici.
        setVisitors(res.data.visits_today ?? 0);
      } catch (error) {
        console.error("Erreur lors de la récupération des visiteurs en temps réel :", error);
      }
    };

    // Fetch immediately
    fetchVisitors();

    // Poll every 5 seconds
    const interval = setInterval(fetchVisitors, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="realtime-visitors text-white"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, repeat: Infinity, repeatType: "mirror" }}
      layout
    >
      <p>
        {t('accueil.visitors_today')} :{" "}
        <motion.span
          className="font-bold text-3xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity, repeatType: "mirror" }}
        >
          {formatNumber(visitors)}
        </motion.span>
      </p>
    </motion.div>
  );
};

export default RealTimeVisitors;