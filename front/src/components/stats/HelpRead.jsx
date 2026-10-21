/**
 * Bloc repliable « Comment lire cette page ? » (2 ou 3 phrases en langage
 * simple), présent sur chaque écran de statistiques. Accessible :
 * <details>/<summary> natifs, focus visible, jamais de jargon.
 */
import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons';

const HelpRead = ({ titre, children }) => (
  <details className="bg-blue-50/70 border border-blue-100 rounded-xl px-4 py-3 mb-5">
    <summary className="cursor-pointer select-none text-sm font-semibold text-blue-900 flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1">
      <FontAwesomeIcon icon={faCircleQuestion} className="text-blue-700" aria-hidden="true" />
      {titre}
    </summary>
    <div className="text-sm text-gray-700 leading-relaxed mt-2 space-y-1">{children}</div>
  </details>
);

export default HelpRead;
