import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axiosInstance from "./AxiosConfig";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faMagnifyingGlass,
    faXmark,
    faClockRotateLeft,
    faSliders,
} from '@fortawesome/free-solid-svg-icons';

const HISTORY_KEY = "digitalfop_search_history";
const HISTORY_MAX = 5;
const DEBOUNCE_MS = 300;

// Valeurs telles qu'elles sont stockées en base (cf. AddDocs.jsx)
const DOCUMENT_TYPES = [
    "Constitution",
    "Traités internationaux",
    "Convention",
    "Lois organiques",
    "Lois ordinaires",
    "Ordonnances",
    "Décrets",
    "Arrêtés interministeriels",
    "Arrêtés",
    "Circilaire",
    "Notes",
];

const STATUS_FILTERS = [
    { value: "", label: "Tous les statuts" },
    { value: "en_vigueur", label: "En vigueur" },
    { value: "abrogé", label: "Abrogé" },
    { value: "modifié", label: "Modifié" },
];

// ─── Historique de recherche (localStorage, 5 dernières recherches) ──────────

export const readSearchHistory = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(HISTORY_KEY));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
};

export const pushSearchHistory = (term) => {
    const value = (term || "").trim();
    if (!value) return;
    const next = [value, ...readSearchHistory().filter((t) => t.toLowerCase() !== value.toLowerCase())];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(0, HISTORY_MAX)));
};

export const clearSearchHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
};

