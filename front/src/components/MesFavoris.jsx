import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import axiosInstance from './AxiosConfig';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar as faStarSolid, faDownload, faEye } from '@fortawesome/free-solid-svg-icons';
import { resolveFileUrl } from './Utils';

const STATUS_STYLES = {
  en_vigueur: 'bg-emerald-100 text-emerald-800',
  'En vigueur': 'bg-emerald-100 text-emerald-800',
  'abrogé': 'bg-red-100 text-red-800',
  'Abrogé': 'bg-red-100 text-red-800',
  'modifié': 'bg-amber-100 text-amber-800',
  'Modifié': 'bg-amber-100 text-amber-800',
};

/**
 * Page « Mes favoris » — documents sauvegardés par l'usager connecté.
 * Format tableau, cohérent avec AfficherDocs.jsx.
 */
const MesFavoris = () => {
  const { t, i18n } = useTranslation();
  const [favoris, setFavoris] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFavoris = () => {
    setLoading(true);
    axiosInstance
      .get('/api/favoris/')
      .then((res) => setFavoris(res.data.results || []))
      .catch((err) => {
        console.error('Erreur lors du chargement des favoris :', err);
        toast.error(t('favoris.chargement_erreur'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadFavoris();
  }, []);

  const removeFavori = async (documentId) => {
    try {
      await axiosInstance.delete(`/api/favoris/${documentId}/`);
      toast.success(t('favoris.retire_ok'));
      loadFavoris();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(detail || t('favoris.retirer_erreur'));
    }
  };

  const handleView = (fileUrl) => window.open(resolveFileUrl(fileUrl), '_blank');

  const handleDownload = (fileUrl, fileName) => {
    const url = resolveFileUrl(fileUrl);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 mt-40 pb-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FontAwesomeIcon icon={faStarSolid} className="text-yellow-500" />
          {t('favoris.titre')}
        </h1>
        <p className="text-sm text-gray-600">
          {t('favoris.intro')}
        </p>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-10">{t('favoris.chargement')}</p>
      ) : favoris.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600">
            {t('favoris.aucun')} <FontAwesomeIcon icon={faStarSolid} className="text-yellow-500" />
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white shadow-md rounded-lg">
          <table className="table-auto w-full text-left border-collapse">
            <caption className="sr-only">{t('favoris.caption')}</caption>
            <thead className="bg-blue-900 text-yellow-300">
              <tr>
                <th className="py-3 px-2 sm:px-4">{t('favoris.colonne_date')}</th>
                <th className="py-3 px-2 sm:px-4">{t('favoris.colonne_type')}</th>
                <th className="py-3 px-2 sm:px-4">{t('favoris.colonne_objet')}</th>
                <th className="py-3 px-2 sm:px-4">{t('favoris.colonne_statut')}</th>
                <th className="py-3 px-2 sm:px-4">{t('favoris.colonne_actions')}</th>
              </tr>
            </thead>
            <tbody className="text-gray-900">
              {favoris.map((doc) => (
                <tr key={doc.favori_id} className="border-b border-gray-200 hover:bg-gray-100">
                  <td className="py-3 px-2 sm:px-4">
                    {doc.date ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(doc.date)) : '—'}
                  </td>
                  <td className="py-3 px-2 sm:px-4">{doc.type}</td>
                  <td className="py-3 px-2 sm:px-4">
                    <span className="max-w-xs md:max-w-md truncate block" title={doc.objet}>{doc.objet}</span>
                  </td>
                  <td className="py-3 px-2 sm:px-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${STATUS_STYLES[doc.status] || 'bg-gray-100 text-gray-800'}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="py-3 px-2 sm:px-4">
                    <div className="flex space-x-3">
                      {(doc.pdf_file || doc.fichier) && (
                        <button
                          onClick={() => handleView(doc.pdf_file || doc.fichier)}
                          title={t('favoris.consulter')}
                          aria-label={t('favoris.consulter')}
                          className="text-blue-800 hover:underline"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                      )}
                      {(doc.pdf_file || doc.fichier) && (
                        <button
                          onClick={() => handleDownload(doc.pdf_file || doc.fichier, `document-${doc.id}.pdf`)}
                          title={t('favoris.telecharger')}
                          aria-label={t('favoris.telecharger')}
                          className="text-gray-700 hover:underline"
                        >
                          <FontAwesomeIcon icon={faDownload} />
                        </button>
                      )}
                      <button
                        onClick={() => removeFavori(doc.id)}
                        title={t('favoris.retirer')}
                        aria-label={t('favoris.retirer')}
                        className="text-yellow-500 hover:text-yellow-600"
                      >
                        <FontAwesomeIcon icon={faStarSolid} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MesFavoris;
