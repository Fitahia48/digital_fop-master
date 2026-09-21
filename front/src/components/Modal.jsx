import React from "react";

const Modal = ({ onClose, children, panelClassName = "" }) => {
  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div
        className={`bg-white rounded-lg shadow-lg w-full md:w-1/3 max-h-[85vh] overflow-y-auto p-6 relative ${panelClassName}`}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-2 right-2 text-2xl leading-none text-gray-500 hover:text-gray-700"
        >
          &times;
        </button>
        {children}
      </div>
    </div>
  );
};

export default Modal;
