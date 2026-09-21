import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPenToSquare, faTrash, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import axiosInstance from './AxiosConfig';

// Onglets disponibles pour la saisie multilingue
const LANGS = ['fr', 'en', 'mg'];

const EMPTY_FORM = {
  question_fr: '',
  question_en: '',
  question_mg: '',
  reponse_fr: '',
  reponse_en: '',
  reponse_mg: '',
  categorie: '',
  ordre: 0,
};

/**
 * Gestion de la FAQ dans les 3 langues (F9), sur le modèle de AdminRemarks.jsx.
 * Le français est obligatoire et sert de repli pour les traductions vides.
 */
const AdminFaq = () => {
  const { t } = useTranslation();
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [activeLang, setActiveLang] = useState('fr');
  const [saving, setSaving] = useState(false);

  const chargerFaqs = () => {
    setLoading(true);
    axiosInstance
      .get('/api/faq/')
      .then((res) => setFaqs(res.data.results || []))
      .catch((err) => {
        console.error('Erreur chargement FAQ:', err);
        toast.error(t('admin_faq.chargement_erreur'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    chargerFaqs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const nouvelleQuestion = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setActiveLang('fr');
    setShowForm(true);
  };

  const modifier = (faq) => {
    setForm({
      question_fr: faq.question_fr || '',
      question_en: faq.question_en || '',
      question_mg: faq.question_mg || '',
      reponse_fr: faq.reponse_fr || '',
      reponse_en: faq.reponse_en || '',
      reponse_mg: faq.reponse_mg || '',
      categorie: faq.categorie || '',
      ordre: faq.ordre ?? 0,
    });
    setEditingId(faq.id);
    setActiveLang('fr');
    setShowForm(true);
  };

  const enregistrer = async (e) => {
    e.preventDefault();

    if (!form.question_fr.trim() || !form.reponse_fr.trim()) {
      toast.error(t('admin_faq.fr_obligatoire'));
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await axiosInstance.patch(`/api/faq/${editingId}/`, form);
        toast.success(t('admin_faq.maj_succes'));
      } else {
        await axiosInstance.post('/api/faq/', form);
        toast.success(t('admin_faq.creation_succes'));
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      chargerFaqs();
    } catch (err) {
      console.error('Erreur enregistrement FAQ:', err);
      toast.error(t('admin_faq.enregistrement_erreur'));
    } finally {
      setSaving(false);
    }
  };

  const supprimer = async (id) => {
    if (!window.confirm(t('admin_faq.confirmer_suppression'))) return;
    try {
      await axiosInstance.delete(`/api/faq/${id}/`);
      toast.success(t('admin_faq.suppression_succes'));
      chargerFaqs();
    } catch (err) {
      console.error('Erreur suppression FAQ:', err);
      toast.error(t('admin_faq.suppression_erreur'));
    }
  };

  // Libellé d'onglet : nom de langue en majuscules
  const langLabel = (code) => code.toUpperCase();

  return (
    <div className="max-w-4xl mx-auto mt-40 mb-16 px-4">
      <div className="bg-white shadow-lg rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-gray-800">{t('admin_faq.titre')}</h1>
          <button
            type="button"
            onClick={nouvelleQuestion}
            className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-md hover:bg-blue-700 transition text-sm font-medium"
          >
            <FontAwesomeIcon icon={faPlus} />
            {t('admin_faq.nouvelle')}
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-6">{t('admin_faq.intro')}</p>

        {/* Formulaire de saisie / édition multilingue */}
        {showForm && (
          <form onSubmit={enregistrer} className="mb-8 border border-blue-200 rounded-lg p-4 bg-blue-50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1" role="tablist">
                {LANGS.map((code) => (
                  <button
                    key={code}
                    type="button"
                    role="tab"
                    aria-selected={activeLang === code}
                    onClick={() => setActiveLang(code)}
                    className={`px-3 py-1.5 text-sm font-bold rounded-md transition ${
                      activeLang === code
                        ? 'bg-blue-900 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-blue-100'
                    }`}
                  >
                    {langLabel(code)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label={t('admin_faq.annuler')}
                className="text-gray-500 hover:text-gray-800"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            {LANGS.map((code) => (
              <div key={code} className={activeLang === code ? 'block' : 'hidden'}>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={`question_${code}`}>
                  {t('admin_faq.question')} ({langLabel(code)})
                </label>
                <input
                  id={`question_${code}`}
                  name={`question_${code}`}
                  type="text"
                  value={form[`question_${code}`]}
                  onChange={handleChange}
                  className="w-full p-2 border border-gray-300 rounded-md mb-3"
                />

                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={`reponse_${code}`}>
                  {t('admin_faq.reponse')} ({langLabel(code)})
                </label>
                <textarea
                  id={`reponse_${code}`}
                  name={`reponse_${code}`}
                  rows={4}
                  value={form[`reponse_${code}`]}
                  onChange={handleChange}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
            ))}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="categorie">
                  {t('admin_faq.categorie')}
                </label>
                <input
                  id="categorie"
                  name="categorie"
                  type="text"
                  value={form.categorie}
                  onChange={handleChange}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="ordre">
                  {t('admin_faq.ordre')}
                </label>
                <input
                  id="ordre"
                  name="ordre"
                  type="number"
                  value={form.ordre}
                  onChange={handleChange}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-900 text-white rounded-md hover:bg-blue-700 transition text-sm font-medium disabled:opacity-40"
              >
                {t('admin_faq.enregistrer')}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition text-sm"
              >
                {t('admin_faq.annuler')}
              </button>
            </div>
          </form>
        )}

        {/* Liste des questions existantes */}
        {loading ? (
          <p className="text-gray-600">{t('admin_faq.chargement')}</p>
        ) : faqs.length > 0 ? (
          faqs.map((faq) => (
            <div key={faq.id} className="p-4 mb-3 border border-gray-300 rounded-md bg-gray-50">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <p className="text-sm text-gray-500">
                    #{faq.id}
                    {faq.categorie ? ` · ${faq.categorie}` : ''}
                    {` · ${t('admin_faq.ordre')} ${faq.ordre}`}
                  </p>
                  <p className="font-medium text-gray-800 mt-1">{faq.question_fr}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => modifier(faq)}
                    aria-label={t('admin_faq.modifier')}
                    title={t('admin_faq.modifier')}
                    className="text-blue-800 hover:text-blue-600"
                  >
                    <FontAwesomeIcon icon={faPenToSquare} />
                  </button>
                  <button
                    type="button"
                    onClick={() => supprimer(faq.id)}
                    aria-label={t('admin_faq.supprimer')}
                    title={t('admin_faq.supprimer')}
                    className="text-red-700 hover:text-red-500"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{faq.reponse_fr}</p>
            </div>
          ))
        ) : (
          <p className="text-gray-600">{t('admin_faq.aucune')}</p>
        )}
      </div>
    </div>
  );
};

export default AdminFaq;
