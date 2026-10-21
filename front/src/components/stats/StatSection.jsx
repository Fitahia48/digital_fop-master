/**
 * Section de statistiques : carte blanche homogène (coins arrondis, ombre
 * légère) avec titre, phrase d'aide d'une ligne et un emplacement d'action
 * (ex. sélecteur de période). Utilisée par tous les écrans de statistiques.
 */
import React from 'react';

const StatSection = ({ titre, aide, id, action, children, className = '' }) => {
  const titreId = id ? `${id}-titre` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={titreId}
      className={`bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-6 ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 id={titreId} className="text-lg font-semibold text-gray-900">
            {titre}
          </h2>
          {aide && <p className="text-sm text-gray-600 mt-1">{aide}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
};

export default StatSection;
