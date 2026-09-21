import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import axiosInstance from './AxiosConfig';

const STATUTS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'soumise', label: 'Soumises' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'traitee', label: 'Traitées' },
  { value: 'rejetee', label: 'Rejetées' },
];

const STATUT_STYLES = {
  soumise: 'bg-gray-100 text-gray-800 border-gray-300',
  en_cours: 'bg-blue-100 text-blue-800 border-blue-300',
  traitee: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  rejetee: 'bg-red-100 text-red-800 border-red-300',
};

const STATUT_LABELS = {
  soumise: 'Soumise',
  en_cours: 'En cours',
  traitee: 'Traitée',
  rejetee: 'Rejetée',
};

const TYPE_LABELS = {
  copie_certifiee: 'Copie certifiée',
  attestation: 'Attestation',
  demande_information: 'Demande d’information',
  autre: 'Autre demande',
};

const AdminDemarches = () => {
  const [demarches, setDemarches] = useState([]);
  const [statut, setStatut] = useState('');
  const [loading, setLoading] = useState(true);
  // Démarche en cours d'édition : { id, statut, commentaire_admin }
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchDemarches = useCallback(async (statutFiltre = statut) => {
    setLoading(true);
    try {
      const res = await axiosInstance.get('/api/demarches/', {
        params: statutFiltre ? { statut: statutFiltre } : {},
      });
      setDemarches(res.data.results || []);
    } catch (err) {
      console.error('Erreur lors du chargement des démarches :', err);
      toast.error('Erreur lors du chargement des démarches.');
    } finally {
      setLoading(false);
    }
  }, [statut]);

  useEffect(() => {
    fetchDemarches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (e) => {
    const value = e.target.value;
    setStatut(value);
    fetchDemarches(value);
  };

  const handleUpdateStatus = async (id) => {
    if (!editing || editing.id !== id) return;
    setSaving(true);
    try {
      const res = await axiosInstance.patch(`/api/demarches/${id}/status/`, {
        statut: editing.statut,
        commentaire_admin: editing.commentaire_admin,
      });
      toast.success(res.data.detail || 'Statut mis à jour.');
      setEditing(null);
      fetchDemarches();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(detail || 'Erreur lors de la mise à jour du statut.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center p-6 bg-white shadow-lg rounded-lg max-w-4xl mx-auto">
      <div className="w-full flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Démarches des usagers</h1>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span id="filtre-demarches-label">Filtrer :</span>
          <select
            value={statut}
            onChange={handleFilterChange}
            aria-labelledby="filtre-demarches-label"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          >
            {STATUTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 py-6">Chargement…</p>
      ) : demarches.length === 0 ? (
        <p className="text-gray-600 py-6">Aucune démarche trouvée.</p>
      ) : (
        <div className="w-full space-y-4 max-h-[32rem] overflow-y-auto pr-1">
          {demarches.map((d) => (
            <div key={d.id} className="p-4 border border-gray-300 rounded-md bg-gray-50">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-800 bg-blue-100 px-2.5 py-1 rounded">
                    {TYPE_LABELS[d.type_demarche] || d.type_demarche}
                  </span>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${STATUT_STYLES[d.statut] || STATUT_STYLES.soumise}`}
                  >
                    {STATUT_LABELS[d.statut] || d.statut}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(d.created_at).toLocaleString('fr-FR')}
                </span>
              </div>

              <p className="mt-2 text-sm text-gray-800">{d.objet}</p>

              <p className="mt-1 text-xs text-gray-600">
                <strong>Usager :</strong> {d.usager_prenom} {d.usager_nom} ({d.usager_email})
                {d.document_numero ? ` — Texte lié : ${d.document_type || 'document'} n° ${d.document_numero}` : ''}
                {d.nb_pieces_jointes > 0 ? ` — ${d.nb_pieces_jointes} pièce(s) jointe(s)` : ''}
              </p>

              {editing?.id === d.id ? (
                <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="demarche-nouveau-statut" className="text-xs font-semibold text-gray-700">Nouveau statut :</label>
                    <select
                      id="demarche-nouveau-statut"
                      value={editing.statut}
                      onChange={(e) => setEditing({ ...editing, statut: e.target.value })}
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                      {STATUTS.filter((s) => s.value).map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    className="w-full p-2 border border-gray-300 rounded-md text-sm"
                    rows={2}
                    maxLength={1000}
                    placeholder="Commentaire à l’attention de l’usager (facultatif, inclus dans l’email de notification)"
                    value={editing.commentaire_admin}
                    onChange={(e) => setEditing({ ...editing, commentaire_admin: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(d.id)}
                      disabled={saving}
                      className="px-4 py-1.5 bg-blue-800 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-60"
                    >
                      {saving ? 'Enregistrement…' : 'Enregistrer et notifier'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="px-4 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-100"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  {d.commentaire_admin && (
                    <p className="text-xs text-gray-600 mb-2">
                      <strong>Dernier commentaire :</strong> {d.commentaire_admin}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({ id: d.id, statut: d.statut, commentaire_admin: d.commentaire_admin || '' })
                    }
                    className="px-4 py-1.5 bg-blue-900 text-white rounded-md text-sm hover:bg-blue-700"
                  >
                    Traiter cette démarche
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminDemarches;
