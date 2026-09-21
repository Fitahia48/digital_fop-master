import React, { useEffect, useState } from "react";
import axiosInstance from "./AxiosConfig";
import { Oval } from "react-loader-spinner";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserTie, faSitemap } from '@fortawesome/free-solid-svg-icons';

const OrganigrammePage = () => {
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axiosInstance.get("/api/organigramme/")
      .then((res) => setGrouped(res.data.grouped || {}))
      .catch((err) => console.error("Erreur organigramme :", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <Oval visible={true} height="80" width="80" color="#4f94a9" ariaLabel="oval-loading" />
      </div>
    );
  }

  const services = Object.keys(grouped);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center justify-center gap-3">
          <FontAwesomeIcon icon={faSitemap} className="text-blue-700" />
          Organigramme du MTEFOP
        </h1>
        <p className="text-gray-500 mt-2">
          Structure organisationnelle du Ministère du Travail, de l'Emploi, de la Fonction Publique et des Lois Sociales
        </p>
      </div>

      {services.length === 0 ? (
        <p className="text-center text-gray-500 bg-white rounded-lg shadow p-8">
          L'organigramme n'est pas encore disponible. Il sera publié prochainement.
        </p>
      ) : (
        <div className="space-y-8">
          {services.map((service) => (
            <section key={service} className="bg-white shadow-md rounded-xl overflow-hidden">
              <h2 className="bg-blue-900 text-yellow-300 text-lg font-semibold px-6 py-3">
                {service}
              </h2>
              <ul className="divide-y divide-gray-100">
                {grouped[service].map((m) => (
                  <li key={m.id} className="flex items-center gap-4 px-6 py-4 hover:bg-blue-50 transition">
                    <div className="w-11 h-11 shrink-0 rounded-full bg-blue-100 flex items-center justify-center">
                      <FontAwesomeIcon icon={faUserTie} className="text-blue-700 text-lg" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{m.nom}</p>
                      <p className="text-sm text-gray-600">{m.poste}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrganigrammePage;
