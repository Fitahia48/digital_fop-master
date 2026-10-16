import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Oval } from "react-loader-spinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import axiosInstance from "./AxiosConfig";
import { resolveFileUrl } from "./Utils";

/**
 * Lecteur PDF intégré (modale de lecture, fiche document).
 *
 * ⚠️ Pourquoi un blob et pas directement l'URL du fichier ?
 * Strapi sert les médias avec `X-Frame-Options: SAMEORIGIN` et
 * `Content-Security-Policy: frame-ancestors 'self'`. Le front (Vite, :5173) et
 * le backend (:1337) étant deux origines distinctes, le navigateur refusait
 * d'afficher le PDF dans une iframe pointant sur l'URL du fichier → cadre
 * entièrement blanc. On récupère donc le fichier via l'API (Bearer + CORS,
 * donc aussi valable si le média devient protégé) puis on l'affiche avec une
 * URL `blob:` créée par la page elle-même : même origine, aucune restriction
 * d'encadrement.
 *
 * Le lien « Ouvrir dans un nouvel onglet » pointe, lui, sur l'URL directe :
 * la navigation plein écran n'est pas concernée par X-Frame-Options et reste
 * le repli si le lecteur PDF du navigateur ne s'affiche pas (mobile).
 */
const PdfViewer = ({ fileUrl, title, className = "" }) => {
  const { t } = useTranslation();
  const [blobUrl, setBlobUrl] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [reloadKey, setReloadKey] = useState(0);
  const directUrl = resolveFileUrl(fileUrl);

  useEffect(() => {
    if (!directUrl) {
      setStatus("error");
      return undefined;
    }

    let objectUrl = null;
    let cancelled = false;
    setStatus("loading");
    setBlobUrl(null);

    (async () => {
      try {
        const response = await axiosInstance.get(directUrl, { responseType: "blob" });
        if (cancelled) return;
        const blob =
          response.data instanceof Blob
            ? response.data
            : new Blob([response.data], { type: "application/pdf" });
        objectUrl = window.URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setStatus("ready");
      } catch (error) {
        console.error("Impossible de charger le document :", error);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [directUrl, reloadKey]);

  const openInNewTab = directUrl && (
    <a
      href={directUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-blue-800 hover:underline"
    >
      <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
      {t('documents.ouvrir_nouvel_onglet')}
    </a>
  );

  return (
    <div className={`flex h-full w-full flex-col ${className}`}>
      {status === "loading" && (
        <div className="flex flex-1 items-center justify-center bg-gray-50">
          <Oval
            visible={true}
            height="50"
            width="50"
            color="#4f94a9"
            ariaLabel={t('documents.chargement_pdf')}
            wrapperStyle={{}}
            wrapperClass=""
          />
        </div>
      )}

      {status === "ready" && blobUrl && (
        <iframe
          src={blobUrl}
          title={title || t('documents.visionneuse_pdf')}
          className="w-full flex-1 rounded border-0 bg-white"
        />
      )}

      {status === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center">
          <FontAwesomeIcon icon={faTriangleExclamation} className="text-2xl text-amber-500" />
          <p className="text-sm text-gray-700">{t('documents.lecture_impossible')}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded bg-blue-900 px-3 py-1.5 text-sm text-white transition hover:bg-blue-600"
            >
              {t('documents.reessayer')}
            </button>
            {openInNewTab}
          </div>
        </div>
      )}

      {status === "ready" && directUrl && (
        <p className="pt-2 text-right">{openInNewTab}</p>
      )}
    </div>
  );
};

export default PdfViewer;
