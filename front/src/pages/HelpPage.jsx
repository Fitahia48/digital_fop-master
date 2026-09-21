import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp, faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import { requestOnboardingRestart } from "../components/OnboardingTour";

// Questions/réponses servies par i18n (aide.faqN_question / aide.faqN_reponse)
const FAQ_INDEXES = [1, 2, 3, 4, 5, 6];

const HelpPage = () => {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState(null);
  const navigate = useNavigate();

  const toggle = (index) => setOpenIndex((current) => (current === index ? null : index));

  return (
    <div className="min-h-screen bg-gray-50 mt-40 pb-16">
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center pt-10 pb-8">
          <FontAwesomeIcon icon={faCircleQuestion} className="text-4xl text-blue-800 mb-3" />
          <h1 className="text-3xl font-bold text-gray-800">{t("aide.titre")}</h1>
          <p className="text-gray-600 mt-2">
            {t("aide.intro")}
          </p>
        </div>

        <div className="space-y-3">
          {FAQ_INDEXES.map((n, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={n}
                className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${n}`}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left font-medium text-gray-800 hover:bg-blue-50 transition"
                >
                  <span>{t(`aide.faq${n}_question`)}</span>
                  <FontAwesomeIcon
                    icon={isOpen ? faChevronUp : faChevronDown}
                    className="text-blue-700 shrink-0"
                  />
                </button>
                {isOpen && (
                  <div
                    id={`faq-panel-${n}`}
                    className="px-4 pb-4 text-sm text-gray-600 leading-relaxed"
                  >
                    {t(`aide.faq${n}_reponse`)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 bg-blue-50 border border-blue-200 rounded-lg p-5 text-center">
          <p className="text-gray-700 mb-3">
            {t("aide.premiere_visite")}
          </p>
          <button
            type="button"
            onClick={() => requestOnboardingRestart(navigate)}
            className="bg-blue-900 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition duration-200"
          >
            {t("aide.revoir_guide")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpPage;
