import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faWifi } from '@fortawesome/free-solid-svg-icons';

/**
 * Bandeau « mode hors-ligne » (F10 — PWA).
 * Affiché uniquement quand le navigateur signale une perte de connexion, via
 * navigator.onLine + les événements online/offline. Le texte est traduit et
 * prévient que les données affichées peuvent être obsolètes.
 */
const OfflineBanner = () => {
  const { t } = useTranslation();
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-100 border-b border-amber-300 text-amber-900 text-sm px-4 py-2 flex items-center justify-center gap-2"
    >
      <FontAwesomeIcon icon={faTriangleExclamation} />
      <span>
        <strong className="mr-1">{t('offline.mode')}</strong>
        {t('offline.bandeau')}
      </span>
    </div>
  );
};

export default OfflineBanner;
