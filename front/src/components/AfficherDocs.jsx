import React, { useEffect, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import SearchBar from "./SearchBar";
import WebSearchResult from "./WebSearchResult";
import { OfficialBadge } from "./WebSearchResult";
import { useNavigate, useLocation } from "react-router-dom";
import axiosInstance from "./AxiosConfig";
import { toast } from "react-toastify";
import { userContext } from "./Context";
import { resolveFileUrl } from "./Utils";
import { Link } from "react-router-dom";
import { Oval } from "react-loader-spinner";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faPenToSquare, faTrash, faCashRegister, faForward, faBackward, faSquarePlus, faCircleInfo, faFileContract, faEye, faLightbulb, faXmark, faUsers, faNewspaper, faFileLines, faVolumeHigh } from '@fortawesome/free-solid-svg-icons';
import { faReadme } from '@fortawesome/free-brands-svg-icons';
import { faStar as faStarSolid } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import Modal from "./Modal";
import DocumentLifecycleModal from "./DocumentLifecycleModal";
import SearchResultsSkeleton from "./SearchResultsSkeleton";
import './AfficherDocs.css';

const Documents = ({ isAdmin }) => {
  const [data, setData] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [nextPage, setNextPage] = useState(true);
  const [previousPage, setPreviousPage] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showLifecycleModal, setShowLifecycleModal] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [selectedModification, setSelectedModification] = useState(null);
  const [journaux, setJournaux] = useState([]);
  const [loading, setLoading] = useState(false);
  // Modale de détail (résumé en langage clair / texte officiel)
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailDoc, setDetailDoc] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("resume");
  // Résultats groupés (corps professionnels / actualités) et état de recherche
  const [corpsResults, setCorpsResults] = useState([]);
  const [actualitesResults, setActualitesResults] = useState([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [internalDocsCount, setInternalDocsCount] = useState(null);
  const [internalDocsHasMore, setInternalDocsHasMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [lastCriteria, setLastCriteria] = useState(null);
  // Favoris de l'usager connecté (Set des document_id, alimenté par /api/favoris/)
  const [favoris, setFavoris] = useState(() => new Set());
  const [favoriEnCours, setFavoriEnCours] = useState(null); // id en cours de toggle
  // Lecture audio du résumé (synthèse vocale native du navigateur)
  const [lectureEnCours, setLectureEnCours] = useState(false);
  const { selectedDomaine } = useContext(userContext);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const estConnecte = Boolean(user?.access);

  // Chargement des favoris de l'usager au montage (silencieux en cas d'échec)
  useEffect(() => {
    if (!estConnecte) return;
    axiosInstance
      .get('/api/favoris/')
      .then((res) => {
        setFavoris(new Set((res.data.results || []).map((f) => f.id)));
      })
      .catch((err) => console.error('Erreur lors du chargement des favoris :', err));
  }, [estConnecte]);

  // Toggle favori : optimiste, annule en cas d'échec réseau
  const toggleFavori = async (documentId) => {
    if (favoriEnCours) return; // un toggle à la fois
    setFavoriEnCours(documentId);
    const dejaFavori = favoris.has(documentId);

    // Mise à jour optimiste de l'UI
    setFavoris((prev) => {
      const next = new Set(prev);
      if (dejaFavori) next.delete(documentId);
      else next.add(documentId);
      return next;
    });

    try {
      const res = dejaFavori
        ? await axiosInstance.delete(`/api/favoris/${documentId}/`)
        : await axiosInstance.post('/api/favoris/', { document_id: documentId });
      toast.success(res.data?.detail || t('documents.favoris_maj'));
    } catch (err) {
      // Rollback de l'état optimiste
      setFavoris((prev) => {
        const next = new Set(prev);
        if (dejaFavori) next.add(documentId);
        else next.delete(documentId);
        return next;
      });
      const detail = err.response?.data?.detail;
      toast.error(detail || t('documents.favori_erreur'));
    } finally {
      setFavoriEnCours(null);
    }
  };

  const handleShowInfo = (modification) => {
    setSelectedModification(modification);
    setShowModal(true);
  };
  const openLifecycleModal = (docId) => {
    setSelectedDocId(docId);
    setShowLifecycleModal(true);
  };
  const closeLifecycleModal = () => {
    setShowLifecycleModal(false);
    setSelectedDocId(null);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedModification(null);
  };

  // Ouvre la modale de détail : le résumé en langage clair est affiché en priorité
  const openDetailModal = async (docId) => {
    setShowDetailModal(true);
    setDetailDoc(null);
    setDetailLoading(true);
    try {
      const response = await axiosInstance.get(`/api/documents/${docId}/`);
      setDetailDoc(response.data);
      setDetailTab(response.data.resume_simplifie ? "resume" : "officiel");
    } catch (error) {
      console.error("Erreur lors du chargement du détail du document :", error);
      toast.error("Impossible de charger le détail de ce document.");
      setShowDetailModal(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    // Interrompt toute lecture vocale en cours à la fermeture de la modale
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setLectureEnCours(false);
    setShowDetailModal(false);
    setDetailDoc(null);
    setDetailTab("resume");
  };

  // Ouverture ciblée depuis une autre page (ex. document suggéré par le chat F9)
  useEffect(() => {
    const docId = location.state?.openDocumentId;
    if (docId) {
      openDetailModal(docId);
      // Nettoie le state pour ne pas rouvrir la modale à chaque rendu
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lecture à voix haute du résumé en langage clair (API navigateur native, sans backend)
  const toggleLectureVocale = () => {
    if (!window.speechSynthesis || !detailDoc?.resume_simplifie) return;
    if (lectureEnCours) {
      window.speechSynthesis.cancel();
      setLectureEnCours(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(detailDoc.resume_simplifie);
    utterance.lang = "fr-FR";
    utterance.rate = 1;
    utterance.onend = () => setLectureEnCours(false);
    utterance.onerror = () => setLectureEnCours(false);
    window.speechSynthesis.cancel(); // annule une lecture précédente
    window.speechSynthesis.speak(utterance);
    setLectureEnCours(true);
  };

  const fetchDocuments = async (url) => {
    setLoading(true);
    try {
      const response = await axiosInstance.get(url);
      setDocuments(response.data.results || []);
      setNextPage(response.data.next || false);
      setPreviousPage(response.data.previous || false);
    } catch (error) {
      console.error("Erreur lors de la récupération des documents :", error);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const fetchInitialDocuments = async () => {
      setLoading(true);
      try {
        const params = selectedDomaine ? { domaine: selectedDomaine } : {};
        const response = await axiosInstance.get("/api/documents/", { params });
        setDocuments(response.data.results || []);
        setNextPage(response.data.next || false);
        setPreviousPage(response.data.previous || false);
      } catch (error) {
        console.error("Erreur lors du chargement des documents :", error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialDocuments();
  }, [selectedDomaine]);
  const handleDelete = async (id) => {
    const user = JSON.parse(localStorage.getItem("user"));
    const token = user?.access;
    if (!token) {
      console.error("Token non trouvé. Veuillez vous connecter.");
      return;
    }
    try {
      await axiosInstance.delete(`/api/documents/${id}/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      toast.success("Document supprimé avec succès !");
    } catch (error) {
      console.error("Erreur lors de la suppression :", error.response || error);
    }
  };

  const updateStatus = async (id, newStatus) => {
    const user = JSON.parse(localStorage.getItem("user"));
    const token = user?.access;
    const response = await axiosInstance.patch(
      `/api/documents/${id}/status/`,
      {
        status: newStatus,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    setDocuments(
      documents.map((doc) =>
        doc.id === id ? { ...doc, ...response.data } : doc
      )
    );
  };

  const handleEdit = (id) => {
    navigate(`/edit/${id}`);
  };

  const handleView = async (fileUrl, fileType, documentId) => {
    fileUrl = resolveFileUrl(fileUrl);
    if (fileType === "pdf") {
      window.open(fileUrl, "_blank");

      // Enregistrer la visite
      try {
        await axiosInstance.post(`/api/documents/${documentId}/visit/`);
      } catch (error) {
        console.error("Erreur lors de l'enregistrement de la visite :", error);
      }
    } else {
      toast.info("Ce fichier est disponible uniquement en téléchargement.");
    }
  };

  const [webResults, setWebResults] = useState(null);
  const [webLoading, setWebLoading] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // ─── RECHERCHE ────────────────────────────────────────────────────────────

  // Paramètres de filtrage communs (chips de la barre de recherche)
  const buildFilterParams = (filters = {}) => {
    const params = {};
    if (filters.type) params.type = filters.type;
    if (filters.domaine) params.domaine = filters.domaine;
    if (filters.status) params.status = filters.status;
    return params;
  };

  const fetchDocumentsWithParams = async (params) => {
    setLoading(true);
    try {
      const response = await axiosInstance.get("/api/documents/", { params });
      setDocuments(response.data.results || []);
      setNextPage(response.data.next || false);
      setPreviousPage(response.data.previous || false);
    } catch (error) {
      console.error("Erreur lors de la récupération des documents :", error);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  // Corps professionnels et actualités correspondant au terme recherché
  const fetchRelatedResults = async (query) => {
    if (!query || query.trim().length < 2) {
      setCorpsResults([]);
      setActualitesResults([]);
      return;
    }
    try {
      const [corpsResponse, actusResponse] = await Promise.all([
        axiosInstance.get("/api/corps/", { params: { search: query, page_size: 5 } }),
        axiosInstance.get("/api/actualites/", { params: { search: query, limit: 5 } }),
      ]);
      setCorpsResults(corpsResponse.data.results || []);
      setActualitesResults(actusResponse.data.results || []);
    } catch (error) {
      console.error("Erreur lors de la recherche des corps/actualités :", error);
      setCorpsResults([]);
      setActualitesResults([]);
    }
  };

  const resetSearch = () => {
    setIsSearchActive(false);
    setSearchValue("");
    setWebResults(null);
    setCorpsResults([]);
    setActualitesResults([]);
    setInternalDocsCount(null);
    setInternalDocsHasMore(false);
    setSearchPage(1);
    setLastCriteria(null);
    const params = selectedDomaine ? { domaine: selectedDomaine } : {};
    fetchDocumentsWithParams(params);
  };

  /**
   * @param criteria {{ searchBy, searchValue, filters }} émis par SearchBar
   * @param options  {{ append?, page? }} append = « charger plus » de résultats internes
   */
  const handleSearch = async (criteria, options = {}) => {
    const { append = false, page = 1 } = options;
    const { searchBy, searchValue: rawValue, filters = {} } = criteria;
    const term = typeof rawValue === "string" ? rawValue : rawValue?.text || "";

    setSearchValue(term);
    setIsSearchActive(true);
    setSearchPage(page);

    // Recherche ciblée (numéro / date / type / journal officiel) → liste interne seule
    if (searchBy !== "objet") {
      const params = { ...buildFilterParams(filters), page };
      if (searchBy === "journal") {
        params.dateJournal = rawValue.dateJournal;
        params.numeroJournal = rawValue.numeroJournal;
      } else if (searchBy === "date") {
        params.start_date = rawValue.startDate;
        params.end_date = rawValue.endDate;
      } else if (searchBy === "type") {
        params.type = rawValue.type;
        params.search = rawValue.text || "";
      } else {
        params[searchBy] = rawValue;
      }

      setWebResults(null);
      setCorpsResults([]);
      setActualitesResults([]);
      setInternalDocsCount(null);
      setInternalDocsHasMore(false);
      setLastCriteria(criteria);
      await fetchDocumentsWithParams(params);
      return;
    }

    // Recherche unifiée : documents internes (pagés, triés par pertinence) + web + corps + actualités
    setWebLoading(true);
    try {
      const response = await axiosInstance.post("/api/search", {
        query: term,
        page,
        page_size: 20,
        ...buildFilterParams(filters),
      });
      const docs = response.data.internalDocs || [];
      setDocuments((prev) => (append ? [...prev, ...docs] : docs));
      setInternalDocsCount(response.data.internalDocsCount ?? docs.length);
      setInternalDocsHasMore(Boolean(response.data.internalDocsHasMore));
      setWebResults(response.data);
      setNextPage(false);
      setPreviousPage(false);
      if (!append) {
        setLastCriteria(criteria);
        await fetchRelatedResults(term);
      }
    } catch (error) {
      console.error("Erreur lors de la recherche :", error);
      setDocuments([]);
      setWebResults({ webSearchAvailable: false, query: encodeURIComponent(term || "") });
    } finally {
      setWebLoading(false);
    }
  };

  const handleLoadMoreDocuments = () => {
    if (!lastCriteria) return;
    handleSearch(lastCriteria, { append: true, page: searchPage + 1 });
  };

  const handleDownload = async (fileUrl, fileName, documentId) => {
    try {
      const response = await axiosInstance.get(resolveFileUrl(fileUrl), {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName || "document.pdf");
      document.body.appendChild(link);
      link.click();

      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      await axiosInstance.post(`/api/documents/${documentId}/telechargement/`);
    } catch (error) {
      console.error("Erreur lors du téléchargement :", error);
      toast.error("Erreur lors du téléchargement du fichier.");
    }
  };

  return (
    <>
      <div className="flex flex-col items-center justify-center bg-transparent mt-9 px-4 sm:px-6 md:px-8">
        <div>
          <SearchBar
            onSearch={handleSearch}
            loading={loading || webLoading}
            resultatsCount={internalDocsCount}
          />
        </div>
        <div className="mb-2 flex flex-wrap items-center justify-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-300 px-5 py-3">
            {isSearchActive ? t('recherche.resultats') : t('recherche.liste_documents')}
          </h1>
          {isSearchActive && (
            <button
              onClick={resetSearch}
              className="inline-flex items-center gap-2 rounded-md bg-gray-700 px-3 py-1.5 text-sm text-white transition hover:bg-gray-600"
            >
              <FontAwesomeIcon icon={faXmark} />
              {t('recherche.reinitialiser_recherche')}
            </button>
          )}
        </div>
        {/* Groupe : Documents */}
        {isSearchActive && !loading && (
          <h2 className="mb-3 flex w-full max-w-6xl items-center gap-2 text-xl font-semibold text-gray-200">
            <FontAwesomeIcon icon={faFileLines} />
            Documents ({internalDocsCount ?? documents.length})
          </h2>
        )}
        <div className="overflow-x-auto w-full max-w-6xl bg-white shadow-md rounded-lg">
          {showModal && selectedModification && (
            <Modal onClose={closeModal}>                            <h2 className="text-lg font-bold mb-4">{t('documents.details_modifications')}</h2>
              <p><strong>{t('documents.modifie_par')}</strong> {selectedModification.user}</p>
              <p><strong>Date :</strong> {selectedModification.date}</p>
              <p><strong>{t('documents.modifications')}</strong> {selectedModification.details}</p>
            </Modal>
          )}
          {/* Modale de détail : résumé en langage clair / texte officiel */}
          {showDetailModal && (
            <Modal onClose={closeDetailModal} panelClassName="md:w-2/3 max-w-3xl">
              {detailLoading ? (
                <div className="flex justify-center py-10">
                  <Oval
                    visible={true}
                    height="60"
                    width="60"
                    color="#4f94a9"
                    ariaLabel="oval-loading"
                    wrapperStyle={{}}
                    wrapperClass=""
                  />
                </div>
              ) : detailDoc ? (
                <>
                  <h2 className="text-lg font-bold mb-1 pr-8">
                    {detailDoc.type} {detailDoc.numero ? `n° ${detailDoc.numero}` : ""}
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">{detailDoc.objet}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700 mb-4">
                    <p><strong>Date :</strong> {detailDoc.date || "—"}</p>
                    <p><strong>Statut :</strong> {detailDoc.status || "—"}</p>
                    <p><strong>Domaine :</strong> {detailDoc.domaine_nom || "—"}</p>
                    <p><strong>Conseil :</strong> {detailDoc.conseil || "—"}</p>
                  </div>

                  {detailDoc.resume_simplifie ? (
                    <>
                      <div className="flex gap-2 mb-3" role="tablist">
                        <button
                          role="tab"
                          aria-selected={detailTab === "resume"}
                          onClick={() => setDetailTab("resume")}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium ${detailTab === "resume"
                            ? "bg-blue-900 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                        >
                          En résumé
                        </button>
                        <button
                          role="tab"
                          aria-selected={detailTab === "officiel"}
                          onClick={() => setDetailTab("officiel")}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium ${detailTab === "officiel"
                            ? "bg-blue-900 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                        >
                          {t('documents.texte_officiel')}
                        </button>
                      </div>
                      {detailTab === "resume" ? (
                        <div className="bg-blue-50 border-l-4 border-blue-400 rounded-r-md p-4">
                          <p className="flex items-center gap-2 font-semibold text-blue-900 mb-2">
                            <FontAwesomeIcon icon={faLightbulb} /> {t('documents.en_resume')}
                          </p>
                          <p className="text-gray-800 leading-relaxed whitespace-pre-line">
                            {detailDoc.resume_simplifie}
                          </p>
                          <p className="text-xs text-blue-700 mt-3">
                            {t('documents.le_resume_est_aide')}
                          </p>
                          {window.speechSynthesis && (
                            <button
                              type="button"
                              onClick={toggleLectureVocale}
                              aria-pressed={lectureEnCours}
                              title={lectureEnCours ? t('documents.arreter_lecture') : t('documents.ecouter_resume')}
                              className="mt-3 inline-flex items-center gap-2 bg-blue-900 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-600 transition"
                            >
                              <FontAwesomeIcon icon={lectureEnCours ? faXmark : faVolumeHigh} />
                              {lectureEnCours ? t('documents.arreter_lecture') : t('documents.ecouter')}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-700">
                          <p className="mb-3">{t('documents.texte_pdf_intro')}</p>
                          {detailDoc.pdf_file || detailDoc.fichier ? (
                            <div className="flex flex-wrap gap-3">
                              <button
                                onClick={() =>
                                  handleView(
                                    detailDoc.pdf_file || detailDoc.fichier,
                                    "pdf",
                                    detailDoc.id
                                  )
                                }
                                className="bg-blue-900 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition"
                              >
                                <FontAwesomeIcon icon={faReadme} className="mr-2" />
                                {t('documents.lire_texte')}
                              </button>
                              <button
                                onClick={() =>
                                  handleDownload(
                                    detailDoc.pdf_file || detailDoc.fichier,
                                    `document-${detailDoc.id}.pdf`,
                                    detailDoc.id
                                  )
                                }
                                className="bg-gray-700 text-white px-4 py-2 rounded-md hover:bg-gray-500 transition"
                              >
                                <FontAwesomeIcon icon={faDownload} className="mr-2" />
                                Télécharger
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-500">Fichier non disponible.</span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 italic mb-2">
                      {t('documents.aucun_resume')}
                    </p>
                  )}
                </>
              ) : null}
            </Modal>
          )}
          {/* Document Lifecycle Modal */}
          {showLifecycleModal && selectedDocId && (
            <DocumentLifecycleModal
              documentId={selectedDocId}
              onClose={closeLifecycleModal}
              isAdmin={isAdmin}
              onStatusUpdated={(id, newStatus) => {
                setDocuments((prev) =>
                  prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d))
                );
              }}
            />
          )}
          {loading ? (
            <SearchResultsSkeleton rows={6} />
          ) : (
            <>
          <table className="table-auto w-full text-left border-collapse">
            <caption className="sr-only">{t('documents.caption')}</caption>
            <thead className="bg-blue-900 text-yellow-300">
              <tr>
                <th className="py-3 px-2 sm:px-4">{t('documents.colonne_dates')}</th>
                <th className="py-3 px-2 sm:px-4">{t('documents.colonne_types')}</th>
                <th className="py-3 px-2 sm:px-4">{t('documents.colonne_objets')}</th>
                <th className="py-3 px-2 sm:px-4">{t('documents.colonne_status')}</th>
                <th className="py-3 px-2 sm:px-4">{t('documents.colonne_action')}</th>
              </tr>
            </thead>
            <tbody className="text-gray-900">
              {documents.length > 0 ? (
                documents.map((doc) => (
                  <tr key={doc?.id} className="border-b border-gray-200 hover:bg-gray-100">
                    <td className="py-3 px-2 sm:px-4">{doc?.date}</td>
                    <td className="py-3 px-2 sm:px-4">{doc?.type}</td>
                    <td className="py-3 px-2 sm:px-4">
                      <span className="inline-flex items-center gap-2">
                        <span className="max-w-xs md:max-w-md truncate" title={doc?.objet}>{doc?.objet}</span>
                        <OfficialBadge />
                      </span>
                    </td>
                    <td className="py-3 px-2 sm:px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${doc?.status !== "En vigueur"
                          ? "bg-yellow-100 text-yellow-600"
                          : "bg-green-100 text-green-600"
                          }`}
                      >
                        {doc?.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 sm:px-4">
                      {estConnecte && (
                        <button
                          onClick={() => toggleFavori(doc.id)}
                          disabled={favoriEnCours === doc.id}
                          title={favoris.has(doc.id) ? t('documents.favori_retirer') : t('documents.favori_ajouter')}
                          aria-label={favoris.has(doc.id) ? t('documents.favori_retirer') : t('documents.favori_ajouter')}
                          aria-pressed={favoris.has(doc.id)}
                          className="text-yellow-500 hover:text-yellow-600 disabled:opacity-50"
                        >
                          <FontAwesomeIcon icon={favoris.has(doc.id) ? faStarSolid : faStarRegular} />
                        </button>
                      )}
                      {isAdmin ? (
                        <div className="flex space-x-2 sm:space-x-4">
                          <button
                            onClick={() => openDetailModal(doc.id)}
                            className={`hover:underline ${doc.resume_simplifie ? "text-blue-600" : "text-gray-500"}`}
                            title={
                              doc.resume_simplifie
                                ? t('documents.voir_resume')
                                : t('documents.voir_detail')
                            }
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>
                          {doc.pdf_file || doc.fichier ? (
                            <div className="flex-row">
                              <button
                                onClick={() => {
                                  doc.pdf_file
                                    ? handleView(doc.pdf_file, "pdf", doc.id)
                                    : handleView(doc.fichier, "pdf", doc.id);
                                }}
                                className="text-blue-800 hover:underline"
                              >
                                <FontAwesomeIcon icon={faReadme} />
                              </button>
                              <p>{doc.visits}</p>
                            </div>
                          ) : (
                            <span className="text-gray-500">{t('documents.non_disponible')}</span>
                          )}
                          <div className="flex-row">
                            <button
                              onClick={() =>
                                handleDownload(doc.pdf_file || doc.fichier, `document-${doc.id}.pdf`, doc.id)
                              }
                              className="text-gray-700 hover:underline"
                            >
                              <FontAwesomeIcon icon={faDownload} />
                            </button>
                            <p>{doc.telechargements}</p>
                          </div>
                          <button
                            onClick={() => handleEdit(doc?.id)}
                            className="text-green-500 hover:underline"
                          >
                            <FontAwesomeIcon icon={faPenToSquare} />
                          </button>
                          <button
                            onClick={() => handleDelete(doc?.id)}
                            className="text-red-500 hover:underline"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                          <button
                            onClick={() => updateStatus(doc.id,
                              doc.status === "En vigueur" ? "Abrogé" : "En vigueur")}
                            className="text-yellow-500 hover:underline"
                          >
                            <FontAwesomeIcon icon={faCashRegister} />
                          </button>
                          {doc.last_modified_by && (
                            <button
                              onClick={() => handleShowInfo({
                                user: doc.last_modified_by,
                                date: doc.last_modified_at,
                                details: doc.modification_details,
                              })}
                              className="text-red-500 hover:underline"
                            >
                              <FontAwesomeIcon icon={faCircleInfo} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex space-x-2 sm:space-x-4">
                          {estConnecte && (
                            <button
                              onClick={() => toggleFavori(doc.id)}
                              disabled={favoriEnCours === doc.id}
                              title={favoris.has(doc.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                              aria-label={favoris.has(doc.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                              aria-pressed={favoris.has(doc.id)}
                              className="text-yellow-500 hover:text-yellow-600 disabled:opacity-50"
                            >
                              <FontAwesomeIcon icon={favoris.has(doc.id) ? faStarSolid : faStarRegular} />
                            </button>
                          )}
                          <button
                            onClick={() => openDetailModal(doc.id)}
                            className={`hover:underline ${doc.resume_simplifie ? "text-blue-600" : "text-gray-500"}`}
                            title={
                              doc.resume_simplifie
                                ? t('documents.voir_resume')
                                : t('documents.voir_detail')
                            }
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>
                          {doc.pdf_file || doc.fichier ? (
                            <div className="flex-row">
                              <button
                                onClick={() => {
                                  doc.pdf_file
                                    ? handleView(doc.pdf_file, "pdf", doc.id)
                                    : handleView(doc.fichier, "pdf", doc.id);
                                }}
                                className="text-blue-800 hover:underline"
                              >
                                <FontAwesomeIcon icon={faReadme} />
                              </button>
                              <p>{doc.visits}</p>
                            </div>
                          ) : (
                            <span className="text-gray-500">{t('documents.non_disponible')}</span>
                          )}
                          <div className="flex-row">
                            <button
                              onClick={() =>
                                handleDownload(doc.pdf_file || doc.fichier, `document-${doc.id}.pdf`, doc.id)
                              }
                              className="text-gray-700 hover:underline"
                            >
                              <FontAwesomeIcon icon={faDownload} />
                            </button>
                            <p>{doc.telechargements}</p>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="py-4 text-center text-gray-500">
                    {t('recherche.aucun_resultat')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-between mt-4 px-4 sm:px-6">
            <button
              onClick={() => previousPage && fetchDocuments(previousPage)}
              disabled={!previousPage}
              className={`px-2 sm:px-4 py-2 rounded-md text-sm sm:text-base ${previousPage ? "bg-blue-900 text-white" : "bg-gray-300 text-gray-500"}`}
            >
              <FontAwesomeIcon icon={faBackward} className="mr-1 sm:mr-2" />{t('recherche.precedente')}
            </button>
            <button
              onClick={() => nextPage && fetchDocuments(nextPage)}
              disabled={!nextPage}
              className={`px-2 sm:px-4 py-2 rounded-md text-sm sm:text-base ${nextPage ? "bg-blue-900 text-white" : "bg-gray-300 text-gray-500"}`}
            >
              {t('recherche.suivante')}<FontAwesomeIcon icon={faForward} className="ml-1 sm:ml-2" />
            </button>
          </div>

          {internalDocsHasMore && (
            <div className="flex justify-center px-4 pb-4">
              <button
                onClick={handleLoadMoreDocuments}
                className="rounded-md bg-blue-900 px-4 py-2 text-sm text-white hover:bg-blue-600"
              >
                {t('recherche.charger_plus')}
              </button>
            </div>
          )}
            </>
          )}
        </div>

        {/* Groupe : Corps professionnels */}
        {isSearchActive && corpsResults.length > 0 && (
          <section className="mt-8 w-full max-w-6xl">              <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-200">
              <FontAwesomeIcon icon={faUsers} />
              {t('recherche.corps_professionnels')} ({corpsResults.length})
            </h2>
            <div className="space-y-3">
              {corpsResults.map((corps) => (
                <article key={corps.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{corps.nom || `Corps n° ${corps.numero}`}</p>
                      <p className="text-xs text-gray-500">
                        N° {corps.numero}
                        {corps.type_nom ? ` · ${corps.type_nom}` : ""}
                        {corps.status ? ` · ${corps.status}` : ""}
                      </p>
                    </div>
                    <Link to="/status" className="text-sm text-blue-800 hover:underline">
                      Voir la liste des corps
                    </Link>
                  </div>
                  {corps.description && (
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">{corps.description}</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Groupe : Actualités */}
        {isSearchActive && actualitesResults.length > 0 && (
          <section className="mt-8 w-full max-w-6xl">              <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-200">
              <FontAwesomeIcon icon={faNewspaper} />
              {t('recherche.annonces')} ({actualitesResults.length})
            </h2>
            <div className="space-y-3">
              {actualitesResults.map((actu) => (
                <article key={actu.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-gray-900">{actu.titre}</p>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      {actu.categorie || "actualite"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    {actu.conseil || "—"}
                    {actu.date ? ` · ${actu.date}` : ""}
                    {actu.lieu ? ` · ${actu.lieu}` : ""}
                  </p>
                  {actu.texte && (
                    <p className="mt-2 text-sm text-gray-600 line-clamp-3">{actu.texte}</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {webResults && (
          <WebSearchResult
            webSearchAvailable={webResults.webSearchAvailable}
            webItems={webResults.webItems || []}
            queryEncoded={webResults.query}
            searchValue={searchValue}
          />
        )}
      </div>
    </>
  );
};

export default Documents;