import React, { useState, useEffect } from "react";

import { toast } from "react-toastify";
import axiosInstance from "./AxiosConfig";
import { statusLabel } from "./Utils";
import { DOCUMENT_TYPES, documentTypeLabel } from "../utils/documentTypes";
import HelpTooltip from "./HelpTooltip";
import { ThreeDots } from "react-loader-spinner"
import { useNavigate } from "react-router-dom";

const AjouterDocument = () => {
  const [formData, setFormData] = useState({
    type: "",
    objet: "",
    numero: "",
    date: "",
    conseil: "",
    domaine: "",
    // P1 : le statut juridique n'est PAS choisi ici — le serveur pose
    // « non_verifie » à la création ; la confirmation passe par le circuit
    // dédié (justification obligatoire + audit), jamais par ce formulaire.
    resume_simplifie: "",
    fichier: null,
    inclusJournal: false,
    dateJournal: "",
    numeroJournal: "",
    pageJournal: "",
    // Métadonnées P1 (optionnelles, validées par l'agent — jamais déduites)
    mots_cles: "",
    langue: "fr",
    organisme_emetteur: "",
    lieu_signature: "",
    signataires: "",
  });


  const [domaines, setDomaines] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate()
  useEffect(() => {
    // Récupérer les domaines depuis l'API
    axiosInstance.get("/api/domaines/")
      .then(response => setDomaines(response.data.results))
      .catch(error => console.error("Erreur lors de la récupération des domaines :", error));
  }, []);
  const handleInclusJournalChange = (e) => {
    const inclus = e.target.checked;
    setFormData((prevData) => ({
      ...prevData,
      inclusJournal: inclus,
      ...(inclus ? {} : { dateJournal: "", numeroJournal: "", pageJournal: "" }), // Réinitialiser les champs si décoché
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFileChange = (e) => {
    setFormData({ ...formData, fichier: e.target.files[0] });
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
  
    Object.keys(formData)
      // P1 : « status » n'est volontairement PAS envoyé — le serveur impose
      // « non_verifie » à la création (présomption nulle, circuit dédié).
      .filter((key) => key !== "status")
      .forEach((key) => {
        if (formData[key] !== null && formData[key] !== "") {
          data.append(key, formData[key]);
        }
    });
  
    setLoading(true);
    try {
      const response = await axiosInstance.post("/api/documents/", data, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      toast.success("Document ajouté avec succès !");
      navigate("/dashboard");
    } catch (error) {
      console.error("Erreur lors de l'ajout :", error.response || error);  // Log pour vérifier l'erreur
      if (error.response && error.response.data) {
        const errData = error.response.data;
        const msg =
          errData?.error?.message ||
          errData?.error?.details?.message ||
          errData?.error ||
          errData?.detail ||
          "Erreur lors de l'ajout du document.";
        toast.error(typeof msg === "string" ? msg : "Erreur lors de l'ajout du document.");
      } else {
        toast.error("Erreur lors de l'ajout du document.");
      }

    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="flex items-center justify-center min-h-screen bg-transparent mt-40">
      <div className="flex flex-wrap bg-white rounded-lg shadow-lg overflow-hidden md:w-1/2 w-full lg:w-3/4 animate__animated animate__pulse">
        <div className="hidden md:block w-1/2 bg-cover bg-center"
          style={{
        backgroundImage: "url('/ajout.jpg')", width: "50%",

            height: "auto", backgroundSize: "cover",
            backgroundPosition: "center",
          }}>

        </div>
        <div className="w-full md:w-1/2 p-6">
          <h2 className="text-lg font-bold mb-4 text-center">Ajouter un Document</h2>

          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit}
            encType="multipart/form-data"
          >
            {/* Type */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Type de document
                <HelpTooltip text="Choisissez la nature du texte : Constitution, loi, ordonnance, décret, arrêté, circulaire… En cas de doute, reportez-vous à l'intitulé exact figurant au Journal Officiel." />
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
              <label className="block text-gray-700 font-medium mb-2">
                Objet
              </label>
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
                value={formData.resume_simplifie}
                onChange={handleChange}
                rows={4}
                maxLength={1000}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Expliquez ce texte en 2-3 phrases simples, sans jargon administratif"
              />
              <p className="text-xs text-gray-500 text-right mt-1">
                {formData.resume_simplifie.length}/1000 caractères
              </p>
            </div>

            {/* Référence */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Numéro (optionnel)
                <HelpTooltip text="Numéro officiel du texte (ex. 2024-055). Laisser vide pour les textes sans numéro comme la Constitution." />
              </label>
              <input
                type="text"
                name="numero"
                value={formData.numero}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Entrez la référence (ex: 2024-055, laisser vide si aucun)"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Date (sortie du document, optionnelle)
                <HelpTooltip text="Date officielle de signature ou d'adoption. Laisser vide si non précisée dans le texte." />
              </label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Conseil */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Conseil
              </label>
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
              <label className="block text-gray-700 font-medium mb-2">
                Domaine
              </label>
              <select
                name="domaine"
                value={formData.domaine}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Aucun</option>

                {domaines.map((domaine) => (
                  <option key={domaine.id} value={domaine.id}>
                    {domaine.nom}
                  </option>
                ))}
              </select>
            </div>

            {/* Statut juridique — lecture seule : le circuit de confirmation
                (justification + audit) est le seul à pouvoir le modifier. */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Statut juridique
                <HelpTooltip text="À la création, le statut est toujours « Non vérifié » (présomption nulle). Seul le circuit de confirmation — dans « Vie juridique » — peut le changer, avec une justification obligatoire et une journalisation permanente." />
              </label>
              <input
                type="text"
                value={statusLabel("non_verifie")}
                readOnly
                disabled
                className="w-full p-2 border border-gray-200 bg-gray-100 text-gray-600 rounded-md cursor-not-allowed"
              />
            </div>

            {/* Mots-clés (P1) */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Mots-clés (optionnel)
                <HelpTooltip text="Séparés par des virgules : notions couvertes par le texte (ex. fonction publique, recrutement, sanction). Sert aux recherches futures ; ne renseigner que ce qui figure réellement dans le texte." />
              </label>
              <input
                type="text"
                name="mots_cles"
                value={formData.mots_cles}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="ex. : fonction publique, concurrence, commission"
              />
            </div>

            {/* Langue du document (P1) */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Langue du document
                <HelpTooltip text="Langue du fichier original (pas la langue de l'interface)." />
              </label>
              <select
                name="langue"
                value={formData.langue}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="fr">Français</option>
                <option value="mg">Malgache</option>
                <option value="en">Anglais</option>
              </select>
            </div>

            {/* Organisme émetteur (P1) */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Organisme émetteur (optionnel)
                <HelpTooltip text="Institution ou service qui a pris le texte (Gouvernement, Ministère, direction…). Ne renseigner que si l'émetteur est certain d'après l'intitulé officiel." />
              </label>
              <input
                type="text"
                name="organisme_emetteur"
                value={formData.organisme_emetteur}
                onChange={handleChange}
                maxLength={200}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="ex. : Gouvernement, Ministère du Travail…"
              />
            </div>

            {/* Lieu de signature (optionnel) */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Lieu de signature (optionnel)
                <HelpTooltip text="Lieu officiel de signature ou promulgation du texte." />
              </label>
              <input
                type="text"
                name="lieu_signature"
                value={formData.lieu_signature}
                onChange={handleChange}
                maxLength={150}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="ex. : Antananarivo"
              />
            </div>

            {/* Signataire(s) (optionnel) */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Signataire(s) (optionnel)
                <HelpTooltip text="Noms ou titres des signataires officiels (ex. : Le Président de la République, Le Premier Ministre...)." />
              </label>
              <textarea
                name="signataires"
                value={formData.signataires}
                onChange={handleChange}
                rows={2}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="ex. : Le Président de la République, Le Premier Ministre, Le Ministre du Travail..."
              />
            </div>

            {/* Fichier */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Fichier
              </label>
              <input
                type="file"
                name="fichier"
                onChange={handleFileChange}
                required
                accept=".pdf,.PDF"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Formats acceptés : PDF uniquement</p>

            </div>
            {/* Inclus dans le Journal Officiel */}
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Inclus dans le Journal Officiel ?
                <HelpTooltip text="Cochez si le texte a été publié au Journal Officiel : vous pourrez alors renseigner sa date, son numéro et sa page de parution, indispensables pour la référence officielle." />
              </label>
              <input
                type="checkbox"
                name="inclusJournal"
                checked={formData.inclusJournal}
                onChange={handleInclusJournalChange}
                className="mr-2"
              />
            </div>

            {formData.inclusJournal && (
              <>
                {/* Date du Journal Officiel */}
                <div>
                  <label className="block text-gray-700 font-medium mb-2">
                    Date du Journal Officiel
                  </label>
                  <input
                    type="date"
                    name="dateJournal"
                    value={formData.dateJournal}
                    onChange={handleChange}
                    required
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Numéro du Journal Officiel */}
                <div>
                  <label className="block text-gray-700 font-medium mb-2">
                    Numéro du Journal Officiel
                  </label>
                  <input
                    type="text"
                    name="numeroJournal"
                    value={formData.numeroJournal}
                    onChange={handleChange}
                    required
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="Entrez le numéro du Journal Officiel"
                  />
                </div>

                {/* Page du Journal Officiel */}
                <div>
                  <label className="block text-gray-700 font-medium mb-2">
                    Page du Journal Officiel
                  </label>
                  <input
                    type="text"
                    name="pageJournal"
                    value={formData.pageJournal}
                    onChange={handleChange}
                    required
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="Entrez la page du Journal Officiel"
                  />
                </div>
              </>
            )}


            {/* Bouton Ajouter */}
            <button
              type="submit"
              className="bg-blue-900 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition duration-200"
            >
              {loading ? (<ThreeDots
                visible={true}
                height="40"
                width="40"
                color="#ffffff"
                radius="9"
                ariaLabel="three-dots-loading"
                wrapperStyle={{}}
                wrapperClass=""
              />) : "Ajouter"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AjouterDocument;
