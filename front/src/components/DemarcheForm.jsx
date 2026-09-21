import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import axiosInstance from './AxiosConfig';
import HelpTooltip from './HelpTooltip';

const TYPES_DEMARCHE = [
  { value: 'copie_certifiee', label: 'Copie certifiée d’un texte' },
  { value: 'attestation', label: 'Attestation' },
  { value: 'demande_information', label: 'Demande d’information' },
  { value: 'autre', label: 'Autre demande' },
];

const DemarcheForm = () => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    type_demarche: '',
    objet: '',
    document_id: '',
  });
  const [fichier, setFichier] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const estConnecte = Boolean(user?.access);

  // Redirection vers login si non connecté (comme ProtectedRoute)
  useEffect(() => {
    if (!estConnecte) {
      toast.info(t('demarches.login_requis'));
      navigate('/login', { state: { from: '/demarches/nouvelle' } });
    }
  }, [estConnecte, navigate, t]);

  // Liste des documents pour le lien optionnel
  useEffect(() => {
    if (!estConnecte) return;
    axiosInstance
      .get('/api/documents/?page_size=100')
      .then((res) => setDocuments(res.data.results || []))
      .catch((err) => console.error('Erreur lors du chargement des documents :', err));
  }, [estConnecte]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileChange = (e) => setFichier(e.target.files[0]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    data.append('type_demarche', formData.type_demarche);
    data.append('objet', formData.objet);
    if (formData.document_id) data.append('document_id', formData.document_id);
    if (fichier) data.append('fichier', fichier);

    setLoading(true);
    try {
      await axiosInstance.post('/api/demarches/', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(t('demarches.succes'));
      navigate('/mes-demarches');
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(detail || t('demarches.erreur'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-transparent mt-40">
      <div className="w-full lg:w-2/3 bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">{t('demarches.nouvelle')}</h1>
        <p className="text-sm text-gray-600 text-center mb-6">
          {t('demarches.intro')}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Type de démarche */}
          <div>
            <label htmlFor="demarche-type" className="block text-gray-700 font-medium mb-2">
              {t('demarches.type')}
              <HelpTooltip text={t('demarches.type_aide')} />
            </label>
            <select
              id="demarche-type"
              name="type_demarche"
              value={formData.type_demarche}
              onChange={handleChange}
              required
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('demarches.choisir_type')}</option>
              {TYPES_DEMARCHE.map((tp) => (
                <option key={tp.value} value={tp.value}>{t(`demarches.${tp.value}`)}</option>
              ))}
            </select>
          </div>

          {/* Objet */}
          <div>
            <label htmlFor="demarche-objet" className="block text-gray-700 font-medium mb-2">
              {t('demarches.objet')}
              <HelpTooltip text={t('demarches.objet_aide')} />
            </label>
            <textarea
              id="demarche-objet"
              name="objet"
              value={formData.objet}
              onChange={handleChange}
              required
              rows={4}
              maxLength={2000}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder={t('demarches.objet_placeholder')}
            />
          </div>

          {/* Document lié optionnel */}
          <div>
            <label htmlFor="demarche-document" className="block text-gray-700 font-medium mb-2">
              {t('demarches.document_lie')}
              <HelpTooltip text={t('demarches.document_lie_aide')} />
            </label>
            <select
              id="demarche-document"
              name="document_id"
              value={formData.document_id}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('demarches.aucun_document')}</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.numero ? `N° ${doc.numero} — ` : ''}{doc.objet?.slice(0, 80)}
                </option>
              ))}
            </select>
          </div>

          {/* Pièce jointe */}
          <div>
            <label htmlFor="demarche-fichier" className="block text-gray-700 font-medium mb-2">
              {t('demarches.piece_jointe')}
              <HelpTooltip text={t('demarches.piece_jointe_aide')} />
            </label>
            <input
              id="demarche-fichier"
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-900 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition duration-200 disabled:opacity-60"
          >
            {loading ? t('demarches.envoi_cours') : t('demarches.envoyer')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default DemarcheForm;
