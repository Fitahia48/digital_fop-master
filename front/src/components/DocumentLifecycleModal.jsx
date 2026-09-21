import React, { useState, useEffect } from "react";
import axiosInstance from "./AxiosConfig";
import { toast } from "react-toastify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faLink,
  faTrash,
  faPlus,
  faCheckCircle,
  faBan,
  faPen,
  faCalendarAlt,
  faFileContract,
} from "@fortawesome/free-solid-svg-icons";

const DocumentLifecycleModal = ({ documentId, onClose, isAdmin, onStatusUpdated }) => {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  // Formulaire d'ajout de relation
  const [relationType, setRelationType] = useState("modifie");
  const [cibleSearch, setCibleSearch] = useState("");
  const [cibleResults, setCibleResults] = useState([]);
  const [selectedCible, setSelectedCible] = useState(null);
  const [submittingRelation, setSubmittingRelation] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  // Charger le document avec ses relations
  const fetchDocDetails = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(`/api/documents/${documentId}/`);
      setDoc(res.data);
    } catch (err) {
      console.error("Erreur chargement document :", err);
      toast.error("Impossible de charger les détails du document.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (documentId) {
      fetchDocDetails();
    }
  }, [documentId]);

  // Recherche de documents cibles pour lier
  useEffect(() => {
    if (!cibleSearch.trim() || cibleSearch.length < 2) {
      setCibleResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await axiosInstance.get(`/api/documents/?search=${encodeURIComponent(cibleSearch)}&page_size=5`);
        const list = res.data.results || [];
        // Ne pas inclure le document actuel lui-même
        setCibleResults(list.filter((d) => d.id !== parseInt(documentId)));
      } catch (e) {
        console.error("Erreur recherche cibles :", e);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [cibleSearch, documentId]);

  // Changer le statut
  const handleStatusChange = async (newStatus) => {
    try {
      setChangingStatus(true);
      const res = await axiosInstance.patch(`/api/documents/${documentId}/status/`, {
        status: newStatus,
      });
      setDoc((prev) => ({ ...prev, status: res.data.status }));
      toast.success(`Statut mis à jour : ${newStatus}`);
      if (onStatusUpdated) {
        onStatusUpdated(documentId, res.data.status);
      }
    } catch (err) {
      console.error("Erreur mise à jour statut :", err);
      toast.error(err.response?.data?.error || "Erreur lors du changement de statut.");
    } finally {
      setChangingStatus(false);
    }
  };

  // Créer une relation
  const handleAddRelation = async (e) => {
    e.preventDefault();
    if (!selectedCible) {
      toast.warning("Veuillez sélectionner un document cible.");
      return;
    }

    try {
      setSubmittingRelation(true);
      await axiosInstance.post(`/api/documents/${documentId}/relations/`, {
        document_cible_id: selectedCible.id,
        type_relation: relationType,
      });
      toast.success("Relation juridique enregistrée avec succès !");
      setSelectedCible(null);
      setCibleSearch("");
      setCibleResults([]);
      // Recharger les relations
      await fetchDocDetails();
    } catch (err) {
      console.error("Erreur ajout relation :", err);
      toast.error(err.response?.data?.detail || "Erreur lors de la création de la relation.");
    } finally {
      setSubmittingRelation(false);
    }
  };

  // Supprimer une relation
  const handleDeleteRelation = async (relationId) => {
    if (!window.confirm("Confirmez-vous la suppression de cette relation juridique ?")) {
      return;
    }

    try {
      await axiosInstance.delete(`/api/document-relations/${relationId}/`);
      toast.success("Relation supprimée.");
      await fetchDocDetails();
    } catch (err) {
      console.error("Erreur suppression relation :", err);
      toast.error("Erreur lors de la suppression de la relation.");
    }
  };

  const getStatusBadge = (status) => {
    const s = (status || "").toLowerCase().trim();
    if (s === "abrogé" || s === "abroge") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
          <FontAwesomeIcon icon={faBan} className="text-red-600" /> Abrogé
        </span>
      );
    }
    if (s === "modifié" || s === "modifie") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <FontAwesomeIcon icon={faPen} className="text-amber-600" /> Modifié
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-600" /> En vigueur
      </span>
    );
  };

  const getRelationBadge = (type, isSource = true) => {
    if (type === "abroge") {
      return (
        <span className="px-2 py-0.5 text-xs font-bold rounded bg-red-50 text-red-700 border border-red-200">
          {isSource ? "Abroge" : "Est abrogé par"}
        </span>
      );
    }
    if (type === "modifie") {
      return (
        <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-50 text-amber-700 border border-amber-200">
          {isSource ? "Modifie" : "Est modifié par"}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-50 text-blue-700 border border-blue-200">
        {isSource ? "Complète" : "Est complété par"}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-blue-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-800 rounded-lg text-yellow-300">
              <FontAwesomeIcon icon={faFileContract} size="lg" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Vie juridique du texte</h2>
              <p className="text-xs text-blue-200">Statut et relations d'application / modification</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white p-1 rounded-lg hover:bg-blue-800 transition"
          >
            <FontAwesomeIcon icon={faTimes} size="lg" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="flex justify-center items-center py-12 text-gray-500">
              Chargement des informations juridiques...
            </div>
          ) : !doc ? (
            <div className="text-center py-8 text-gray-500">Document introuvable.</div>
          ) : (
            <>
              {/* Carte résumé du document */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-800 bg-blue-100 px-2.5 py-1 rounded">
                    {doc.type || "Texte"}
                  </span>
                  <div>{getStatusBadge(doc.status)}</div>
                </div>

                <h3 className="text-base font-bold text-gray-900 leading-snug">
                  {doc.numero ? `N° ${doc.numero} : ` : ""}
                  {doc.objet}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 pt-2 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faCalendarAlt} className="text-gray-400" />
                    <span><strong>Date signature/promulgation :</strong> {doc.date || "Non renseignée"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faCalendarAlt} className="text-emerald-600" />
                    <span>
                      <strong>Entrée en vigueur :</strong>{" "}
                      {doc.date_entree_vigueur || "Non renseignée (date par défaut)"}
                    </span>
                  </div>
                  {doc.inclus_journal && (
                    <div className="sm:col-span-2 text-gray-500">
                      <strong>J.O. :</strong> N° {doc.numero_journal || "-"} du {doc.date_journal || "-"} (page {doc.page_journal || "-"})
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Administrateur : Changement de statut */}
              {isAdmin && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                      Administration — Changer le statut
                    </span>
                    {changingStatus && <span className="text-xs text-amber-700">Mise à jour...</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[
                      { key: "en_vigueur", label: "En vigueur", color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
                      { key: "modifié", label: "Modifié", color: "bg-amber-600 hover:bg-amber-700 text-white" },
                      { key: "abrogé", label: "Abrogé", color: "bg-red-600 hover:bg-red-700 text-white" },
                    ].map((st) => (
                      <button
                        key={st.key}
                        onClick={() => handleStatusChange(st.key)}
                        disabled={changingStatus || doc.status === st.key}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md shadow-sm transition ${
                          doc.status === st.key
                            ? "ring-2 ring-offset-1 ring-blue-900 opacity-60 cursor-not-allowed"
                            : st.color
                        }`}
                      >
                        Passer à « {st.label} »
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Relations juridiques */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center gap-2">
                  <FontAwesomeIcon icon={faLink} className="text-blue-700" />
                  Relations juridiques liées
                </h4>

                {/* Textes que ce document affecte (relations_actives) */}
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-gray-600">
                    Textes visés par ce document :
                  </h5>
                  {doc.relations_actives && doc.relations_actives.length > 0 ? (
                    <div className="space-y-2">
                      {doc.relations_actives.map((rel) => (
                        <div
                          key={rel.id}
                          className="flex items-center justify-between gap-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-gray-300 transition"
                        >
                          <div className="flex items-center gap-3">
                            {getRelationBadge(rel.type_relation, true)}
                            <div>
                              <p className="text-xs font-bold text-gray-900">
                                {rel.type ? `${rel.type.toUpperCase()} ` : ""}
                                {rel.numero ? `N° ${rel.numero} : ` : ""}
                                {rel.objet}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                <span>Date : {rel.date}</span>
                                <span>•</span>
                                <span>Statut : {rel.status}</span>
                              </div>
                            </div>
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteRelation(rel.id)}
                              className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition"
                              title="Supprimer la relation"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-gray-500 pl-2">
                      Ce document ne modifie, n'abroge ni ne complète d'autre texte.
                    </p>
                  )}
                </div>

                {/* Textes qui affectent ce document (relations_passives) */}
                <div className="space-y-2 pt-2">
                  <h5 className="text-xs font-semibold text-gray-600">
                    Modifications ou abrogations subies par ce document :
                  </h5>
                  {doc.relations_passives && doc.relations_passives.length > 0 ? (
                    <div className="space-y-2">
                      {doc.relations_passives.map((rel) => (
                        <div
                          key={rel.id}
                          className="flex items-center justify-between gap-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-gray-300 transition"
                        >
                          <div className="flex items-center gap-3">
                            {getRelationBadge(rel.type_relation, false)}
                            <div>
                              <p className="text-xs font-bold text-gray-900">
                                {rel.type ? `${rel.type.toUpperCase()} ` : ""}
                                {rel.numero ? `N° ${rel.numero} : ` : ""}
                                {rel.objet}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                <span>Date : {rel.date}</span>
                                <span>•</span>
                                <span>Statut : {rel.status}</span>
                              </div>
                            </div>
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteRelation(rel.id)}
                              className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition"
                              title="Supprimer la relation"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-gray-500 pl-2">
                      Aucun texte postérieur n'a encore modifié ou abrogé ce document.
                    </p>
                  )}
                </div>
              </div>

              {/* Formulaire Admin : Lier un texte */}
              {isAdmin && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 mb-3 flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faPlus} />
                    Ajouter une relation juridique
                  </h4>
                  <form onSubmit={handleAddRelation} className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Ce texte :
                        </label>
                        <select
                          value={relationType}
                          onChange={(e) => setRelationType(e.target.value)}
                          className="w-full text-xs p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="modifie">Modifie</option>
                          <option value="abroge">Abroge</option>
                          <option value="complete">Complète</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Le document cible :
                        </label>
                        {selectedCible ? (
                          <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                            <span className="font-semibold text-blue-900 truncate">
                              N° {selectedCible.numero || "-"} — {selectedCible.objet}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedCible(null)}
                              className="text-gray-500 hover:text-red-600 ml-2 font-bold"
                            >
                              &times;
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Rechercher par objet ou numéro..."
                              value={cibleSearch}
                              onChange={(e) => setCibleSearch(e.target.value)}
                              className="w-full text-xs p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            {cibleResults.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto z-10 text-xs">
                                {cibleResults.map((item) => (
                                  <div
                                    key={item.id}
                                    onClick={() => {
                                      setSelectedCible(item);
                                      setCibleSearch("");
                                      setCibleResults([]);
                                    }}
                                    className="p-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 flex justify-between gap-2"
                                  >
                                    <span className="font-medium text-gray-800 truncate">
                                      {item.numero ? `[N° ${item.numero}] ` : ""}
                                      {item.objet}
                                    </span>
                                    <span className="text-[10px] text-gray-400 shrink-0">{item.date}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={submittingRelation || !selectedCible}
                        className="px-4 py-2 bg-blue-900 text-white text-xs font-semibold rounded hover:bg-blue-800 disabled:opacity-50 transition"
                      >
                        {submittingRelation ? "Enregistrement..." : "Établir la relation"}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default DocumentLifecycleModal;
