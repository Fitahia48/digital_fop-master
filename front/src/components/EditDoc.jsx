import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLink,
  faPlus,
  faTrash,
  faFileLines,
  faSpinner,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";
import { statusLabel } from "./Utils";
import HelpTooltip from "./HelpTooltip";
import { DOCUMENT_TYPES, documentTypeLabel } from "../utils/documentTypes";
import axiosInstance from "./AxiosConfig";

const RELATION_TYPES = [
  { value: "vise", label: "Vise (visa juridique : « Vu le/la... »)", badge: "bg-purple-100 text-purple-800 border-purple-300" },
  { value: "modifie", label: "Modifie", badge: "bg-amber-100 text-amber-800 border-amber-300" },
  { value: "abroge", label: "Abroge", badge: "bg-red-100 text-red-800 border-red-300" },
  { value: "complete", label: "Complète", badge: "bg-blue-100 text-blue-800 border-blue-300" },
];

const getRelationBadge = (type) => {
  const match = RELATION_TYPES.find((r) => r.value === type);
  return match || { value: type, label: type, badge: "bg-gray-100 text-gray-800 border-gray-300" };
};

const EditDocument = () => {
  const { id: documentId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    type: "",
    objet: "",
    numero: "",
    date: "",
    conseil: "Autre",
    domaine: "",
    status: "en_vigueur",
    lieu_signature: "",
    signataires: "",
    inclusJournal: false,
    dateJournal: "",
    numeroJournal: "",
    pageJournal: "",
    fichier: null,
    telechargeable: true,
  });

  const [domaines, setDomaines] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Relations inter-textes
  const [relationsActives, setRelationsActives] = useState([]);
  const [relationsPassives, setRelationsPassives] = useState([]);
  const [allDocs, setAllDocs] = useState([]);
  const [newRelCibleId, setNewRelCibleId] = useState("");
  const [newRelType, setNewRelType] = useState("vise");
  const [relLoading, setRelLoading] = useState(false);

  // Charger les domaines
  useEffect(() => {
    axiosInstance
      .get("/api/domaines/")
      .then((response) => setDomaines(response.data.results || []))
      .catch((error) =>
        console.error("Erreur lors de la récupération des domaines :", error)
      );
  }, []);

  // Charger la liste des documents pour la création de relations
  useEffect(() => {
    axiosInstance
      .get("/api/documents/?page=1&page_size=100")
      .then((response) => {
        const list = (response.data.results || []).filter(
          (d) => String(d.id) !== String(documentId)
        );
        setAllDocs(list);
      })
      .catch((err) =>
        console.error("Erreur chargement documents pour relations :", err)
      );
  }, [documentId]);

  // Recharger les données du document actuel
  const reloadDocument = () => {
    if (!documentId) return;
    axiosInstance
      .get(`/api/documents/${documentId}/`)
      .then((response) => {
        const data = response.data;
        setFormData({
          type: data.type || "",
          objet: data.objet || "",
          numero: data.numero || "",
          date: data.date || "",
          conseil: data.conseil || "Autre",
          domaine: data.domaine?.id ?? (typeof data.domaine === "number" ? data.domaine : ""),
          status: data.status || "en_vigueur",
          lieu_signature: data.lieu_signature || "",
          signataires: data.signataires || "",
          inclusJournal: Boolean(data.inclus_journal),
          dateJournal: data.date_journal || "",
          numeroJournal: data.numero_journal || "",
          pageJournal: data.page_journal || "",
          fichier: null,
          telechargeable: data.telechargeable !== false,
        });
        setRelationsActives(data.relations_actives || []);
        setRelationsPassives(data.relations_passives || []);
      })
      .catch((error) =>
        console.error("Erreur lors de la récupération du document :", error)
      );
  };

  useEffect(() => {
    reloadDocument();
  }, [documentId]);

  // Gérer les changements dans les champs du formulaire
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleInclusJournalChange = (e) => {
    const checked = e.target.checked;
    setFormData((prev) => ({
      ...prev,
      inclusJournal: checked,
      ...(checked ? {} : { dateJournal: "", numeroJournal: "", pageJournal: "" }),
    }));
  };

  // Gérer les changements dans le champ de fichier
  const handleFileChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      fichier: e.target.files[0] || null,
    }));
  };

  // Sélecteur Téléchargement
  const handleTelechargeableChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      telechargeable: e.target.value === "true",
    }));
  };

  // Ajouter une relation juridique
  const handleAddRelation = async (e) => {
    e.preventDefault();
    if (!newRelCibleId) {
      toast.warning("Veuillez sélectionner le document cible.");
      return;
    }
    setRelLoading(true);
    try {
      await axiosInstance.post(`/api/documents/${documentId}/relations/`, {
        document_cible_id: Number(newRelCibleId),
        type_relation: newRelType,
      });
      toast.success("Relation juridique ajoutée avec succès !");
      setNewRelCibleId("");
      reloadDocument();
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error?.message || "Erreur lors de l'ajout de la relation.";
      toast.error(msg);
    } finally {
      setRelLoading(false);
    }
  };

  // Supprimer une relation juridique
  const handleDeleteRelation = async (relationId) => {
    if (!window.confirm("Voulez-vous vraiment supprimer cette relation juridique ?")) return;
    try {
      await axiosInstance.delete(`/api/document-relations/${relationId}/`);
      toast.success("Relation supprimée avec succès !");
      reloadDocument();
    } catch (err) {
      toast.error("Erreur lors de la suppression de la relation.");
    }
  };

  // Soumettre le formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();

    const user = JSON.parse(localStorage.getItem("user") || "null");
    const token = user?.access;
    if (!token) {
      toast.error("Vous n'êtes pas connecté. Veuillez vous connecter.");
      return;
    }

    const formDataToSend = new FormData();

    // Type (requis)
    formDataToSend.append("type", formData.type);
    formDataToSend.append("objet", formData.objet);
    formDataToSend.append("numero", formData.numero || "");
    formDataToSend.append("date", formData.date || "");
    formDataToSend.append("conseil", formData.conseil || "Autre");

    // Domaine
    if (formData.domaine !== null && formData.domaine !== undefined && formData.domaine !== "") {
      const valDomaine =
        typeof formData.domaine === "object" && formData.domaine.id
          ? String(formData.domaine.id)
          : String(formData.domaine);
      if (valDomaine) formDataToSend.append("domaine", valDomaine);
    }

    // Statut juridique
    formDataToSend.append("status", formData.status || "en_vigueur");
    formDataToSend.append("lieu_signature", formData.lieu_signature || "");
    formDataToSend.append("signataires", formData.signataires || "");

    // Journal Officiel
    formDataToSend.append("inclus_journal", formData.inclusJournal ? "true" : "false");
    if (formData.inclusJournal) {
      formDataToSend.append("date_journal", formData.dateJournal || "");
      formDataToSend.append("numero_journal", formData.numeroJournal || "");
      formDataToSend.append("page_journal", formData.pageJournal || "");
    }

    // Téléchargeable
    formDataToSend.append("telechargeable", formData.telechargeable ? "true" : "false");

    // Nouveau fichier si sélectionné
    if (formData.fichier instanceof File) {
      formDataToSend.append("fichier", formData.fichier);
    }

    setSubmitting(true);
    try {
      await axiosInstance.patch(`/api/documents/${documentId}/`, formDataToSend, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      toast.success("Document modifié avec succès !");
      navigate("/dashboard");
    } catch (error) {
      console.error("Détails de l'erreur :", error.response?.data || error.message);
      const msg = error.response?.data?.detail || error.response?.data?.error?.message || "Erreur lors de la modification du document.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 mt-40 pb-16">
      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-900 transition"
        >
          <FontAwesomeIcon icon={faArrowLeft} />
          Retour au tableau de bord
        </Link>
        <Link
          to={`/documents/${documentId}`}
          className="inline-flex items-center gap-2 text-sm text-blue-800 hover:underline"
        >
          <FontAwesomeIcon icon={faFileLines} />
          Voir la fiche publique
        </Link>
      </div>

      <div className="bg-white shadow-md rounded-xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 border-b pb-4">
          Modification du Document
        </h1>

        <form className="flex flex-col gap-6" onSubmit={handleSubmit} encType="multipart/form-data">
          {/* Type */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              Type de document <span className="text-red-500">*</span>
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <label className="block text-gray-700 font-semibold mb-2">
              Objet <span className="text-red-500">*</span>
            </label>
            <textarea
              name="objet"
              value={formData.objet}
              onChange={handleChange}
              required
              rows={3}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Entrez l'objet du document"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Référence */}
            <div>
              <label className="block text-gray-700 font-semibold mb-2">
                Numéro (optionnel)
                <HelpTooltip text="Numéro officiel du texte (ex. 2024-055). Laisser vide pour les textes sans numéro (notamment la Constitution)." />
              </label>
              <input
                type="text"
                name="numero"
                value={formData.numero || ""}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="ex. 2024-055 (laisser vide si aucun)"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-gray-700 font-semibold mb-2">
                Date d'adoption / signature (optionnelle)
                <HelpTooltip text="Date officielle de signature. Laisser vide si inconnue." />
              </label>
              <input
                type="date"
                name="date"
                value={formData.date || ""}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lieu de signature */}
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Lieu de signature (optionnel)</label>
              <input
                type="text"
                name="lieu_signature"
                value={formData.lieu_signature || ""}
                onChange={handleChange}
                maxLength={150}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="ex. : Antananarivo"
              />
            </div>

            {/* Conseil */}
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Conseil</label>
              <select
                name="conseil"
                value={formData.conseil || "Autre"}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Autre">Autre</option>
                <option value="minister">Ministre</option>
                <option value="gouvernement">Gouvernement</option>
              </select>
            </div>
          </div>

          {/* Signataires */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">Signataire(s) (optionnel)</label>
            <textarea
              name="signataires"
              value={formData.signataires || ""}
              onChange={handleChange}
              rows={2}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="ex. : Le Président de la République, Le Premier Ministre..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Domaine */}
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Domaine / Thème</label>
              <select
                name="domaine"
                value={formData.domaine || ""}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Aucun</option>
                {domaines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
            </div>

            {/* Statut juridique */}
            <div>
              <label className="block text-gray-700 font-semibold mb-2">
                Statut juridique
                <HelpTooltip text="Statut juridique actuel du texte." />
              </label>
              <select
                name="status"
                value={formData.status || "en_vigueur"}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {formData.status &&
                  formData.status !== "en_vigueur" &&
                  formData.status !== "abroge" && (
                    <option value={formData.status}>{statusLabel(formData.status)}</option>
                  )}
                <option value="en_vigueur">{statusLabel("en_vigueur")}</option>
                <option value="abroge">{statusLabel("abroge")}</option>
              </select>
            </div>
          </div>

          {/* Journal Officiel */}
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/50">
            <label className="flex items-center gap-2.5 text-gray-800 font-semibold cursor-pointer">
              <input
                type="checkbox"
                name="inclusJournal"
                checked={formData.inclusJournal}
                onChange={handleInclusJournalChange}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Publié au Journal Officiel
            </label>

            {formData.inclusJournal && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-3 border-t border-gray-200">
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-1">Date JO</label>
                  <input
                    type="date"
                    name="dateJournal"
                    value={formData.dateJournal}
                    onChange={handleChange}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-1">Numéro JO</label>
                  <input
                    type="text"
                    name="numeroJournal"
                    value={formData.numeroJournal}
                    onChange={handleChange}
                    placeholder="ex. 3201"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-1">Page JO</label>
                  <input
                    type="text"
                    name="pageJournal"
                    value={formData.pageJournal}
                    onChange={handleChange}
                    placeholder="ex. 145"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fichier */}
            <div>
              <label className="block text-gray-700 font-semibold mb-2">
                Remplacer le fichier (optionnel)
              </label>
              <input
                type="file"
                name="fichier"
                accept=".pdf,.docx"
                onChange={handleFileChange}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Téléchargeable */}
            <div>
              <label className="block text-gray-700 font-semibold mb-2">
                {t("telechargeable.label", { defaultValue: "Téléchargement public" })}
                <HelpTooltip text={t("telechargeable.aide", { defaultValue: "Autorise ou restreint le téléchargement public du fichier." })} />
              </label>
              <select
                name="telechargeable"
                value={formData.telechargeable ? "true" : "false"}
                onChange={handleTelechargeableChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="true">{t("telechargeable.option_oui", { defaultValue: "Téléchargeable" })}</option>
                <option value="false">{t("telechargeable.option_non", { defaultValue: "Consultable uniquement (non téléchargeable)" })}</option>
              </select>
            </div>
          </div>

          {/* Bouton Modifier */}
          <div className="flex justify-end pt-4 border-t">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-blue-900 text-white py-2.5 px-6 rounded-lg font-semibold hover:bg-blue-800 transition shadow-sm disabled:opacity-50"
            >
              {submitting && <FontAwesomeIcon icon={faSpinner} spin />}
              Enregistrer les modifications
            </button>
          </div>
        </form>
      </div>

      {/* ─── SECTION RELATIONS JURIDIQUES ─── */}
      <div className="mt-8 bg-white shadow-md rounded-xl p-6 sm:p-8">
        <div className="flex items-center gap-3 border-b pb-4 mb-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-800 border border-purple-200">
            <FontAwesomeIcon icon={faLink} />
          </span>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Relations juridiques inter-textes</h2>
            <p className="text-xs text-gray-500">
              Visas (« Vu le décret... »), modifications, abrogations et compléments entre ce texte et d'autres actes.
            </p>
          </div>
        </div>

        {/* Relations actives : ce document cible un autre */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold uppercase text-gray-600 mb-3">
            Relations sortantes (ce texte vise, modifie ou abroge) :
          </h3>
          {relationsActives.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Aucune relation sortante enregistrée.</p>
          ) : (
            <ul className="space-y-2">
              {relationsActives.map((rel) => {
                const badge = getRelationBadge(rel.type_relation);
                return (
                  <li
                    key={rel.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50/50 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.badge}`}>
                        {badge.label}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {rel.type ? `${rel.type} ` : ""}
                        {rel.numero ? `n° ${rel.numero} ` : ""}
                        {rel.date ? `du ${rel.date} ` : ""}
                        — {rel.objet || "(sans objet)"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRelation(rel.id)}
                      title="Supprimer cette relation"
                      className="text-red-500 hover:text-red-700 p-1.5 transition rounded hover:bg-red-50"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Relations passives : d'autres documents ciblent ce document */}
        {relationsPassives.length > 0 && (
          <div className="mb-6 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold uppercase text-gray-600 mb-3">
              Relations entrantes (textes qui visent, modifient ou abrogent ce document) :
            </h3>
            <ul className="space-y-2">
              {relationsPassives.map((rel) => {
                const badge = getRelationBadge(rel.type_relation);
                return (
                  <li
                    key={rel.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.badge}`}>
                        Est {rel.type_relation === "vise" ? "visé par" : rel.type_relation === "abroge" ? "abrogé par" : rel.type_relation === "modifie" ? "modifié par" : "complété par"}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {rel.type ? `${rel.type} ` : ""}
                        {rel.numero ? `n° ${rel.numero} ` : ""}
                        {rel.date ? `du ${rel.date} ` : ""}
                        — {rel.objet || "(sans objet)"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRelation(rel.id)}
                      title="Supprimer cette relation"
                      className="text-red-500 hover:text-red-700 p-1.5 transition rounded hover:bg-red-50"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Formulaire d'ajout de relation */}
        <form
          onSubmit={handleAddRelation}
          className="mt-6 pt-6 border-t border-gray-200 rounded-lg p-4 bg-purple-50/40 border-purple-100"
        >
          <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <FontAwesomeIcon icon={faPlus} className="text-purple-700" />
            Lier ce texte à un autre document
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Nature de la relation
              </label>
              <select
                value={newRelType}
                onChange={(e) => setNewRelType(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-purple-500"
              >
                {RELATION_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Document cible
              </label>
              <div className="flex gap-2">
                <select
                  value={newRelCibleId}
                  onChange={(e) => setNewRelCibleId(e.target.value)}
                  className="flex-1 p-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-purple-500 truncate"
                >
                  <option value="">-- Sélectionnez un texte juridique --</option>
                  {allDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.type ? `[${d.type.toUpperCase()}] ` : ""}
                      {d.numero ? `n°${d.numero} ` : ""}
                      {d.date ? `(${d.date}) ` : ""}
                      {d.objet ? `— ${d.objet.slice(0, 70)}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={relLoading || !newRelCibleId}
                  className="bg-purple-800 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  {relLoading && <FontAwesomeIcon icon={faSpinner} spin />}
                  Ajouter
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditDocument;