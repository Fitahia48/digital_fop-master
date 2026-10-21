import React, { useEffect, useState, useContext, useRef } from "react";
import { useTranslation } from "react-i18next";
import SearchBar from "./SearchBar";
import WebSearchResult from "./WebSearchResult";
import { OfficialBadge } from "./WebSearchResult";
import { useNavigate, useLocation } from "react-router-dom";
import axiosInstance from "./AxiosConfig";
import { toast } from "react-toastify";
import { userContext } from "./Context";
import { resolveFileUrl, statusLabel, normalizeStatus } from "./Utils";
import { documentTypeLabel } from "../utils/documentTypes";
import downloadFile from "../utils/downloadFile";
import { Link } from "react-router-dom";
import { Oval } from "react-loader-spinner";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faPenToSquare, faTrash, faForward, faBackward, faSquarePlus, faCircleInfo, faLightbulb, faXmark, faUsers, faNewspaper, faFileLines, faVolumeHigh, faArrowUpRightFromSquare, faEye, faRotateRight, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import Modal from "./Modal";
import PdfViewer from "./PdfViewer";
import SearchResultsSkeleton from "./SearchResultsSkeleton";
import './AfficherDocs.css';

const Documents = ({ isAdmin }) => {
  const [data, setData] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [nextPage, setNextPage] = useState(true);
  const [previousPage, setPreviousPage] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedModification, setSelectedModification] = useState(null);
  const [journaux, setJournaux] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailDoc, setDetailDoc] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Résultats groupés (corps professionnels / actualités) et état de recherche
  const [corpsResults, setCorpsResults] = useState([]);
  const [actualitesResults, setActualitesResults] = useState([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [internalDocsCount, setInternalDocsCount] = useState(null);
  const [internalDocsHasMore, setInternalDocsHasMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [lastCriteria, setLastCriteria] = useState(null);
  // Erreur réseau sur le chargement des documents (état dédié + reprise)
  const [fetchError, setFetchError] = useState(false);
  const retryRef = useRef(null);

  const { selectedDomaine } = useContext(userContext);
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [pdfViewerUrl, setPdfViewerUrl] = useState(null);
  const [pdfViewerDoc, setPdfViewerDoc] = useState(null);
  // Téléchargeable du document ouvert dans la visionneuse (bouton « Télécharger »)
  const [pdfViewerTelechargeable, setPdfViewerTelechargeable] = useState(true);



  const handleShowInfo = (modification) => {
    setSelectedModification(modification);
    setShowModal(true);
  };
  const closeModal = () => {
    setShowModal(false);
    setSelectedModification(null);
  };

  // Date affichable : libellé long dans la langue courante, repli sur la valeur brute
  const formatDate = (value) => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'long',
        timeZone: 'Indian/Antananarivo',
      }).format(parsed);
    } catch {
      return String(value);
    }
  };

  // Surlignage discret des termes recherchés dans le titre (<mark>, contraste doux)
  const highlightTerm = (text, term) => {
    const value = text ?? "";
    const query = (term || "").trim();
    if (query.length < 2) return value;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = String(value).split(new RegExp(`(${escaped})`, "gi"));
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={index} className="bg-yellow-100 text-inherit rounded-sm px-0.5">{part}</mark>
        : <React.Fragment key={index}>{part}</React.Fragment>
    );
  };

  // Pastille de statut : couleur + libellé texte (jamais la couleur seule)
  const statusClass = (status) => {
    const key = normalizeStatus(status || "");
    if (key === "en_vigueur") return "bg-emerald-100 text-emerald-800";
    if (key === "abroge") return "bg-amber-100 text-amber-800";
    return "bg-gray-100 text-gray-700";
  };

  const openDetailModal = async (docId) => {
    setShowDetailModal(true);
    setDetailDoc(null);
    setDetailLoading(true);
    try {
      const response = await axiosInstance.get(`/api/documents/${docId}/`);
      setDetailDoc(response.data);
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
    setShowDetailModal(false);
    setDetailDoc(null);
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



  const fetchDocuments = async (url) => {
    setLoading(true);
    setFetchError(false);
    try {
      const response = await axiosInstance.get(url);
      setDocuments(response.data.results || []);
      setNextPage(response.data.next || false);
      setPreviousPage(response.data.previous || false);
    } catch (error) {
      console.error("Erreur lors de la récupération des documents :", error);
      setDocuments([]);
      setFetchError(true);
      retryRef.current = () => fetchDocuments(url);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const fetchInitialDocuments = async () => {
      setLoading(true);
      setFetchError(false);
      try {
        const params = selectedDomaine ? { domaine: selectedDomaine } : {};
        const response = await axiosInstance.get("/api/documents/", { params });
        setDocuments(response.data.results || []);
        setNextPage(response.data.next || false);
        setPreviousPage(response.data.previous || false);
      } catch (error) {
        console.error("Erreur lors du chargement des documents :", error);
        setDocuments([]);
        setFetchError(true);
        retryRef.current = fetchInitialDocuments;
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
    // Confirmation avant suppression définitive
    if (!window.confirm(t('documents.confirmer_suppression'))) return;
    try {
      await axiosInstance.delete(`/api/documents/${id}/`);
      toast.success("Document supprimé avec succès !");
      // Retire immédiatement le document de la liste sans rechargement de page
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (error) {
      console.error("Erreur lors de la suppression :", error.response || error);
      toast.error("Erreur lors de la suppression du document.");
    }
  };

  // Le changement de statut juridique se fait directement depuis le formulaire
  // d'édition (EditDoc), sans justification obligatoire.

  const handleEdit = (id) => {
    navigate(`/edit/${id}`);
  };

  const handleView = async (fileUrl, fileType, documentId, telechargeable = true) => {
    fileUrl = resolveFileUrl(fileUrl);
    if (fileType === "pdf") {
      setPdfViewerUrl(fileUrl);
      setPdfViewerDoc(documentId);
      setPdfViewerTelechargeable(telechargeable !== false);

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
    setFetchError(false);
    try {
      const response = await axiosInstance.get("/api/documents/", { params });
      setDocuments(response.data.results || []);
      setNextPage(response.data.next || false);
      setPreviousPage(response.data.previous || false);
    } catch (error) {
      console.error("Erreur lors de la récupération des documents :", error);
      setDocuments([]);
      setFetchError(true);
      retryRef.current = () => fetchDocumentsWithParams(params);
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
    setFetchError(false);
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
    setFetchError(false);
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
      retryRef.current = () => handleSearch(criteria, options);
    } catch (error) {
      console.error("Erreur lors de la recherche :", error);
      setDocuments([]);
      setFetchError(true);
      retryRef.current = () => handleSearch(criteria, options);
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
      // Helper avec repli sur le lien direct si le XHR est bloqué (CORS/IDM).
      await downloadFile(fileUrl, fileName || "document.pdf");
    } catch (error) {
      console.error("Erreur lors du téléchargement :", error);
      toast.error("Erreur lors du téléchargement du fichier.");
      return;
    }

    // Comptage du téléchargement : le fichier est déjà enregistré, un échec du
    // compteur ne doit donc ni faire échouer ni afficher une fausse erreur.
    if (!documentId) return;
    try {
      await axiosInstance.post(`/api/documents/${documentId}/telechargement/`);
    } catch (error) {
      console.error("Erreur lors de l'enregistrement du téléchargement :", error);
    }
  };

  // ─── ACTIONS PAR DOCUMENT (partagées tableau / cartes) ────────────────────

  const renderPublicActions = (doc) => {
    const hasFile = Boolean(doc?.pdf_file || doc?.fichier);
    const downloadable = doc?.telechargeable !== false;
    return (
      <div className="inline-flex items-start gap-2.5">
        {/* Colonne 1 : Détails + consultations */}
        <div className="flex flex-col items-center gap-1 min-w-[76px]">
          <Link
            to={`/documents/${doc.id}`}
            state={{ from: 'liste', searchValue }}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-900 bg-blue-900 px-3 py-1.5 text-xs font-medium text-yellow-300 shadow-sm transition-colors hover:bg-blue-800 hover:border-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap min-h-[32px]"
          >
            <FontAwesomeIcon icon={faFileLines} />
            <span>{t('documents.details')}</span>
          </Link>
          {hasFile && (
            <span
              className="inline-flex items-center justify-center gap-1 text-[11px] font-medium text-gray-500"
              title={t('documents.consultations')}
            >
              <FontAwesomeIcon icon={faEye} className="text-gray-400" aria-hidden="true" />
              <span>{doc?.visits ?? 0}</span>
              <span className="sr-only">{t('documents.consultations')}</span>
            </span>
          )}
        </div>

        {/* Colonne 2 : Télécharger + téléchargements */}
        <div className="flex flex-col items-center gap-1 min-w-[105px]">
          {hasFile && downloadable && (
            <button
              type="button"
              onClick={() => handleDownload(doc.pdf_file || doc.fichier, `document-${doc.id}.pdf`, doc.id)}
              title={t('common.telecharger')}
              aria-label={t('common.telecharger')}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap min-h-[32px]"
            >
              <FontAwesomeIcon icon={faDownload} />
              <span>{t('common.telecharger')}</span>
            </button>
          )}
          {hasFile && !downloadable && (
            <div className="w-full min-h-[32px] inline-flex items-center justify-center">
              <span className="inline-flex items-center justify-center px-2 text-xs text-gray-500 whitespace-nowrap">
                {t('telechargeable.option_non')}
              </span>
            </div>
          )}
          {!hasFile && (
            <div className="w-full min-h-[32px] inline-flex items-center justify-center">
              <span className="inline-flex items-center justify-center px-2 text-xs text-gray-400 whitespace-nowrap">
                {t('documents.non_disponible')}
              </span>
            </div>
          )}

          {hasFile && downloadable && (
            <span
              className="inline-flex items-center justify-center gap-1 text-[11px] font-medium text-gray-500"
              title={t('documents.telechargements')}
            >
              <FontAwesomeIcon icon={faDownload} className="text-gray-400" aria-hidden="true" />
              <span>{doc?.telechargements ?? 0}</span>
              <span className="sr-only">{t('documents.telechargements')}</span>
            </span>
          )}
        </div>
      </div>
    );
  };

  // Actions administrateur : séparées visuellement des actions publiques
  const renderAdminActions = (doc) => (
    <>
      <button
        type="button"
        onClick={() => handleEdit(doc?.id)}
        title={t('common.modifier')}
        aria-label={t('common.modifier')}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <FontAwesomeIcon icon={faPenToSquare} />
        {t('common.modifier')}
      </button>
      <button
        type="button"
        onClick={() => handleDelete(doc?.id)}
        title={t('common.supprimer')}
        aria-label={t('common.supprimer')}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500"
      >
        <FontAwesomeIcon icon={faTrash} />
        {t('common.supprimer')}
      </button>
      {doc?.last_modified_by && (
        <button
          type="button"
          onClick={() => handleShowInfo({
            user: doc.last_modified_by,
            date: doc.last_modified_at,
            details: doc.modification_details,
          })}
          title={t('documents.details_modifications')}
          aria-label={t('documents.details_modifications')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <FontAwesomeIcon icon={faCircleInfo} />
          {t('documents.details_modifications')}
        </button>
      )}
    </>
  );

  // Rappel des filtres actifs sous forme de pastilles supprimables
  const renderActiveFilterPills = () => {
    const active = Object.entries(lastCriteria?.filters || {}).filter(([, value]) => value !== "" && value != null);
    if (active.length === 0) return null;
    const labels = {
      type: t('recherche.filtre_type'),
      domaine: t('recherche.filtre_domaine'),
      status: t('recherche.filtre_statut'),
    };
    return active.map(([key, value]) => {
      let displayed = value;
      if (key === "type") displayed = documentTypeLabel(value, t);
      if (key === "status") displayed = t(`recherche.statut_${value}`);
      // Les libellés de domaine ne sont pas rechargés ici (pas de requête supplémentaire)
      const readable = key === "domaine" ? labels[key] : `${labels[key]} : ${displayed}`;
      return (
        <button
          key={key}
          type="button"
          onClick={() => handleSearch({ ...lastCriteria, filters: { ...lastCriteria.filters, [key]: "" } })}
          title={t('recherche.retirer_filtre')}
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {readable}
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          <span className="sr-only">{t('recherche.retirer_filtre')}</span>
        </button>
      );
    });
  };

  return (
    <>
      <div className="w-full max-w-6xl mx-auto mt-9 px-4 sm:px-6 md:px-8">
        <SearchBar
          onSearch={handleSearch}
          loading={loading || webLoading}
          resultatsCount={internalDocsCount}
        />

        {/* En-tête des résultats */}
        <div className="mt-7 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-100">
              {isSearchActive ? t('recherche.resultats') : t('recherche.liste_documents')}
            </h1>
            <div className="flex items-center gap-3">
              {isSearchActive && documents.length > 0 && !loading && !fetchError && (
                <OfficialBadge />
              )}
              {isSearchActive && (
                <button
                  type="button"
                  onClick={resetSearch}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 transition hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <FontAwesomeIcon icon={faXmark} />
                  {t('recherche.reinitialiser_recherche')}
                </button>
              )}
            </div>
          </div>

          {/* Nombre de résultats (aria-live) + rappel des filtres actifs */}
          {isSearchActive && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-sm text-gray-300" aria-live="polite">
                {!loading && !fetchError &&
                  (internalDocsCount === 0
                    ? t('recherche.aucun_resultat')
                    : t('recherche.resultats_pour', {
                        count: internalDocsCount ?? documents.length,
                        terme: searchValue,
                      }))}
              </p>
              {renderActiveFilterPills()}
            </div>
          )}
        </div>

        {/* Groupe : Documents */}
        <div className="w-full bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          {showModal && selectedModification && (
            <Modal onClose={closeModal}>
              <h2 className="text-lg font-bold mb-4">{t('documents.details_modifications')}</h2>
              <p><strong>{t('documents.modifie_par')}</strong> {selectedModification.user}</p>
              <p><strong>Date :</strong> {selectedModification.date}</p>
              <p><strong>{t('documents.modifications')}</strong> {selectedModification.details}</p>
            </Modal>
          )}                  {showDetailModal && (
            <Modal onClose={closeDetailModal} panelClassName="md:w-11/12 max-w-4xl">
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
                  {/* Status badge */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusClass(detailDoc.status)}`}>
                      {statusLabel(detailDoc.status)}
                    </span>
                  </div>

                  {/* Title */}
                  <h1 className="text-3xl font-bold text-gray-900 mb-2 leading-snug">
                    {documentTypeLabel(detailDoc.type, t)} {detailDoc.numero ? `n°${detailDoc.numero}` : ""} {detailDoc.objet}
                  </h1>

                  {/* Metadata line */}
                  <div className="text-sm text-gray-600 mb-4">
                    {/* Build metadata dynamically */}
                    {[
                      detailDoc.inclus_journal && detailDoc.date_journal ? (
                        <>
                          <span>Journal officiel </span>
                          <span>{formatDate(detailDoc.date_journal)}</span>
                          <span> • </span>
                        </>
                      ) : null,
                      detailDoc.domaine_nom ? (
                        <>
                          <span>Domaine : </span>
                          <span>{detailDoc.domaine_nom}</span>
                          <span> • </span>
                        </>
                      ) : null,
                      detailDoc.conseil ? (
                        <>
                          <span>Conseil : </span>
                          <span>{detailDoc.conseil}</span>
                          <span> • </span>
                        </>
                      ) : null,
                      detailDoc.organisme_emetteur ? (
                        <>
                          <span>Organisme : </span>
                          <span>{detailDoc.organisme_emetteur}</span>
                          <span> • </span>
                        </>
                      ) : null,
                      detailDoc.langue ? (
                        <>
                          <span>Langue : </span>
                          <span>{t(`fiche.langue_${detailDoc.langue}`)}</span>
                          <span> • </span>
                        </>
                      ) : null,
                      detailDoc.date ? (
                        <>
                          <span>Date du texte : </span>
                          <span>{formatDate(detailDoc.date)}</span>
                          <span> • </span>
                        </>
                      ) : null
                    ].filter(Boolean).map((item, index) => (
                      <React.Fragment key={index}>{item}</React.Fragment>
                    ))}
                  </div>

                  {/* Detail bloc */}
                  <div className="mb-4">
                    {[
                      detailDoc.numero_journal && detailDoc.page_journal ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">Journal officiel :</span>
                            <span>n° {detailDoc.numero_journal}, p. {detailDoc.page_journal}</span>
                          </div>
                        </>
                      ) : null,
                      detailDoc.lieu_signature ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">Lieu de signature :</span>
                            <span>{detailDoc.lieu_signature}</span>
                          </div>
                        </>
                      ) : null,
                      detailDoc.signataires ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">Signataire(s) :</span>
                            <span>{detailDoc.signataires}</span>
                          </div>
                        </>
                      ) : null
                    ].filter(Boolean).map((item, index) => (
                      <React.Fragment key={index}>{item}</React.Fragment>
                    ))}
                  </div>

                  {/* Bloc actions : téléchargement / lecture */}
                  <div className="flex flex-wrap gap-3 mt-4">
                    {((detailDoc.pdf_file || detailDoc.fichier) && detailDoc.telechargeable === false) && (
                      <span className="text-xs font-medium text-gray-500">{t('telechargeable.option_non')}</span>
                    )}
                    {((detailDoc.pdf_file || detailDoc.fichier) && detailDoc.telechargeable !== false) ? (
                      <button
                        onClick={() =>
                          handleDownload(
                            detailDoc.pdf_file || detailDoc.fichier,
                            `document-${detailDoc.id}.pdf`,
                            detailDoc.id
                          )
                        }
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
                        aria-label={t('common.telecharger')}
                      >
                        <FontAwesomeIcon icon={faDownload} />
                        <span>{t('common.telecharger')}</span>
                      </button>
                    ) : null}
                    {((detailDoc.pdf_file || detailDoc.fichier) && detailDoc.telechargeable === false) ? (
                      <a
                        href={resolveFileUrl(detailDoc.pdf_file || detailDoc.fichier)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-blue-800 text-white rounded-md hover:bg-blue-700 transition-colors"
                        aria-label={t('telechargeable.lire_aria')}
                      >
                        <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                        <span>{t('telechargeable.lire')}</span>
                        <span className="text-xs opacity-80">({t('documents.ouvrir_nouvel_onglet')})</span>
                      </a>
                    ) : null}
                  </div>
                  <button
                      onClick={closeDetailModal}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                    >
                      <span>{t('common.fermer')}</span>
                    </button>
                  </>
              ) : null}
            </Modal>
          )}

          {loading ? (
            <SearchResultsSkeleton rows={6} />
          ) : fetchError ? (
            /* ── Erreur réseau : message + reprise ─────────────────────────── */
            <div role="alert" className="text-center py-14 px-4">
              <FontAwesomeIcon icon={faTriangleExclamation} className="text-4xl text-amber-500" />
              <p className="mt-3 text-lg font-semibold text-gray-900">{t('recherche.erreur_reseau')}</p>
              <p className="mt-1 text-sm text-gray-600">{t('recherche.erreur_reseau_aide')}</p>
              <button
                type="button"
                onClick={() => retryRef.current && retryRef.current()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-sm font-medium text-yellow-300 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <FontAwesomeIcon icon={faRotateRight} />
                {t('documents.reessayer')}
              </button>
            </div>
          ) : documents.length === 0 ? (
            /* ── Aucun résultat : conseils + reprise ───────────────────────── */
            <div className="text-center py-14 px-4">
              <FontAwesomeIcon icon={faFileLines} className="text-4xl text-gray-300" />
              <p className="mt-3 text-lg font-semibold text-gray-900">{t('recherche.aucun_resultat')}</p>
              <p className="mt-1 text-sm text-gray-600">{t('recherche.aucun_resultat_conseil')}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                {isSearchActive && (
                  <button
                    type="button"
                    onClick={resetSearch}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-sm font-medium text-yellow-300 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                    {t('recherche.reinitialiser_recherche')}
                  </button>
                )}
                <Link
                  to="/aide"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <FontAwesomeIcon icon={faCircleInfo} />
                  {t('recherche.lien_aide')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* ── Mobile : cartes de résultat ─────────────────────────────── */}
              <ul className="md:hidden divide-y divide-gray-100">
                {documents.map((doc) => (
                  <li key={doc?.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">
                        {documentTypeLabel(doc?.type, t)}
                        {doc?.numero ? ` n° ${doc.numero}` : ""}
                      </p>
                      <span className={`flex-shrink-0 px-2 py-1 rounded-full text-xs font-medium ${statusClass(doc?.status)}`}>
                        {statusLabel(doc?.status)}
                      </span>
                    </div>
                    <Link
                      to={`/documents/${doc.id}`}
                      state={{ from: 'liste', searchValue }}
                      title={t('documents.voir_detail')}
                      className="mt-1 block text-base font-medium text-blue-900 hover:underline line-clamp-2"
                    >
                      {highlightTerm(doc?.objet, isSearchActive ? searchValue : "")}
                    </Link>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatDate(doc?.date)}
                      {doc?.domaine_nom ? ` · ${doc.domaine_nom}` : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {renderPublicActions(doc)}
                    </div>
                    {isAdmin && (
                      <div className="mt-3 pt-3 border-t border-dashed border-gray-200 flex flex-wrap items-center gap-2">
                        <span className="sr-only">{t('documents.admin_actions')}</span>
                        {renderAdminActions(doc)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* ── Desktop : tableau ───────────────────────────────────────── */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <caption className="sr-only">{t('documents.caption')}</caption>
                  <thead className="bg-blue-900 text-yellow-300">
                    <tr>
                      <th scope="col" className="py-3 px-4">{t('documents.colonne_dates')}</th>
                      <th scope="col" className="py-3 px-4">{t('documents.colonne_types')}</th>
                      <th scope="col" className="py-3 px-4">{t('documents.colonne_objets')}</th>
                      <th scope="col" className="py-3 px-4">{t('documents.colonne_status')}</th>
                      <th scope="col" className="py-3 px-4 whitespace-nowrap">{t('documents.colonne_action')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-900">
                    {documents.map((doc, index) => (
                      <tr
                        key={doc?.id}
                        className={`border-b border-gray-100 transition-colors hover:bg-blue-50/60 ${index % 2 === 1 ? "bg-gray-50/70" : "bg-white"}`}
                      >
                        <td className="py-3 px-4 align-top text-sm text-gray-600 whitespace-nowrap">
                          {formatDate(doc?.date)}
                        </td>
                        <td className="py-3 px-4 align-top text-sm text-gray-600">
                          {documentTypeLabel(doc?.type, t)}
                        </td>
                        <td className="py-3 px-4 align-top">
                          {/* P1 : l'objet est un lien vers la fiche à URL stable.
                              Le state conserve la recherche → « retour » fidèle. */}
                          <Link
                            to={`/documents/${doc.id}`}
                            state={{ from: 'liste', searchValue }}
                            title={doc?.objet}
                            className="block font-medium text-blue-900 hover:underline line-clamp-2 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                          >
                            {highlightTerm(doc?.objet, isSearchActive ? searchValue : "")}
                          </Link>
                          {doc?.domaine_nom && (
                            <p className="mt-0.5 text-xs text-gray-500">{doc.domaine_nom}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 align-top">
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusClass(doc?.status)}`}>
                            {statusLabel(doc?.status)}
                          </span>
                        </td>
                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          <div className="flex flex-col gap-2">
                            {renderPublicActions(doc)}
                            {isAdmin && (
                              <>
                                <span className="w-full border-t border-gray-100 my-0.5" aria-hidden="true" />
                                <div className="flex flex-wrap items-center gap-2">
                                  {renderAdminActions(doc)}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination (liste classique paginée par l'API) */}
              {(nextPage || previousPage) && (
                <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => previousPage && fetchDocuments(previousPage)}
                    disabled={!previousPage}
                    aria-label={t('recherche.precedente')}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <FontAwesomeIcon icon={faBackward} />
                    {t('recherche.precedente')}
                  </button>
                  <button
                    type="button"
                    onClick={() => nextPage && fetchDocuments(nextPage)}
                    disabled={!nextPage}
                    aria-label={t('recherche.suivante')}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {t('recherche.suivante')}
                    <FontAwesomeIcon icon={faForward} />
                  </button>
                </div>
              )}

              {/* Recherche unifiée : « charger plus » */}
              {internalDocsHasMore && (
                <div className="flex justify-center border-t border-gray-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={handleLoadMoreDocuments}
                    className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-medium text-yellow-300 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <section className="mt-8 w-full">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-100">
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
          <section className="mt-8 w-full">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-100">
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

      {/* Modal Visionneuse PDF */}
      {pdfViewerUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col animate__animated animate__fadeIn">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-lg text-gray-800">{t('documents.visionneuse_pdf')}</h3>
              <div className="flex items-center gap-2">
                {pdfViewerTelechargeable ? (
                  <button
                    onClick={() =>
                      handleDownload(pdfViewerUrl, `document-${pdfViewerDoc}.pdf`, pdfViewerDoc)
                    }
                    className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm transition flex items-center gap-2"
                  >
                    <FontAwesomeIcon icon={faDownload} />
                    {t('common.telecharger')}
                  </button>
                ) : (
                  <span className="text-xs font-medium text-gray-500">{t('telechargeable.option_non')}</span>
                )}
                <button
                  onClick={() => {
                    setPdfViewerUrl(null);
                    setPdfViewerDoc(null);
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm transition"
                >
                  {t('common.fermer')}
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-2 bg-gray-100">
              <PdfViewer fileUrl={pdfViewerUrl} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Documents;
