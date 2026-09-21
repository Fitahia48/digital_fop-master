import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import LanguageSwitcher from './LanguageSwitcher';
import logo from "../assets/logo-madagascar.webp";
import MTEFOP from "../assets/MTEFOP.png";
import DEAJ from "../assets/DEAJ.png";

const FONT_SCALE_KEY = 'accessibilite_taille_police';
// Niveaux de taille de police racine (rem) : normal, grand, très grand
const FONT_SCALES = ['100%', '112.5%', '125%'];

const getInitialScale = () => {
  try {
    const saved = localStorage.getItem(FONT_SCALE_KEY);
    const index = FONT_SCALES.indexOf(saved);
    if (index >= 0) return index;
  } catch {
    // localStorage indisponible : taille par défaut
  }
  return 0;
};

function Header() {
  const [scaleIndex, setScaleIndex] = useState(getInitialScale);
  const { t } = useTranslation();

  // Applique la taille au niveau racine (<html>) : tous les textes rem de Tailwind suivent
  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SCALES[scaleIndex];
    try {
      localStorage.setItem(FONT_SCALE_KEY, FONT_SCALES[scaleIndex]);
    } catch {
      // ignore
    }
    return () => {
      // Nettoyage si le composant est démonté (évite un style résiduel)
      document.documentElement.style.fontSize = '';
    };
  }, [scaleIndex]);

  const agrandir = () => setScaleIndex((i) => Math.min(i + 1, FONT_SCALES.length - 1));
  const reduire = () => setScaleIndex((i) => Math.max(i - 1, 0));

  return (
    <>
      {/* Lien d'évitement : premier élément focusable de la page, visible au focus clavier */}
      <a
        href="#contenu-principal"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:bg-blue-900 focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg"
      >
        {t('header.skip_link')}
      </a>

      <div className='w-full fixed top-0 bg-white text-neutralDGrey flex justify-between shadow-xl z-50'>
        <h1 className='flex items-center'>
            <img src={MTEFOP} alt='Logo du Ministère du Travail, de l’Emploi et de la Fonction Publique' className='w-16 md:w-20 lg:w-24 ml-2'/>
        </h1>
        <h1 className='flex items-center'>
            <img src={logo} alt='Emblème de la République de Madagascar' className='w-16 md:w-20 lg:w-24'/>
        </h1>
        <div className='flex items-center gap-3 mr-2'>
            {/* Choix de la langue (FR / EN / MG) */}
            <LanguageSwitcher />

            {/* Taille du texte (accessibilité) */}
            <div className='flex items-center gap-1' role="group" aria-label={t('header.taille_texte')}>
                <button
                    type="button"
                    onClick={reduire}
                    disabled={scaleIndex === 0}
                    aria-label={t('header.reduire')}
                    title={t('header.reduire')}
                    className='w-9 h-8 flex items-center justify-center rounded-md border border-gray-300 text-sm font-bold text-gray-700 hover:bg-blue-50 disabled:opacity-40'
                >
                    A-
                </button>
                <button
                    type="button"
                    onClick={agrandir}
                    disabled={scaleIndex === FONT_SCALES.length - 1}
                    aria-label={t('header.agrandir')}
                    title={t('header.agrandir')}
                    className='w-9 h-8 flex items-center justify-center rounded-md border border-gray-300 text-sm font-bold text-gray-700 hover:bg-blue-50 disabled:opacity-40'
                >
                    A+
                </button>
            </div>
            <a
                href="https://www.mtefpls.gov.mg"
                target="_blank"
                rel="noopener noreferrer"
                className='hidden sm:flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline transition duration-200'
            >
                {t('header.visiter_site')}
                <FontAwesomeIcon icon={faExternalLinkAlt} className='text-xs' />
            </a>
            <h1 className='flex items-center'>
                <img src={DEAJ} alt='Logo de la Direction des Études et des Affaires Juridiques' className='w-16 md:w-20 lg:w-24 mr-2'/>
            </h1>
        </div>
        {/* Uncomment if you want to add the phone section */}
        {/* <div className='gap-x-4 flex mt-2 mr-4'>
            <div className='shrink-0'>
                <img src={phone} alt='phone icon' className='w-6 md:w-8 lg:w-10'/>
            </div>
            <div>
                <h3> Tel : (+261)20 22 650 10</h3>
            </div>
        </div> */}
    </div>
    </>
  );
}

export default Header;
