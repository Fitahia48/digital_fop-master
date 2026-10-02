import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { getCsrfToken, statusLabel } from "./Utils";
import HelpTooltip from "./HelpTooltip";
import { DOCUMENT_TYPES, documentTypeLabel } from "../utils/documentTypes";
import axiosInstance from "./AxiosConfig";

const EditDocument = () => {
  const { id: documentId } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    type: "",
    objet: "",
    numero: "",
    date: "",
    conseil: "",
    domaine: "",
    status: "",
    resume_simplifie: "",
    fichier: null,
  });

  const [domaines, setDomaines] = useState([]);

  // Récupérer les domaines depuis l'API
  useEffect(() => {
    axiosInstance
      .get("/api/domaines/")
      .then((response) => setDomaines(response.data.results))
      .catch((error) =>
        console.error("Erreur lors de la récupération des domaines :", error)
      );
  }, []);

  // Récupérer les données actuelles du document
  useEffect(() => {
    if (documentId) {
      axiosInstance
        .get(`/api/documents/${documentId}/`)
        .then((response) => setFormData(response.data))
        .catch((error) =>
          console.error("Erreur lors de la récupération du document :", error)
        );
    }
  }, [documentId]);

  // Gérer les changements dans les champs du formulaire
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  // Gérer les changements dans le champ de fichier
  const handleFileChange = (e) => {
    setFormData({
      ...formData,
      fichier: e.target.files[0], // Ajoute le fichier sélectionné
    });
  };

  // Soumettre le formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();

    const user = JSON.parse(localStorage.getItem("user"));
    const token = user?.access;
    if (!token) {
      toast.error("Vous n'êtes pas connecté. Veuillez vous connecter.");
      return;
    }

    const formDataToSend = new FormData();

    // Ajoutez les champs
    formDataToSend.append("type", formData.type);
    formDataToSend.append("objet", formData.objet);
    formDataToSend.append("numero", formData.numero);
    formDataToSend.append("date", formData.date);
    formDataToSend.append("conseil", formData.conseil);
    formDataToSend.append("domaine", formData.domaine);
    // P1 : « status » n'est volontairement PAS envoyé — la modification du
    // statut juridique passe exclusivement par le circuit dédié
    // (PATCH /documents/:id/status, justification obligatoire + audit),
    // jamais par ce PATCH générique.
    // Chaîne vide = suppression du résumé côté backend
    formDataToSend.append("resume_simplifie", formData.resume_simplifie ?? "");

    // Ajoutez le nouveau fichier si sélectionné
    if (formData.fichier instanceof File) {
      formDataToSend.append("fichier", formData.fichier);
    }

    try {
      const response = await axiosInstance.patch(
        `/api/documents/${documentId}/`,
        formDataToSend,
        {
          headers: {
            "Content-Type": "multipart/form-data", // Obligatoire pour l'upload de fichiers
          },
        }
      );
      toast.success("Document modifié avec succès !");
      navigate("/dashboard");
    } catch (error) {
      console.error("Détails de l'erreur :", error.response?.data || error.message);
      toast.error(
        `Erreur : ${error.response?.data?.pdf_file?.[0] || "Un problème est survenu."
        }`
      );
    }
  };




  return (
    <div className="w-full max-w-2xl mx-auto bg-white shadow-md rounded-lg p-6 mt-40">
      <h2 className="text-lg font-bold mb-4 text-center">Modification du Document</h2>
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit}
        encType="multipart/form-data"
      >
        {/* Type */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">
            Type de document
          </label>
          <select
            name="type"
            value={formData.type}
            onChange={handleChange}
            required
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Choisissez un type</option>
            {DOCUMENT_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {documentTypeLabel(d.value)}
              </option>
            ))}
          </select>
        </div>

        {/* Objet */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">Objet</label>
          <input
            type="text"
            name="objet"
            value={formData.objet}
            onChange={handleChange}
            required
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="Entrez l'objet du document"
          />
        </div>

        {/* Résumé en langage clair */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">
            Résumé en langage clair (optionnel)
          </label>
          <textarea
            name="resume_simplifie"
            value={formData.resume_simplifie || ""}
            onChange={handleChange}
            rows={4}
            maxLength={1000}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="Expliquez ce texte en 2-3 phrases simples, sans jargon administratif"
          />
          <p className="text-xs text-gray-500 text-right mt-1">
            {(formData.resume_simplifie || "").length}/1000 caractères
          </p>
        </div>

        {/* Référence */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">Numéro</label>
          <input
            type="text"
            name="numero"
            value={formData.numero}
            onChange={handleChange}
            required
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="Entrez la référence"
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">Date</label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            required
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Conseil */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">Conseil</label>
          <select
            name="conseil"
            value={formData.conseil}
            onChange={handleChange}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="Autre">Autre</option>
            <option value="ministre">Ministre</option>
            <option value="gouvernement">Gouvernement</option>
          </select>
        </div>

        {/* Domaine */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">Domaine</label>
          <select
            name="domaine"
            value={formData.domaine}
            onChange={handleChange}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Choisissez un domaine</option>
            {domaines.map((domaine) => (
              <option key={domaine.id} value={domaine.id}>
                {domaine.nom}
              </option>
            ))}
          </select>
        </div>        {/* Statut juridique — lecture seule : seuls le circuit de confirmation
            (Vie juridique, justification + audit) peut le modifier. */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">
            Statut juridique
            <HelpTooltip text="Modifiable uniquement via « Vie juridique » : la confirmation exige une justification obligatoire et est journalisée de façon permanente (auteur, date, anciennes et nouvelles valeurs)." />
          </label>
          <input
            type="text"
            value={statusLabel(formData.status)}
            readOnly
            disabled
            className="w-full p-2 border border-gray-200 bg-gray-100 text-gray-600 rounded-md cursor-not-allowed"
          />
        </div>

        {/* Fichier */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">Fichier</label>
          <input
            type="file"
            name="fichier"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            required
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Bouton Modifier */}
        <button
          type="submit"
          className="bg-blue-900 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition duration-200"
        >
          Modifier
        </button>
      </form>
    </div>
  );
};

export default EditDocument;
