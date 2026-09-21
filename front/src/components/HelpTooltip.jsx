import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";

/**
 * Icône « ? » d'aide contextuelle, accessible (title + aria-label) et visible
 * au survol comme au clic. À placer à côté des champs de formulaire ambigus.
 */
const HelpTooltip = ({ text, className = "" }) => {
  const [open, setOpen] = useState(false);

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        title={text}
        aria-label={`Aide : ${text}`}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="text-blue-700 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-full leading-none align-middle"
      >
        <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-30 w-56 px-3 py-2 text-xs font-normal text-white bg-gray-900 rounded-md shadow-lg text-left"
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
};

export default HelpTooltip;