const SearchBar = ({ onSearch, loading = false, resultatsCount = null }) => {
    const { t } = useTranslation();
    const [searchBy, setSearchBy] = useState("objet");
    const [searchValue, setSearchValue] = useState("");
    const [selectedType, setSelectedType] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [journalDate, setJournalDate] = useState(""); // Date du Journal Officiel
    const [journalNumero, setJournalNumero] = useState(""); // Numéro du Journal Officiel
    // Historique : serveur si usager connecté (synchronisé entre appareils), localStorage sinon
    const [history, setHistory] = useState(readSearchHistory);
    const [showHistory, setShowHistory] = useState(false);
    const [filters, setFilters] = useState({ type: "", domaine: "", status: "" });
    const [domaines, setDomaines] = useState([]);

    const inputRef = useRef(null);
    const suggestionsTimer = useRef(null);
    const searchTimer = useRef(null);
    // Évite de relancer une recherche différée juste après un choix dans les listes
    const skipAutoSearch = useRef(false);
    const location = useLocation();
    const navigate = useNavigate();

    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const estConnecte = Boolean(user?.access);

    // Historique serveur : rechargé après chaque recherche effectuée (l'enregistrement
    // est fait côté backend dans le POST /api/search)
    const refreshServerHistory = useCallback(() => {
        if (!estConnecte) return;
        axiosInstance
            .get('/api/search/history/')
            .then((res) => {
                const terms = (res.data.results || []).map((r) => r.terme);
                setHistory(terms);
            })
            .catch((err) => console.error('Erreur historique serveur :', err));
    }, [estConnecte]);

    // Chargement initial de l'historique (serveur si connecté, localStorage sinon)
    useEffect(() => {
        if (estConnecte) {
            refreshServerHistory();
        }
    }, [estConnecte, refreshServerHistory]);

    const types = [
        { value: "", label: "Choisissez un type" },
        { value: "constitution", label: "Constitution" },
        { value: "traités internationaux", label: "Traité Internationaux" },
        { value: "convention", label: "Convention" },
        { value: "lois organiques", label: "Lois Organiques" },
        { value: "lois ordinaires", label: "Lois Ordinaires" },
        { value: "ordonnances", label: "Ordonnance" },
        { value: "decrets", label: "Décrets" },
        { value: "arretes interministeriels", label: "Arrêtés Interministériels" },
        { value: "arretes", label: "Arrêtés" },
        { value: "circilaire", label: "Circulaire" },
        { value: "notes", label: "Notes" },
    ];

    // Domaines pour le filtre (une seule requête au montage)
    useEffect(() => {
        axiosInstance
            .get("/api/domaines/")
            .then((response) => setDomaines(response.data.results || []))
            .catch((error) => console.error("Erreur lors de la récupération des domaines :", error));
    }, []);

    // Focus demandé depuis une autre page via le raccourci clavier (/ ou Ctrl+K)
    useEffect(() => {
        if (location.state?.focusSearch) {
            inputRef.current?.focus();
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, location.pathname, navigate]);

    const buildCriteria = useCallback((value = searchValue) => ({
        searchBy,
        filters,
        searchValue:
            searchBy === "date"
                ? { startDate, endDate }
                : searchBy === "type"
                    ? { type: selectedType, text: value }
                    : searchBy === "journal"
                        ? { dateJournal: journalDate, numeroJournal: journalNumero }
                        : value,
    }), [searchBy, filters, searchValue, startDate, endDate, selectedType, journalDate, journalNumero]);

    // Une recherche automatique n'est lancée que si le critère est exploitable
    const isReadyToSearch = useCallback((value = searchValue) => {
        switch (searchBy) {
            case "date":
                return Boolean(startDate && endDate);
            case "journal":
                return Boolean(journalDate || journalNumero);
            case "type":
                return Boolean(selectedType);
            default:
                return value.trim().length >= 3;
        }
    }, [searchBy, searchValue, startDate, endDate, journalDate, journalNumero, selectedType]);

    const runSearch = useCallback((criteria) => {
        const term = typeof criteria.searchValue === "string"
            ? criteria.searchValue
            : criteria.searchValue?.text || "";

        if (term.trim()) {
            if (estConnecte) {
                // L'enregistrement est fait côté serveur (POST /api/search) ; on rafraîchit la liste
                refreshServerHistory();
            } else {
                pushSearchHistory(term);
                setHistory(readSearchHistory());
            }
        }
        setShowSuggestions(false);
        setShowHistory(false);
        onSearch(criteria);
    }, [onSearch, estConnecte, refreshServerHistory]);

    // Suggestions : debounce de 300 ms (objet / numéro)
    useEffect(() => {
        if (!["objet", "numero"].includes(searchBy)) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        if (searchValue.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        clearTimeout(suggestionsTimer.current);
        suggestionsTimer.current = setTimeout(async () => {
            try {
                const params = searchBy === "type"
                    ? { searchBy, query: searchValue, type: selectedType }
                    : { searchBy, query: searchValue };

                const response = await axiosInstance.get("/api/suggestions/", { params });
                setSuggestions(response.data);
                setShowSuggestions(true);
            } catch (error) {
                console.error("Erreur lors de la récupération des suggestions :", error);
            }
        }, DEBOUNCE_MS);

        return () => clearTimeout(suggestionsTimer.current);
    }, [searchValue, searchBy, selectedType]);

    // Recherche automatique : debounce de 300 ms
    useEffect(() => {
        if (skipAutoSearch.current) {
            skipAutoSearch.current = false;
            return;
        }
        if (!isReadyToSearch()) return;

        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            runSearch(buildCriteria());
        }, DEBOUNCE_MS);

        return () => clearTimeout(searchTimer.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchValue, selectedType, startDate, endDate, journalDate, journalNumero, searchBy, filters]);

    const handleSearch = (e) => {
        e.preventDefault();
        runSearch(buildCriteria());
    };

    const handleSuggestionClick = (suggestion) => {
        skipAutoSearch.current = true;
        setSearchValue(suggestion);
        setSuggestions([]);
        setShowSuggestions(false);
        runSearch(buildCriteria(suggestion));
    };

    const handleHistoryClick = (term) => {
        skipAutoSearch.current = true;
        setSearchValue(term);
        setShowHistory(false);
        runSearch(buildCriteria(term));
    };

    const activeFilterCount = Object.values(filters).filter(Boolean).length;

    const resetFilters = () => {
        setFilters({ type: "", domaine: "", status: "" });
    };

    const chipClass = (isActive) =>
        `px-3 py-1.5 rounded-full text-xs font-medium border transition ${
            isActive
                ? "bg-blue-900 text-yellow-300 border-blue-900"
                : "bg-white text-gray-700 border-gray-300 hover:bg-blue-50"
        }`;

    const dropdownVisible =
        (showSuggestions && suggestions.length > 0) ||
        (showHistory && searchValue.trim() === "" && history.length > 0);

    return (
        <div className="flex flex-col items-center w-full p-4 bg-white shadow-lg rounded-lg max-w-4xl mx-auto">
            <h1 className="text-xl font-semibold text-gray-800 mb-4">{t('recherche.titre')}</h1>

            {/* Annonce du nombre de résultats pour les lecteurs d'écran */}
            <p aria-live="polite" role="status" className="sr-only">
                {resultatsCount === null
                    ? ""
                    : resultatsCount === 0
                        ? "Aucun résultat trouvé pour cette recherche."
                        : `${resultatsCount} résultat${resultatsCount > 1 ? "s" : ""} trouvé${resultatsCount > 1 ? "s" : ""}.`}
            </p>

            <form className="flex flex-col md:flex-row items-center w-full gap-4" onSubmit={handleSearch}>
                <select
                    className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchBy}
                    onChange={(e) => {
                        setSearchBy(e.target.value);
                        setSuggestions([]);
                        setShowSuggestions(false);
                    }}
                    aria-label={t('recherche.critere')}
                >
                    <option value="objet">{t('recherche.objet')}</option>
                    <option value="type">{t('recherche.type')}</option>
                    <option value="date">{t('recherche.date')}</option>
                    <option value="numero">{t('recherche.numero')}</option>
                    <option value="journal">{t('recherche.journal')}</option>
                </select>

                {searchBy === "date" ? (
                    <div className="flex gap-2 items-center">
                        <input
                            type="date"
                            className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            placeholder={t('recherche.date_debut')}
                            aria-label={t('recherche.date_debut')}
                        />
                        <span>à</span>
                        <input
                            type="date"
                            className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            placeholder={t('recherche.date_fin')}
                            aria-label={t('recherche.date_fin')}
                        />
                    </div>
                ) : searchBy === "type" ? (
                    <div className="relative flex flex-col md:flex-row gap-4 items-center w-full">
                        <select
                            className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            aria-label="Type de document"
                        >
                            {types.map((type, index) => (
                                <option key={index} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            className="p-2 border border-gray-300 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-gray-500"
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            placeholder={t('recherche.complement')}
                        />
                    </div>
                ) : searchBy === "journal" ? (
                    <div className="flex flex-col md:flex-row gap-4 items-center w-full">
                        <div>
                            <label htmlFor="recherche-date-jo" className="block text-gray-700 font-medium mb-2">
                                {t('recherche.date_jo')}
                            </label>
                            <input
                                id="recherche-date-jo"
                                type="date"
                                value={journalDate}
                                onChange={(e) => setJournalDate(e.target.value)}
                                className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label htmlFor="recherche-numero-jo" className="block text-gray-700 font-medium mb-2">
                                {t('recherche.numero_jo')}
                            </label>
                            <input
                                id="recherche-numero-jo"
                                type="text"
                                value={journalNumero}
                                onChange={(e) => setJournalNumero(e.target.value)}
                                className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder={t('recherche.entrez_numero')}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="relative w-full">
                        <input
                            id="global-search-input"
                            ref={inputRef}
                            type="text"
                            className="p-2 border border-gray-300 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-gray-500"
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            onFocus={() => setShowHistory(true)}
                            onBlur={() => setShowHistory(false)}
                            placeholder={t('recherche.placeholder', { critere: searchBy })}
                            autoComplete="off"
                            aria-label="Terme de recherche"
                        />

                        {dropdownVisible && (
                            <ul className="absolute top-full left-0 w-full bg-white border border-gray-300 rounded-md mt-1 z-20 shadow-md max-h-64 overflow-y-auto">
                                {showSuggestions && suggestions.length > 0
                                    ? suggestions.map((suggestion, index) => (
                                        <li key={`s-${index}`}>
                                            <button
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => handleSuggestionClick(suggestion)}
                                                className="w-full text-left p-2 hover:bg-blue-100"
                                            >
                                                <FontAwesomeIcon icon={faMagnifyingGlass} className="mr-2 text-gray-400 text-xs" />
                                                {suggestion}
                                            </button>
                                        </li>
                                    ))
                                    : history.map((term, index) => (
                                        <li key={`h-${index}`}>
                                            <button
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => handleHistoryClick(term)}
                                                className="w-full text-left p-2 hover:bg-blue-100 flex items-center justify-between"
                                            >
                                                <span>
                                                    <FontAwesomeIcon icon={faClockRotateLeft} className="mr-2 text-gray-400 text-xs" />
                                                    {term}
                                                </span>
                                                <span className="text-xs text-gray-600">{t('recherche.recherche_recente')}</span>
                                            </button>
                                        </li>
                                    ))}
                            </ul>
                        )}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="bg-blue-800 text-yellow-300 py-2 px-4 rounded-md hover:bg-blue-600 transition duration-200 flex items-center justify-center disabled:opacity-60"
                >
                    <FontAwesomeIcon icon={faMagnifyingGlass} className="px-3" />
                    {loading ? t('recherche.recherche_en_cours') : t('recherche.rechercher')}
                </button>
            </form>

            {/* Filtres permanents */}
            <div className="search-filters flex flex-wrap items-center gap-2 w-full mt-4">
                <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <FontAwesomeIcon icon={faSliders} /> {t('recherche.filtres')}
                </span>

                <select
                    value={filters.type}
                    onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                    className={chipClass(filters.type !== "")}
                    aria-label={t('recherche.type')}
                >
                    <option value="">{t('recherche.tous_types')}</option>
                    {DOCUMENT_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>

                <select
                    value={filters.domaine}
                    onChange={(e) => setFilters({ ...filters, domaine: e.target.value })}
                    className={chipClass(filters.domaine !== "")}
                    aria-label={t('recherche.critere')}
                >
                    <option value="">{t('recherche.tous_domaines')}</option>
                    {domaines.map((domaine) => (
                        <option key={domaine.id} value={domaine.id}>{domaine.nom}</option>
                    ))}
                </select>

                {STATUS_FILTERS.map((status) => (
                    <button
                        key={status.value || "all"}
                        type="button"
                        onClick={() => setFilters({ ...filters, status: status.value })}
                        className={chipClass(filters.status === status.value)}
                        aria-pressed={filters.status === status.value}
                    >
                        {t(`recherche.statut_${status.value || 'tous'}`)}
                    </button>
                ))}

                {activeFilterCount > 0 && (
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline"
                    >
                        <FontAwesomeIcon icon={faXmark} /> {t('recherche.reinitialiser', { count: activeFilterCount })}
                    </button>
                )}
            </div>

            {history.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 w-full mt-3">
                    <span className="text-xs text-gray-600">{t('recherche.recherches_recentes')}</span>
                    {history.map((term, index) => (
                        <button
                            key={`recent-${index}`}
                            type="button"
                            onClick={() => handleHistoryClick(term)}
                            className="px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-700 hover:bg-gray-200"
                        >
                            {term}
                        </button>
                    ))}
                    {!estConnecte && (
                        <button
                            type="button"
                            onClick={() => {
                                clearSearchHistory();
                                setHistory([]);
                            }}
                        className="text-xs text-gray-600 hover:text-red-600"                        >
                            {t('recherche.effacer')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchBar;
