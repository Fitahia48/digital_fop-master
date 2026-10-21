import React from "react";
import { useTranslation } from "react-i18next";

/**
 * Skeleton de chargement des résultats de recherche.
 * Reprend la forme du nouveau rendu : carte blanche arrondie, lignes avec
 * pastille de statut, titre sur deux lignes et boutons d'action.
 */
const SearchResultsSkeleton = ({ rows = 5 }) => {
    const { t } = useTranslation();

    return (
        <div
            className="w-full animate-pulse"
            role="status"
            aria-label={t('recherche.chargement_resultats')}
        >
            {Array.from({ length: rows }).map((_, index) => (
                <div
                    key={index}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0"
                >
                    {/* Métadonnées : date + type */}
                    <div className="flex sm:flex-col gap-2 sm:w-40 flex-shrink-0">
                        <div className="h-3 w-24 rounded bg-gray-200" />
                        <div className="h-3 w-20 rounded bg-gray-200" />
                    </div>

                    {/* Titre (objet) */}
                    <div className="flex-1 min-w-0 space-y-2">
                        <div className="h-3.5 w-3/4 rounded bg-gray-200" />
                        <div className="h-3.5 w-1/2 rounded bg-gray-200" />
                    </div>

                    {/* Statut */}
                    <div className="h-6 w-24 rounded-full bg-gray-200 flex-shrink-0" />

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="h-8 w-24 rounded-lg bg-gray-200" />
                        <div className="h-8 w-20 rounded-lg bg-gray-200" />
                    </div>
                </div>
            ))}

            <span className="sr-only">{t('recherche.chargement_resultats')}</span>
        </div>
    );
};

export default SearchResultsSkeleton;
