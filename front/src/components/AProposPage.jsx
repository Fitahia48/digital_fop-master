import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Oval } from 'react-loader-spinner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen,
  faBullseye,
  faEnvelope,
  faFileLines,
  faLandmark,
  faLocationDot,
  faPhone,
  faScaleBalanced,
  faUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import axiosInstance from './AxiosConfig';

/**
 * Page institutionnelle publique « À propos » (route /a-propos).
 *
 * Contenu éditorial : Single Type Strapi `api::a-propos.a-propos`, localisé
 * fr/en/mg (plugin i18n — même convention que la FAQ, locale par défaut fr).
 *
 * Strapi 5 renvoie les champs à plat (`res.data.data.titre`, plus
 * d'`.attributes`) et les relations directement peuplées : le parsing ci-dessous
 * suit ce format. Si la locale courante n'est pas encore traduite, la page
 * retombe sur le contenu français champ par champ (le ministère complète les
 * traductions dans le panneau d'administration, sans redéploiement).
 *
 * Aucune image : la page n'affiche que du texte et des icônes FontAwesome.
 */

const LOCALE_PAR_DEFAUT = 'fr';

/** Vrai pour une valeur absente, une chaîne vide ou un tableau vide. */
const estVide = (valeur) =>
  valeur === null ||
  valeur === undefined ||
  (typeof valeur === 'string' && valeur.trim() === '') ||
  (Array.isArray(valeur) && valeur.length === 0);

/** Ne conserve que les champs renseignés d'une variante localisée. */
const sansChampsVides = (objet) =>
  Object.fromEntries(Object.entries(objet || {}).filter(([, valeur]) => !estVide(valeur)));

/** GET /api/a-propos — renvoie l'objet du Single Type (ou null). */
const chargerContenu = async (locale) => {
  const res = await axiosInstance.get('/api/a-propos', {
    params: { locale, populate: '*' },
  });
  const donnees = res.data?.data ?? res.data;
  return donnees && typeof donnees === 'object' ? donnees : null;
};

