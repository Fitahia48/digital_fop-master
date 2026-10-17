import React, { useEffect, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import SearchBar from "./SearchBar";
import WebSearchResult from "./WebSearchResult";
import { OfficialBadge } from "./WebSearchResult";
import { useNavigate, useLocation } from "react-router-dom";
import axiosInstance from "./AxiosConfig";
import { toast } from "react-toastify";
import { userContext } from "./Context";
import { resolveFileUrl, statusLabel } from "./Utils";
import downloadFile from "../utils/downloadFile";
import { Link } from "react-router-dom";
import { Oval } from "react-loader-spinner";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faPenToSquare, faTrash, faForward, faBackward, faSquarePlus, faCircleInfo, faFileContract, faLightbulb, faXmark, faUsers, faNewspaper, faFileLines, faVolumeHigh, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
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
  // Modale de détail (résumé en langage clair / texte officiel)
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

  const { selectedDomaine } = useContext(userContext);
  const { t } = useTranslation();
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

  // Ouvre la modale de détail : le résumé en langage clair est affiché en priorité
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
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold 
                      ${detailDoc.status === "en_vigueur" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}
                    `}>
                      {statusLabel(detailDoc.status)}
                    </span>
                  </div>
                  
                  {/* Title */}
                  <h1 className="text-3xl font-bold text-gray-900 mb-2 leading-snug">
                    {detailDoc.type} {detailDoc.numero ? `n°${detailDoc.numero}` : ""} {detailDoc.objet}
                  </h1>
                  
                  {/* Metadata line */}
                  <div className="text-sm text-gray-600 mb-4">
                    {/* Build metadata dynamically */}
                    {[ 
                      detailDoc.inclus_journal && detailDoc.date_journal ? (
                        <>
                          <span>Journal officiel </span>
                          <span>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeZone: 'Indian/Antananarivo' }).format(new Date(detailDoc.date_journal))}</span>
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
                          <span>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeZone: 'Indian/Antananarivo' }).format(new Date(detailDoc.date))}</span>
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
                  
                  {/* Resume card */}
                  {detailDoc.resume_simplifie ? (
                    <section className="bg-emerald-50 rounded-lg p-6 border-l-4 border-emerald-400">
                      <div className="flex items-center gap-2 mb-4">
                        <FontAwesomeIcon icon={faLightbulb} className="text-emerald-900" />
                        <h2 className="text-xl font-semibold text-emerald-900">{t('documents.en_resume')}</h2>
                      </div>
                      <p className="text-gray-800 leading-relaxed whitespace-pre-line mb-4">
                        {detailDoc.resume_simplifie}
                      </p>
                      <p className="text-xs text-emerald-700">
                        {t('documents.le_resume_est_aide')}
                      </p>
                    </section>
                  ) : (
                    <p className="text-sm text-gray-500 italic text-center py-6">
                      {t('documents.aucun_resume_disponible', { defaultValue: 'Aucun résumé disponible pour ce texte' })}
                    </p>
                  )}
                  
                  {/* Action buttons : téléchargeable → « Télécharger » ; sinon → « Lire » (nouvel onglet) */}
                  <div className="flex flex-wrap items-center justify-end gap-3 pt-6">
                    {(detailDoc.pdf_file || detailDoc.fichier) && detailDoc.telechargeable === false && (
                      <span className="text-xs font-medium text-gray-500">{t('telechargeable.option_non')}</span>
                    )}
                    {(detailDoc.pdf_file || detailDoc.fichier) && detailDoc.telechargeable !== false ? (
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
                    {(detailDoc.pdf_file || detailDoc.fichier) && detailDoc.telechargeable === false ? (
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
                    <button
                      onClick={closeDetailModal}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                    >
                      <span>{t('common.fermer')}</span>
                    </button>
                  </div>
                </>
              ) : null}
            </Modal>
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
                        {/* P1 : l'objet est un lien vers la fiche à URL stable.
                            Le state conserve la recherche → « retour » fidèle. */}
                        <Link
                          to={`/documents/${doc.id}`}
                          state={{ from: 'liste', searchValue }}
                          title={t('documents.voir_detail')}
                          className="max-w-xs md:max-w-md truncate text-blue-800 hover:underline"
                        >
                          {doc?.objet}
                        </Link>
                        <OfficialBadge />
                      </span>
                    </td>
                    <td className="py-3 px-2 sm:px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          /* « Non vérifié » affiché sans ambiguïté (neutre/gris) */
                          doc?.status === "en_vigueur"
                            ? "bg-green-100 text-green-600"
                            : doc?.status === "abroge"
                              ? "bg-yellow-100 text-yellow-600"
                              : "bg-gray-100 text-gray-600"
                          }`}
                      >
                        {statusLabel(doc?.status)}
                      </span>
                    </td>
                    <td className="py-3 px-2 sm:px-4">
                      {isAdmin ? (
                        <div className="flex space-x-2 sm:space-x-4">
                          {doc.pdf_file || doc.fichier ? (
                            <div className="flex-row">
                              <p title={t('documents.consultations')}>{doc.visits}</p>
                            </div>
                          ) : (
                            <span className="text-gray-500">{t('documents.non_disponible')}</span>
                          )}                          <div className="flex-row">
                            {doc.telechargeable === false ? (
                              // Non téléchargeable : pas de bouton, mention sobre à la place
                              <span className="text-xs text-gray-500">{t('telechargeable.option_non')}</span>
                            ) : (
                              <button
                                onClick={() =>
                                  handleDownload(doc.pdf_file || doc.fichier, `document-${doc.id}.pdf`, doc.id)
                                }
                                title={t('common.telecharger')}
                                aria-label={t('common.telecharger')}
                                className="text-gray-700 hover:underline"
                              >
                                <FontAwesomeIcon icon={faDownload} />
                              </button>
                            )}
                              <p title={t('documents.telechargements')}>{doc.telechargements}</p>
                          </div>
                          <button
                            onClick={() => handleEdit(doc?.id)}
                            title={t('common.modifier')}
                            aria-label={t('common.modifier')}
                            className="text-green-500 hover:underline"
                          >
                            <FontAwesomeIcon icon={faPenToSquare} />
                          </button>
                          <button
                            onClick={() => handleDelete(doc?.id)}
                            title={t('common.supprimer')}
                            aria-label={t('common.supprimer')}
                            className="text-red-500 hover:underline"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                          {doc.last_modified_by && (
                            <button
                              onClick={() => handleShowInfo({
                                user: doc.last_modified_by,
                                date: doc.last_modified_at,
                                details: doc.modification_details,
                              })}
                              title={t('documents.details_modifications')}
                              aria-label={t('documents.details_modifications')}
                              className="text-red-500 hover:underline"
                            >
                              <FontAwesomeIcon icon={faCircleInfo} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex space-x-2 sm:space-x-4">
                          {doc.pdf_file || doc.fichier ? (
                            <div className="flex-row">
                              <p title={t('documents.consultations')}>{doc.visits}</p>
                            </div>
                          ) : (
                            <span className="text-gray-500">{t('documents.non_disponible')}</span>
                          )}                          <div className="flex-row">
                            {doc.telechargeable === false ? (
                              // Non téléchargeable : pas de bouton, mention sobre à la place
                              <span className="text-xs text-gray-500">{t('telechargeable.option_non')}</span>
                            ) : (
                              <button
                                onClick={() =>
                                  handleDownload(doc.pdf_file || doc.fichier, `document-${doc.id}.pdf`, doc.id)
                                }
                                title={t('common.telecharger')}
                                aria-label={t('common.telecharger')}
                                className="text-gray-700 hover:underline"
                              >
                                <FontAwesomeIcon icon={faDownload} />
                              </button>
                            )}
                              <p title={t('documents.telechargements')}>{doc.telechargements}</p>
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

      {/* Modal Visionneuse PDF */}
      {pdfViewerUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col animate__animated animate__fadeIn">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-lg text-gray-800">Lecture du document</h3>
              <div className="flex items-center gap-2">
                {pdfViewerTelechargeable ? (
                <button 
                  onClick={() =>
                    handleDownload(pdfViewerUrl, `document-${pdfViewerDoc}.pdf`, pdfViewerDoc)
                  }
                  className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm transition flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faDownload} />
                  Télécharger
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
                  Fermer
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