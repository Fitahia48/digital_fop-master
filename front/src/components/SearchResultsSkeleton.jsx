import React from "react";

/**
 * Skeleton de chargement des résultats de recherche.
 * Remplace le spinner générique : la structure des résultats est déjà visible.
 */
const SearchResultsSkeleton = ({ rows = 5 }) => {
    return (
        <div className="w-full max-w-6xl animate-pulse" role="status" aria-label="Chargement des résultats">
            <div className="mb-3 h-5 w-48 rounded bg-gray-300" />

            <div className="overflow-hidden rounded-lg bg-white shadow-md">
                <div className="flex gap-4 bg-blue-900/80 px-4 py-3">
                    {[80, 80, 240, 80, 120].map((width, index) => (
                        <div key={index} className="h-4 rounded bg-blue-700" style={{ width }} />
                    ))}
                </div>

                {Array.from({ length: rows }).map((_, index) => (
                    <div
                        key={index}
                        className="flex items-center gap-4 border-b border-gray-100 px-4 py-4 last:border-b-0"
                    >
                        <div className="h-3 w-20 rounded bg-gray-200" />
                        <div className="h-3 w-24 rounded bg-gray-200" />
                        <div className="h-3 flex-1 rounded bg-gray-200" />
                        <div className="h-5 w-24 rounded-full bg-gray-200" />
                        <div className="h-3 w-20 rounded bg-gray-200" />
                    </div>
                ))}
            </div>

            <div className="mt-3 text-center text-sm text-gray-400">Recherche en cours…</div>
        </div>
    );
};

export default SearchResultsSkeleton;
