import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import axiosInstance from "./AxiosConfig";
import Cookies from "js-cookie";
import { FaStar } from "react-icons/fa";
import { motion } from "framer-motion";
import { toast } from "react-toastify";

const AppRating = () => {
    const { t } = useTranslation();
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(null);
    const [averageRating, setAverageRating] = useState(0);
    const [alreadyRated, setAlreadyRated] = useState(false);

    useEffect(() => {
        let sessionId = Cookies.get("session_id");
        if (!sessionId) {
            sessionId = Math.random().toString(36).substr(2, 9);
            Cookies.set("session_id", sessionId, { expires: 365 });
        }

        axiosInstance.get("/api/app-ratings/")
            .then(res => {
                const results = Array.isArray(res.data) ? res.data : (res.data.results || []);
                const hasRated = results.some(r => r.session_id === sessionId);
                setAlreadyRated(hasRated);
            })
            .catch(err => console.error(err));

        axiosInstance.get("/api/app-ratings/average_rating/")
            .then(res => setAverageRating(res.data.average_rating || 0))
            .catch(err => console.error(err));
    }, []);

    const handleRatingSubmit = (stars) => {
        if (alreadyRated) {
            toast.info(t("feedback.deja_note"));
            return;
        }

        axiosInstance.post("/api/app-ratings/",
            { stars, session_id: Cookies.get("session_id") }
        )
            .then(() => {
                toast.success(t("feedback.merci_avis"));
                setAlreadyRated(true);
                setRating(stars);
            })
            .catch(err => {
                console.error(err);
                toast.error(t("feedback.avis_erreur"));
            });
    };

    return (
        <>
            {!alreadyRated && (
                <div style={{ textAlign: "center", padding: "20px" }}>
                    <h2>{t("feedback.notez_app")}</h2>

                    {/* ANIMATION DES ÉTOILES — boutons accessibles (clavier + lecteur d'écran) */}
                    <div style={{ display: "flex", justifyContent: "center", gap: "10px" }} role="group" aria-label={t("feedback.groupe_etoiles")}>
                        {[...Array(5)].map((_, index) => {
                            const starValue = index + 1;
                            return (
                                <motion.div
                                    key={index}
                                    whileHover={{ scale: 1.3, rotate: -10 }}  // Effet de zoom et rotation
                                    whileTap={{ scale: 0.9 }}  // Effet au clic
                                    transition={{ type: "spring", stiffness: 300 }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleRatingSubmit(starValue)}
                                        onMouseEnter={() => setHover(starValue)}
                                        onMouseLeave={() => setHover(null)}
                                        onFocus={() => setHover(starValue)}
                                        onBlur={() => setHover(null)}
                                        aria-label={t("feedback.noter_n", { n: starValue })}
                                        aria-pressed={rating === starValue}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            padding: 0,
                                            cursor: "pointer",
                                            lineHeight: 0,
                                        }}
                                    >
                                        <FaStar
                                            size={20}
                                            color={starValue <= (hover || rating) ? "#ffc107" : "#e4e5e9"}
                                            style={{ transition: "color 0.3s ease-in-out" }}
                                        />
                                    </button>
                                </motion.div>
                            );
                        })}
                    </div>

                    <h3 style={{ marginTop: "20px" }}>{t("feedback.note_moyenne", { note: averageRating.toFixed(1) })}</h3>
                </div>
            )}
        </>
    );
};

export default AppRating;
