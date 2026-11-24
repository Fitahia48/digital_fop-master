import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Oval } from 'react-loader-spinner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faBookOpen,
  faBullseye,
  faCircleQuestion,
  faEnvelope,
  faFileLines,
  faFingerprint,
  faLandmark,
  faLocationDot,
  faMagnifyingGlass,
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
 * Aucune image : uniquement du texte et des icônes FontAwesome.
 * La colonne latérale n'est rendue que si elle a du contenu (cadre légal,
 * contacts ou liens utiles) : sinon la page reste centrée, sans vide.
 */

const LOCALE_PAR_DEFAUT = 'fr';

/**
 * Mise en forme du HTML éditorial (issu du CMS) sans plugin typographique :
 * paragraphes, listes, liens et emphases héritent d'un rythme de lecture sobre.
 */
const PROSE =
  'text-[15px] leading-7 text-gray-700 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_em]:italic [&_a]:font-medium [&_a]:text-blue-800 [&_a]:underline [&_a]:underline-offset-2 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1';

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

/** Classes de la pastille d'icône des en-têtes de section. */
const ICONE_SECTION =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-100';

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
      <div className="mt-44 flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-gray-50 text-gray-600">
        <Oval height={36} width={36} color="#1e3a8a" secondaryColor="#93c5fd" strokeWidth={4} />
        <p className="text-sm">{t('apropos.chargement')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-44 min-h-[60vh] bg-gray-50 pb-16">
        <div className="mx-auto max-w-3xl px-4">
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700"
          >
            {t('apropos.erreur')}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-44 min-h-[60vh] bg-gray-50 pb-16">
        <div className="mx-auto max-w-3xl px-4">
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500 shadow-sm">
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
  const aSidebar = Boolean(docLegal || aContact || liensUtiles.length > 0);

  return (
    <div className="mt-44 min-h-screen bg-gray-50 pb-16">
      <div className="mx-auto max-w-6xl px-4">
        {/* ─── En-tête institutionnel ───────────────────────────────────── */}
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2a49] via-[#0f3c63] to-teal-700 px-6 py-10 text-white shadow-lg sm:px-10 sm:py-12">
          {/* Décor discret : anneaux purement visuels */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 right-10 h-56 w-56 rounded-full border border-white/10"
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl ring-1 ring-inset ring-white/20"
            >
              <FontAwesomeIcon icon={faLandmark} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-100">
                {t('menu.bibliotheque')}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {data.titre || t('apropos.titre_page')}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-blue-100">
                {t('apropos.sous_titre')}
              </p>
            </div>
          </div>
        </header>

        {/* ─── Contenu : la colonne latérale n'existe que si elle est remplie ── */}
        <div className={`mt-8 grid grid-cols-1 gap-6 ${aSidebar ? 'lg:grid-cols-3' : ''}`}>
          <div className={`space-y-6 ${aSidebar ? 'lg:col-span-2' : 'mx-auto w-full max-w-3xl'}`}>
            {data.mission && (
              <section
                aria-labelledby="apropos-mission"
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
              >
                <div className="mb-5 flex items-center gap-3">
                  <span aria-hidden="true" className={ICONE_SECTION}>
                    <FontAwesomeIcon icon={faBullseye} />
                  </span>
                  <div>
                    <h2 id="apropos-mission" className="text-lg font-semibold text-gray-900">
                      {t('apropos.mission')}
                    </h2>
                    <p className="text-xs text-gray-500">{t('apropos.article2_source')}</p>
                  </div>
                </div>
                <blockquote className="rounded-r-lg border-l-4 border-teal-600 bg-gray-50 py-4 pl-5 pr-4">
                  <div
                    className={PROSE}
                    // HTML éditorial saisi dans le CMS (contenu de confiance, pas d'entrée usager)
                    dangerouslySetInnerHTML={{ __html: data.mission }}
                  />
                </blockquote>
              </section>
            )}

            {data.presentation_application && (
              <section
                aria-labelledby="apropos-presentation"
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
              >
                <div className="mb-5 flex items-center gap-3">
                  <span aria-hidden="true" className={ICONE_SECTION}>
                    <FontAwesomeIcon icon={faBookOpen} />
                  </span>
                  <h2 id="apropos-presentation" className="text-lg font-semibold text-gray-900">
                    {t('apropos.presentation')}
                  </h2>
                </div>
                <div
                  className={PROSE}
                  dangerouslySetInnerHTML={{ __html: data.presentation_application }}
                />
              </section>
            )}

            {/* Confidentialité du comptage des visites (Étape 7) : texte court
                fr/en/mg — le libellé malgache reste « à valider » (convention
                du projet, voir IMPLEMENTATION.md §5). */}
            <section
              aria-labelledby="apropos-anonymat"
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <span aria-hidden="true" className={ICONE_SECTION}>
                  <FontAwesomeIcon icon={faFingerprint} />
                </span>
                <h2 id="apropos-anonymat" className="text-lg font-semibold text-gray-900">
                  {t('apropos.anonymat_titre')}
                </h2>
              </div>
              <p className="text-[15px] leading-7 text-gray-700">{t('apropos.anonymat_visites')}</p>
            </section>
          </div>

          {/* Colonne latérale : uniquement si au moins un bloc a du contenu */}
          {aSidebar && (
            <aside className="space-y-6 lg:sticky lg:top-44 lg:self-start">
              {docLegal && (
                <section
                  aria-labelledby="apropos-cadre-legal"
                  className="rounded-xl border border-blue-200 bg-blue-50 p-6"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <FontAwesomeIcon icon={faScaleBalanced} className="text-lg text-blue-900" aria-hidden="true" />
                    <h2 id="apropos-cadre-legal" className="text-base font-semibold text-blue-900">
                      {t('apropos.document_legal')}
                    </h2>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-white p-4">
                    {docLegalReference && (
                      <p className="mb-1 text-sm font-semibold text-gray-900">{docLegalReference}</p>
                    )}
                    {docLegal.objet && <p className="mb-4 text-sm text-gray-600">{docLegal.objet}</p>}
                    {docLegalVisible && docLegalId ? (
                      <Link
                        to={`/documents/${docLegalId}`}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      >
                        <FontAwesomeIcon icon={faFileLines} aria-hidden="true" />
                        {t('apropos.consulter_texte')}
                      </Link>
                    ) : (
                      <p className="mt-2 text-xs text-blue-700/70">{t('apropos.document_en_attente')}</p>
                    )}
                  </div>
                </section>
              )}

              {aContact && (
                <section
                  aria-labelledby="apropos-contacts"
                  className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <FontAwesomeIcon icon={faPhone} className="text-lg text-blue-900" aria-hidden="true" />
                    <h2 id="apropos-contacts" className="text-base font-semibold text-gray-900">
                      {t('apropos.contacts')}
                    </h2>
                  </div>
                  <ul className="space-y-3 text-sm text-gray-600">
                    {data.contact_adresse && (
                      <li className="flex items-start gap-3">
                        <FontAwesomeIcon
                          icon={faLocationDot}
                          className="mt-1 shrink-0 text-gray-400"
                          aria-hidden="true"
                        />
                        <span className="leading-relaxed">{data.contact_adresse}</span>
                      </li>
                    )}
                    {data.contact_telephone && (
                      <li className="flex items-center gap-3">
                        <FontAwesomeIcon icon={faPhone} className="shrink-0 text-gray-400" aria-hidden="true" />
                        <a
                          href={`tel:${String(data.contact_telephone).replace(/\s/g, '')}`}
                          className="hover:text-blue-800 hover:underline"
                        >
                          {data.contact_telephone}
                        </a>
                      </li>
                    )}
                    {data.contact_email && (
                      <li className="flex items-center gap-3">
                        <FontAwesomeIcon icon={faEnvelope} className="shrink-0 text-gray-400" aria-hidden="true" />
                        <a href={`mailto:${data.contact_email}`} className="break-all text-blue-800 hover:underline">
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
                  className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <FontAwesomeIcon
                      icon={faUpRightFromSquare}
                      className="text-lg text-blue-900"
                      aria-hidden="true"
                    />
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
                          className="inline-flex items-start gap-2 text-sm font-medium text-blue-800 hover:text-blue-900 hover:underline"
                        >
                          <FontAwesomeIcon
                            icon={faUpRightFromSquare}
                            className="mt-1 text-xs opacity-60"
                            aria-hidden="true"
                          />
                          {lien.libelle}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          )}
        </div>

        {/* ─── Aller plus loin ─────────────────────────────────────────── */}
        <section
          aria-labelledby="apropos-explorer"
          className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 id="apropos-explorer" className="text-lg font-semibold text-gray-900">
                {t('apropos.cta_titre')}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-600">
                {t('apropos.cta_texte')}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/AfficherDoc"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
                {t('menu.recherche')}
              </Link>
              <Link
                to="/aide"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <FontAwesomeIcon icon={faCircleQuestion} aria-hidden="true" />
                {t('footer.aide_faq')}
                <FontAwesomeIcon icon={faArrowRight} className="text-xs opacity-60" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AProposPage;
