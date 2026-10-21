import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { getCsrfToken, statusLabel } from "./Utils";
import HelpTooltip from "./HelpTooltip";
import { DOCUMENT_TYPES, documentTypeLabel } from "../utils/documentTypes";
import axiosInstance from "./AxiosConfig";

const EditDocument = () => {
  const { id: documentId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    type: "",
    objet: "",
    numero: "",
    date: "",
    conseil: "",
    domaine: "",
    status: "",
    lieu_signature: "",
    signataires: "",
    fichier: null,
    // Nouveau champ : téléchargeable
    telechargeable: true,
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
        .then((response) => {
          setFormData({
            ...response.data,
            // Ensure telechargeable is boolean
            telechargeable: !!response.data.telechargeable,
          });
        })
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

  // Sélecteur « Téléchargement » : valeur du <select> (chaîne) → booléen.
  const handleTelechargeableChange = (e) => {
    setFormData({ ...formData, telechargeable: e.target.value === "true" });
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
    formDataToSend.append("objet", formData.objet);
    formDataToSend.append("numero", formData.numero);
    formDataToSend.append("date", formData.date);
    formDataToSend.append("conseil", formData.conseil);
    // Ne jamais déverrouiller le payload obligatoire du formulaire (ex. objet
    // lettres). Si le formulaire pré-remplit le domaine par un objet {id, nom…}
    // (issue de l'API), on envoie son id ; tout autre forme (chaines, objets) est
    // ignorée pour ne pas corrompre la requête PATCH (receive une string non
    // convertissable côté serveur).
    if (formData.domaine != null) {
      const valeur = (formData.domaine && typeof formData.domaine === 'object' && formData.domaine.id)
        ? String(formData.domaine.id)
        : (typeof formData.domaine === 'string' ? formData.domaine : String(formData.domaine ?? ''));
      if (valeur && valeur !== '') {
        formDataToSend.append("domaine", valeur);
      }
    }
    // Statut juridique : modifiable directement depuis ce formulaire
    // (sans justification obligatoire).
    formDataToSend.append("status", formData.status || "en_vigueur");
    // Lieu de signature (optionnel)
    formDataToSend.append("lieu_signature", formData.lieu_signature || "");
    // Signataire(s) (optionnel)
    formDataToSend.append("signataires", formData.signataires || "");

    // Nouveau champ : telechargeable
    formDataToSend.append(
      "telechargeable",
      formData.telechargeable ? "true" : "false"
    );

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
        `Erreur : ${error.response?.data?.pdf_file?.[0] || "Un problème est survenu."}`
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

        {/* Référence */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">Numéro (optionnel)</label>
          <input
            type="text"
            name="numero"
            value={formData.numero || ""}
            onChange={handleChange}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="Entrez la référence (ex: 2024-055, laisser vide si aucun)"
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">Date (optionnelle)</label>
          <input
            type="date"
            name="date"
            value={formData.date || ""}
            onChange={handleChange}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Lieu de signature */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">Lieu de signature (optionnel)</label>
          <input
            type="text"
            name="lieu_signature"
            value={formData.lieu_signature || ""}
            onChange={handleChange}
            maxLength={150}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="ex. : Antananarivo"
          />
        </div>

        {/* Signataires */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">Signataire(s) (optionnel)</label>
          <textarea
            name="signataires"
            value={formData.signataires || ""}
            onChange={handleChange}
            rows={2}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="ex. : Le Président de la République, Le Premier Ministre..."
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
            <option value="minister">Ministre</option>
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
        </div>

        {/* Statut juridique — modifiable directement, sans justification */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">
            Statut juridique
            <HelpTooltip text="Statut juridique actuel du texte." />
          </label>
          <select
            name="status"
            value={formData.status || "en_vigueur"}
            onChange={handleChange}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            {/* Valeur héritée d'avant la simplification (non_verifie / modifie) :
                affichée telle quelle pour ne pas changer le statut à l'ouverture
                du formulaire, sans l'imposer comme un nouveau choix. */}
            {formData.status &&
              formData.status !== "en_vigueur" &&
              formData.status !== "abroge" && (
                <option value={formData.status}>{statusLabel(formData.status)}</option>
              )}
            <option value="en_vigueur">{statusLabel("en_vigueur")}</option>
            <option value="abroge">{statusLabel("abroge")}</option>
          </select>
        </div>

        {/* Fichier */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">Fichier</label>
          {/* Pas de « required » : on peut modifier un autre champ (ex. le
              téléchargement) sans re-téléverser le fichier. Le serveur conserve
              le fichier existant si aucun nouveau n'est envoyé. */}
          <input
            type="file"
            name="fichier"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Téléchargeable / Non téléchargeable */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">
            {t('telechargeable.label')}
            <HelpTooltip text={t('telechargeable.aide')} />
          </label>
          {/* Pré-rempli avec la valeur actuelle du document (booléenne) */}
          <select
            name="telechargeable"
            value={formData.telechargeable ? "true" : "false"}
            onChange={handleTelechargeableChange}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="true">{t('telechargeable.option_oui')}</option>
            <option value="false">{t('telechargeable.option_non')}</option>
          </select>
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