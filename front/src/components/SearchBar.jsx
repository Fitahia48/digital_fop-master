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
    faChevronDown,
    faCalendarDays,
    faNewspaper,
} from '@fortawesome/free-solid-svg-icons';
import { DOCUMENT_TYPES, documentTypeLabel } from '../utils/documentTypes';

const HISTORY_KEY = "digitalfop_search_history";
const HISTORY_MAX = 5;
const DEBOUNCE_MS = 300;
// Nombre minimum de caractères pour déclencher une recherche sur un critère texte
const MIN_TERM_LENGTH = 3;

// Valeurs canoniques de la liste contrôlée (source unique : utils/documentTypes)
const STATUS_FILTERS = [
    // `value` sert à la fois de filtre serveur et de suffixe de clé i18n
    // (recherche.statut_*) : garder les clés canoniques de l'enum Strapi.
    { value: "", label: "Tous les statuts" },
    { value: "en_vigueur", label: "En vigueur" },
    { value: "abroge", label: "Abrogé" },
    // « modifie » et « non_verifie » restent des valeurs de l'enum côté serveur
    // (affichées sur les notices et les fiches) mais ne sont plus proposées
    // comme filtres rapides : seuls les statuts franchement actionnables pour
    // l'usager (en vigueur / abrogé) sont filtrables.
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

// Troncature propre pour les puces d'historique (le texte complet est dans title)
const truncateLabel = (text, max = 28) =>
    text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

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
    // Recherche avancée (période / Journal Officiel) : repliée par défaut
    const [advancedOpen, setAdvancedOpen] = useState(false);
    // Panneau de filtres repliable sur mobile
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    // Retours utilisateur (saisie trop courte)
    const [error, setError] = useState(null);

    const inputRef = useRef(null);
    const suggestionsTimer = useRef(null);
    const searchTimer = useRef(null);
    // Évite de relancer une recherche différée juste après un choix dans les listes
    const skipAutoSearch = useRef(false);
    const location = useLocation();
    const navigate = useNavigate();

    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const estConnecte = Boolean(user?.access);

    // Libellé du critère courant (placeholder + panneau avancé)
    const critereLabel = {
        objet: t('recherche.objet'),
        type: t('recherche.type'),
        numero: t('recherche.numero'),
        date: t('recherche.date'),
        journal: t('recherche.journal'),
    }[searchBy];

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

    // Critère « type » : liste contrôlée (source unique) + libellés i18n
    const types = [
        { value: "", label: "Choisissez un type" },
        ...DOCUMENT_TYPES.map((d) => ({ value: d.value, label: documentTypeLabel(d.value, t) })),
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

    // Un critère avancé actif garde son panneau ouvert après un rendu
    useEffect(() => {
        if (searchBy === "date" || searchBy === "journal") setAdvancedOpen(true);
    }, [searchBy]);

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
                return value.trim().length >= MIN_TERM_LENGTH;
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
        // Retour utilisateur : le code n'accepte que les termes suffisamment longs
        if (["objet", "numero"].includes(searchBy) && searchValue.trim().length < MIN_TERM_LENGTH) {
            setError(t('recherche.terme_trop_court', { count: MIN_TERM_LENGTH }));
            return;
        }
        setError(null);
        runSearch(buildCriteria());
    };

    const handleSuggestionClick = (suggestion) => {
        skipAutoSearch.current = true;
        setSearchValue(suggestion);
        setSuggestions([]);
        setShowSuggestions(false);
        setError(null);
        runSearch(buildCriteria(suggestion));
    };

    const handleHistoryClick = (term) => {
        skipAutoSearch.current = true;
        setSearchValue(term);
        setShowHistory(false);
        setError(null);
        runSearch(buildCriteria(term));
    };

    const handleCritereChange = (value) => {
        setSearchBy(value);
        setSuggestions([]);
        setShowSuggestions(false);
        setError(null);
    };

    const activeFilterCount = Object.values(filters).filter(Boolean).length;
    const activeAdvancedCount = [
        Boolean(startDate && endDate),
        Boolean(journalDate || journalNumero),
    ].filter(Boolean).length;

    const resetFilters = () => {
        setFilters({ type: "", domaine: "", status: "" });
    };

    const dropdownVisible =
        (showSuggestions && suggestions.length > 0) ||
        (showHistory && searchValue.trim() === "" && history.length > 0);

    const inputBaseClass =
        "w-full h-[52px] text-base border border-gray-300 rounded-xl bg-white " +
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";
    const selectBaseClass =
        "w-full h-[42px] px-3 text-sm border border-gray-300 rounded-lg bg-white " +
        "focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors";

    // Rangée de filtres partagée (desktop) et panneau mobile
    const renderFilterControls = (idPrefix) => (
        <>
            <div className="flex-1 min-w-[170px]">
                <label htmlFor={`${idPrefix}-type`} className="block text-xs font-medium text-gray-600 mb-1">
                    {t('recherche.filtre_type')}
                </label>
                <select
                    id={`${idPrefix}-type`}
                    value={filters.type}
                    onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                    className={selectBaseClass}
                >
                    <option value="">{t('recherche.tous_types')}</option>
                    {DOCUMENT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                            {documentTypeLabel(type.value, t)}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex-1 min-w-[170px]">
                <label htmlFor={`${idPrefix}-domaine`} className="block text-xs font-medium text-gray-600 mb-1">
                    {t('recherche.filtre_domaine')}
                </label>
                <select
                    id={`${idPrefix}-domaine`}
                    value={filters.domaine}
                    onChange={(e) => setFilters({ ...filters, domaine: e.target.value })}
                    className={selectBaseClass}
                >
                    <option value="">{t('recherche.tous_domaines')}</option>
                    {domaines.map((domaine) => (
                        <option key={domaine.id} value={domaine.id}>{domaine.nom}</option>
                    ))}
                </select>
            </div>

            <div>
                <span
                    id={`${idPrefix}-statut-label`}
                    className="block text-xs font-medium text-gray-600 mb-1"
                >
                    {t('recherche.filtre_statut')}
                </span>
                <div
                    role="group"
                    aria-labelledby={`${idPrefix}-statut-label`}
                    className="flex rounded-lg border border-gray-300 overflow-hidden bg-white"
                >
                    {STATUS_FILTERS.map((status) => (
                        <button
                            key={status.value || "all"}
                            type="button"
                            onClick={() => setFilters({ ...filters, status: status.value })}
                            aria-pressed={filters.status === status.value}
                            className={`px-3 h-[42px] text-sm font-medium border-r border-gray-300 last:border-r-0 transition-colors ${
                                filters.status === status.value
                                    ? "bg-blue-900 text-yellow-300"
                                    : "bg-white text-gray-700 hover:bg-blue-50"
                            }`}
                        >
                            {t(`recherche.statut_${status.value || 'tous'}`)}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );

    return (
        <div className="w-full max-w-6xl mx-auto px-4">
            <section className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 sm:p-6">
                {/* Titre et aide */}
                <header className="mb-5">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                        {t('recherche.titre_accueil')}
                    </h2>
                    <p className="mt-1 text-sm sm:text-base text-gray-600">
                        {t('recherche.aide')}
                    </p>
                </header>

                {/* Annonce du nombre de résultats pour les lecteurs d'écran */}
                <p aria-live="polite" role="status" className="sr-only">
                    {resultatsCount === null
                        ? ""
                        : resultatsCount === 0
                            ? t('recherche.aucun_resultat')
                            : t('recherche.resultats_annonce', { count: resultatsCount })}
                </p>

                <form role="search" onSubmit={handleSearch} className="space-y-4">
                    {/* (1) Critère + champ principal + bouton */}
                    <div className="flex flex-col md:flex-row md:items-end gap-3">
                        <div className="md:w-44 flex-shrink-0">
                            <label
                                htmlFor="search-critere"
                                className="block text-xs font-medium text-gray-600 mb-1"
                            >
                                {t('recherche.critere')}
                            </label>
                            <select
                                id="search-critere"
                                value={searchBy}
                                onChange={(e) => handleCritereChange(e.target.value)}
                                className={selectBaseClass.replace('h-[42px]', 'h-[52px]')}
                            >
                                <option value="objet">{t('recherche.objet')}</option>
                                <option value="type">{t('recherche.type')}</option>
                                <option value="numero">{t('recherche.numero')}</option>
                                <option value="date">{t('recherche.date')}</option>
                                <option value="journal">{t('recherche.journal')}</option>
                            </select>
                        </div>

                        <div className="flex-1 min-w-0">
                            <label htmlFor="global-search-input" className="sr-only">
                                {t('recherche.champ_saisie')}
                            </label>
                            <div className="relative">
                                <input
                                    id="global-search-input"
                                    ref={inputRef}
                                    type="text"
                                    className={`${inputBaseClass} pl-12 ${searchValue ? 'pr-24' : 'pr-16'}`}
                                    value={searchValue}
                                    onChange={(e) => {
                                        setSearchValue(e.target.value);
                                        if (error) setError(null);
                                    }}
                                    onFocus={() => setShowHistory(true)}
                                    onBlur={() => setShowHistory(false)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                            setShowSuggestions(false);
                                            setShowHistory(false);
                                        }
                                    }}
                                    placeholder={t('recherche.placeholder', { critere: critereLabel })}
                                    autoComplete="off"
                                    aria-label={t('recherche.champ_saisie')}
                                    aria-autocomplete={["objet", "numero"].includes(searchBy) ? "list" : "none"}
                                    aria-expanded={dropdownVisible}
                                />
                                <FontAwesomeIcon
                                    icon={faMagnifyingGlass}
                                    aria-hidden="true"
                                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                                />
                                {searchValue && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchValue("");
                                            setError(null);
                                            inputRef.current?.focus();
                                        }}
                                        aria-label={t('recherche.effacer_terme')}
                                        title={t('recherche.effacer_terme')}
                                        className="absolute right-12 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                                    >
                                        <FontAwesomeIcon icon={faXmark} />
                                    </button>
                                )}
                                {/* Indice discret du raccourci clavier */}
                                <kbd
                                    aria-hidden="true"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded border border-gray-300 bg-gray-50 text-xs text-gray-500 font-sans"
                                >
                                    /
                                </kbd>

                                {/* Suggestions / historique */}
                                {dropdownVisible && (
                                    <ul className="absolute top-full left-0 w-full bg-white border border-gray-200 rounded-xl mt-1 z-20 shadow-lg max-h-64 overflow-y-auto">
                                        {showSuggestions && suggestions.length > 0
                                            ? suggestions.map((suggestion, index) => (
                                                <li key={`s-${index}`}>
                                                    <button
                                                        type="button"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => handleSuggestionClick(suggestion)}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-blue-50 flex items-center gap-2"
                                                    >
                                                        <FontAwesomeIcon icon={faMagnifyingGlass} className="text-gray-400 text-xs" />
                                                        <span className="truncate">{suggestion}</span>
                                                    </button>
                                                </li>
                                            ))
                                            : history.slice(0, HISTORY_MAX).map((term, index) => (
                                                <li key={`h-${index}`}>
                                                    <button
                                                        type="button"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => handleHistoryClick(term)}
                                                        title={term}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-blue-50 flex items-center justify-between gap-2"
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0">
                                                            <FontAwesomeIcon icon={faClockRotateLeft} className="text-gray-400 text-xs" />
                                                            <span className="truncate">{truncateLabel(term)}</span>
                                                        </span>
                                                        <span className="text-[11px] text-gray-500 flex-shrink-0">
                                                            {t('recherche.recherche_recente')}
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                    </ul>
                                )}
                            </div>
                            {["date", "journal"].includes(searchBy) && (
                                <p className="mt-1 text-xs text-gray-500">
                                    {t('recherche.recherche_avancee_aide')}
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="h-[52px] px-6 rounded-xl bg-blue-900 text-yellow-300 text-base font-semibold
                                hover:bg-blue-800 transition-colors flex items-center justify-center gap-2 flex-shrink-0
                                disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            <FontAwesomeIcon icon={faMagnifyingGlass} className={loading ? 'animate-pulse' : ''} />
                            {loading ? t('recherche.recherche_en_cours') : t('recherche.rechercher')}
                        </button>
                    </div>

                    {/* Critère « type » : type de document + complément de recherche */}
                    {searchBy === "type" && (
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="search-selected-type" className="block text-xs font-medium text-gray-600 mb-1">
                                    {t('recherche.filtre_type')}
                                </label>
                                <select
                                    id="search-selected-type"
                                    value={selectedType}
                                    onChange={(e) => setSelectedType(e.target.value)}
                                    className={selectBaseClass}
                                >
                                    {types.map((type) => (
                                        <option key={type.value} value={type.value}>
                                            {type.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="search-complement" className="block text-xs font-medium text-gray-600 mb-1">
                                    {t('recherche.complement')}
                                </label>
                                <input
                                    id="search-complement"
                                    type="text"
                                    value={searchValue}
                                    onChange={(e) => setSearchValue(e.target.value)}
                                    className={`${inputBaseClass} h-[42px] px-3`}
                                    placeholder={t('recherche.complement')}
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                    )}

                    {/* (2) Recherche avancée : période et Journal Officiel, repliée par défaut */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setAdvancedOpen((open) => !open)}
                            aria-expanded={advancedOpen}
                            aria-controls="search-advanced-panel"
                            className="inline-flex items-center gap-2 text-sm font-medium text-blue-900 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                        >
                            <FontAwesomeIcon icon={faSliders} />
                            {t('recherche.recherche_avancee')}
                            {activeAdvancedCount > 0 && (
                                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-900 text-yellow-300 text-xs">
                                    {activeAdvancedCount}
                                </span>
                            )}
                            <FontAwesomeIcon icon={faChevronDown} className={`text-xs transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {advancedOpen && (
                            <div
                                id="search-advanced-panel"
                                className="mt-3 grid sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200"
                            >
                                {/* Période de publication */}
                                <fieldset className="min-w-0">
                                    <legend className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
                                        <FontAwesomeIcon icon={faCalendarDays} className="text-blue-900" />
                                        {t('recherche.date')}
                                    </legend>
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1 min-w-0">
                                            <label htmlFor="search-date-debut" className="block text-xs text-gray-600 mb-1">
                                                {t('recherche.date_debut')}
                                            </label>
                                            <input
                                                id="search-date-debut"
                                                type="date"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                                className={`${inputBaseClass} h-[42px] px-3`}
                                            />
                                        </div>
                                        <span className="pb-2 text-sm text-gray-500" aria-hidden="true">→</span>
                                        <div className="flex-1 min-w-0">
                                            <label htmlFor="search-date-fin" className="block text-xs text-gray-600 mb-1">
                                                {t('recherche.date_fin')}
                                            </label>
                                            <input
                                                id="search-date-fin"
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                                className={`${inputBaseClass} h-[42px] px-3`}
                                            />
                                        </div>
                                    </div>
                                </fieldset>

                                {/* Journal Officiel */}
                                <fieldset className="min-w-0">
                                    <legend className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
                                        <FontAwesomeIcon icon={faNewspaper} className="text-blue-900" />
                                        {t('recherche.journal')}
                                    </legend>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="min-w-0">
                                            <label htmlFor="recherche-date-jo" className="block text-xs text-gray-600 mb-1">
                                                {t('recherche.date_jo')}
                                            </label>
                                            <input
                                                id="recherche-date-jo"
                                                type="date"
                                                value={journalDate}
                                                onChange={(e) => setJournalDate(e.target.value)}
                                                className={`${inputBaseClass} h-[42px] px-3`}
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <label htmlFor="recherche-numero-jo" className="block text-xs text-gray-600 mb-1">
                                                {t('recherche.numero_jo')}
                                            </label>
                                            <input
                                                id="recherche-numero-jo"
                                                type="text"
                                                value={journalNumero}
                                                onChange={(e) => setJournalNumero(e.target.value)}
                                                className={`${inputBaseClass} h-[42px] px-3`}
                                                placeholder={t('recherche.entrez_numero')}
                                            />
                                        </div>
                                    </div>
                                </fieldset>
                            </div>
                        )}
                    </div>

                    {/* (3) Filtres : une rangée étiquetée sur desktop, panneau repliable sur mobile */}
                    <div className="border-t border-gray-100 pt-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                <FontAwesomeIcon icon={faSliders} aria-hidden="true" />
                                {t('recherche.filtres')}
                                {activeFilterCount > 0 && (
                                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-900 text-yellow-300 text-[11px] normal-case">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </span>

                            <div className="flex items-center gap-3">
                                {activeFilterCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="inline-flex items-center gap-1 text-sm text-red-700 hover:underline"
                                    >
                                        <FontAwesomeIcon icon={faXmark} />
                                        {t('recherche.reinitialiser', { count: activeFilterCount })}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setMobileFiltersOpen((open) => !open)}
                                    aria-expanded={mobileFiltersOpen}
                                    aria-controls="search-mobile-filters"
                                    className="md:hidden inline-flex items-center gap-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5"
                                >
                                    <FontAwesomeIcon icon={faSliders} />
                                    {t('recherche.filtres', { count: activeFilterCount })}
                                </button>
                            </div>
                        </div>

                        {/* Desktop : rangée unique */}
                        <div className="search-filters hidden md:flex flex-wrap items-end gap-3">
                            {renderFilterControls('filters-desktop')}
                        </div>

                        {/* Mobile : panneau repliable */}
                        <div
                            id="search-mobile-filters"
                            className={`md:hidden space-y-3 ${mobileFiltersOpen ? 'block' : 'hidden'}`}
                        >
                            {renderFilterControls('filters-mobile')}
                        </div>
                    </div>

                    {/* Message d'erreur (saisie trop courte) */}
                    {error && (
                        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}
                </form>

                {/* Recherches récentes : masquées si vide */}
                {history.length > 0 && (
                    <div className="border-t border-gray-100 mt-4 pt-4 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                            {t('recherche.recherches_recentes')}
                        </span>
                        {history.slice(0, HISTORY_MAX).map((term, index) => (
                            <button
                                key={`recent-${index}`}
                                type="button"
                                onClick={() => handleHistoryClick(term)}
                                title={term}
                                className="max-w-[14rem] truncate px-3 py-1.5 rounded-full bg-gray-100 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-900"
                            >
                                {truncateLabel(term)}
                            </button>
                        ))}
                        {!estConnecte && (
                            <button
                                type="button"
                                onClick={() => {
                                    clearSearchHistory();
                                    setHistory([]);
                                }}
                                className="text-xs text-gray-600 hover:text-red-600 underline"
                            >
                                {t('recherche.effacer_historique')}
                            </button>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
};

export default SearchBar;