const AProposPage = () => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // « fr-FR » → « fr » (le plugin i18n n'accepte que les codes courts).
  const langue = (i18n.language || LOCALE_PAR_DEFAUT).split('-')[0];

  // Titre de l'onglet (accessibilité / lecteurs d'écran)
  useEffect(() => {
    document.title = t('apropos.page_titre', {
      defaultValue: 'À propos — Bibliothèque numérique',
    });
  }, [t]);

  useEffect(() => {
    let actif = true;
    setLoading(true);
    setError(false);

    const charger = async (locale) => {
      try {
        return await chargerContenu(locale);
      } catch (err) {
        // Locale pas encore activée côté i18n (400) : repli silencieux sur le fr.
        if (locale !== LOCALE_PAR_DEFAUT) return null;
        throw err;
      }
    };

    (async () => {
      try {
        const [fr, localise] = await Promise.all([
          charger(LOCALE_PAR_DEFAUT),
          langue === LOCALE_PAR_DEFAUT ? Promise.resolve(null) : charger(langue),
        ]);
        if (!actif) return;
        const fusion = { ...(fr || {}), ...sansChampsVides(localise) };
        setData(Object.keys(fusion).length > 0 ? fusion : null);
      } catch (err) {
        console.error('Erreur chargement page À propos :', err);
        if (actif) setError(true);
      } finally {
        if (actif) setLoading(false);
      }
    })();

    return () => {
      actif = false;
    };
  }, [langue]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 mt-40 pb-16 flex flex-col items-center gap-3 text-gray-600">
        <Oval height={36} width={36} color="#1e3a8a" secondaryColor="#93c5fd" strokeWidth={4} />
        <p className="text-sm">{t('apropos.chargement')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 mt-40 pb-16">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-6 text-center text-sm">
            {t('apropos.erreur')}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 mt-40 pb-16">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            {t('apropos.aucune_donnee')}
          </div>
        </div>
      </div>
    );
  }

  // Document légal : la relation peut exister sans être encore publique
  // (notices migrées en « brouillon ») → référence affichée, lien seulement
  // si la notice est validée (sinon /documents/:id répond 404 au public).
  const docLegal = data.document_legal;
  const docLegalId = docLegal?.documentId || docLegal?.id;
  const docLegalVisible = docLegal?.etat_notice === 'validee';
  const docLegalReference = [docLegal?.type, docLegal?.numero ? `n° ${docLegal.numero}` : null]
    .filter(Boolean)
    .join(' ');

  const aContact = Boolean(data.contact_email || data.contact_telephone || data.contact_adresse);
  const liensUtiles = Array.isArray(data.liens_utiles)
    ? data.liens_utiles.filter((lien) => lien && !estVide(lien.libelle) && !estVide(lien.url))
    : [];

  return (
    <div className="min-h-screen bg-gray-50 mt-40 pb-16">
      <div className="max-w-5xl mx-auto px-4">
        {/* En-tête institutionnel */}
        <header className="text-center pb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-900 text-white mb-4 shadow-sm" aria-hidden="true">
            <FontAwesomeIcon icon={faLandmark} className="text-xl" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{data.titre || t('apropos.titre_page')}</h1>
          <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">
            {t('apropos.page_titre').replace('À propos — ', '')}
          </p>
          <div className="mt-5 max-w-xs mx-auto overflow-hidden rounded-full">
            <div className="h-1 bg-gradient-to-r from-blue-900 via-blue-700 to-blue-500" aria-hidden="true" />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Colonne principale : mission + présentation */}
          <div className="lg:col-span-2 space-y-6">
            {data.mission && (
              <section
                aria-labelledby="apropos-mission"
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sm:p-7"
              >
                <h2
                  id="apropos-mission"
                  className="text-xl font-semibold text-gray-900 mb-5 flex items-center gap-3"
                >
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-900 text-white text-sm" aria-hidden="true">
                    <FontAwesomeIcon icon={faBullseye} />
                  </span>
                  {t('apropos.mission')}
                </h2>
                <blockquote className="border-l-4 border-blue-900 bg-blue-50/70 rounded-r-lg p-4">
                  <div
                    className="text-gray-700 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: data.mission }}
                  />
                  <footer className="mt-3 text-xs text-blue-800 font-medium">
                    {t('apropos.article2_source')}
                  </footer>
                </blockquote>
              </section>
            )}

            {data.presentation_application && (
              <section
                aria-labelledby="apropos-presentation"
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sm:p-7"
              >
                <h2
                  id="apropos-presentation"
                  className="text-xl font-semibold text-gray-900 mb-5 flex items-center gap-3"
                >
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-900 text-white text-sm" aria-hidden="true">
                    <FontAwesomeIcon icon={faBookOpen} />
                  </span>
                  {t('apropos.presentation')}
                </h2>
                <div
                  className="text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: data.presentation_application }}
                />
              </section>
            )}
          </div>

          {/* Colonne latérale : cadre légal, contacts, liens utiles */}
          <aside className="space-y-6">
            {docLegal && (
              <section
                aria-labelledby="apropos-cadre-legal"
                className="rounded-lg border border-blue-200 bg-blue-50 p-6"
              >
                <div className="flex items-center gap-2 mb-4">
                  <FontAwesomeIcon icon={faScaleBalanced} className="text-blue-900 text-lg" aria-hidden="true" />
                  <h2 id="apropos-cadre-legal" className="text-base font-semibold text-blue-900">
                    {t('apropos.document_legal')}
                  </h2>
                </div>
                <div className="bg-white rounded-lg p-4 border border-blue-100">
                  {docLegalReference && (
                    <p className="font-medium text-gray-900 text-sm mb-1">{docLegalReference}</p>
                  )}
                  {docLegal.objet && (
                    <p className="text-sm text-gray-600 mb-4">{docLegal.objet}</p>
                  )}
                  {docLegalVisible && docLegalId ? (
                    <Link
                      to={`/documents/${docLegalId}`}
                      className="inline-flex items-center gap-2 text-sm font-medium bg-blue-900 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
                    >
                      <FontAwesomeIcon icon={faFileLines} aria-hidden="true" />
                      {t('apropos.consulter_texte')}
                    </Link>
                  ) : (
                    <p className="text-xs text-blue-700/70 mt-2">{t('apropos.document_en_attente')}</p>
                  )}
                </div>
              </section>
            )}

            {aContact && (
              <section
                aria-labelledby="apropos-contacts"
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-6"
              >
                <div className="flex items-center gap-2 mb-4">
                  <FontAwesomeIcon icon={faPhone} className="text-blue-900 text-lg" aria-hidden="true" />
                  <h2 id="apropos-contacts" className="text-base font-semibold text-gray-900">
                    {t('apropos.contacts')}
                  </h2>
                </div>
                <ul className="space-y-3 text-gray-600 text-sm">
                  {data.contact_adresse && (
                    <li className="flex items-start gap-3">
                      <FontAwesomeIcon
                        icon={faLocationDot}
                        className="mt-0.5 text-gray-400 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="leading-relaxed">{data.contact_adresse}</span>
                    </li>
                  )}
                  {data.contact_telephone && (
                    <li className="flex items-center gap-3">
                      <FontAwesomeIcon icon={faPhone} className="text-gray-400 shrink-0" aria-hidden="true" />
                      <a
                        href={`tel:${String(data.contact_telephone).replace(/\s/g, '')}`}
                        className="hover:text-blue-700 hover:underline"
                      >
                        {data.contact_telephone}
                      </a>
                    </li>
                  )}
                  {data.contact_email && (
                    <li className="flex items-center gap-3">
                      <FontAwesomeIcon icon={faEnvelope} className="text-gray-400 shrink-0" aria-hidden="true" />
                      <a
                        href={`mailto:${data.contact_email}`}
                        className="text-blue-700 hover:underline"
                      >
                        {data.contact_email}
                      </a>
                    </li>
                  )}
                </ul>
              </section>
            )}

            {liensUtiles.length > 0 && (
              <section
                aria-labelledby="apropos-liens-utiles"
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-6"
              >
                <div className="flex items-center gap-2 mb-4">
                  <FontAwesomeIcon icon={faUpRightFromSquare} className="text-blue-900 text-lg" aria-hidden="true" />
                  <h2 id="apropos-liens-utiles" className="text-base font-semibold text-gray-900">
                    {t('apropos.liens_utiles')}
                  </h2>
                </div>
                <ul className="space-y-2">
                  {liensUtiles.map((lien, index) => (
                    <li key={`${lien.url}-${index}`}>
                      <a
                        href={lien.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-blue-700 hover:text-blue-900 hover:underline text-sm"
                      >
                        <FontAwesomeIcon
                          icon={faUpRightFromSquare}
                          className="text-xs opacity-50"
                          aria-hidden="true"
                        />
                        {lien.libelle}
                        <span className="text-xs text-gray-400 ml-1" aria-hidden="true">↗</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default AProposPage;
