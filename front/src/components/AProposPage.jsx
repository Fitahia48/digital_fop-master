import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookOpen } from '@fortawesome/free-solid-svg-icons';

/**
 * Page publique « À propos » (route /a-propos).
 *
 * Affiche uniquement le titre et une phrase de présentation issue des fichiers
 * de traduction (fr / en / mg avec repli automatique sur le français).
 */
const AProposPage = () => {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = t('apropos.page_titre');
  }, [t, i18n.language]);

  return (
    <div className="mt-36 flex min-h-[60vh] items-center justify-center bg-gray-50 px-4 py-12 sm:mt-44 sm:px-6">
      <article className="w-full max-w-[65ch] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md">
        <header className="flex items-center gap-4 border-b-4 border-yellow-400 bg-gradient-to-r from-[#0b2a49] to-[#0f3c63] px-6 py-6 text-white sm:px-8">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-yellow-400 ring-1 ring-inset ring-white/20"
          >
            <FontAwesomeIcon icon={faBookOpen} className="text-lg" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t('apropos.titre_page')}
          </h1>
        </header>

        <div className="px-6 py-8 sm:px-8 sm:py-10">
          <p className="text-base leading-relaxed text-gray-800 sm:text-lg">
            {t('apropos.description')}
          </p>
        </div>
      </article>
    </div>
  );
};

export default AProposPage;
