import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { getCsrfToken } from './Utils';
import HelpTooltip from './HelpTooltip';
import axiosInstance from './AxiosConfig';
import { ThreeDots } from 'react-loader-spinner';
import { useNavigate } from 'react-router-dom';

const CorpsForm = () => {
    const [formData, setFormData] = useState({
        nom: '',
        numero: '',
        description: '',
        type: '',
        date_creation: '',
        fichier: null,
    });
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    const handleFileChange = (e) => {
        setFormData({ ...formData, fichier: e.target.files[0] });
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const user = JSON.parse(localStorage.getItem("user"));
        const token = user?.access;
        if (!token) {
            toast.error("Vous n'êtes pas connecté. Veuillez vous connecter.");
            return;
        }

        // Créer une instance FormData pour inclure le fichier
        const formDataToSend = new FormData();
        Object.keys(formData).forEach((key) => {
            formDataToSend.append(key, formData[key]);
        });

        setLoading(true)
        try {
            const response = await axiosInstance.post('/api/corps/', formDataToSend, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });
            toast.success('Corps ajouté avec succès!');
            navigate("/dashboard")
        } catch (error) {
            toast.error("Erreur lors de l'ajout du corps:", error);
        } finally {
            setLoading(false)
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-transparent mt-40">
            <div className="flex flex-wrap bg-white rounded-lg shadow-lg overflow-hidden md:w-1/2 w-full lg:w-3/4 animate__animated animate__pulse">
                <div className="hidden md:block w-1/2 bg-cover bg-center"
                    style={{
                        backgroundImage: "url('../../public/ajout2.png')", width: "50%",
                        height: "auto", backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}>
                </div>
                <div className='w-full md:w-1/2 p-6'>
                    <form
                        onSubmit={handleSubmit}
                        className="w-full max-w-lg bg-white shadow-md rounded px-8 pt-6 pb-8"
                    >
                        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Ajouter un Corps</h2>

                        {/* Catégorie du corps : saisie manuelle */}
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Catégorie du corps professionnel
                                <HelpTooltip text="Saisissez manuellement la catégorie ministerielle du corps (ex. Administration Publique, Police nationale, Santé Publique...)." />
                            </label>
                            <input
                                type="text"
                                name="nom"
                                value={formData.nom}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring focus:ring-blue-300"
                                required
                                placeholder="Ex. Administration Publique"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Numéro</label>
                            <input
                                type="text"
                                name="numero"
                                value={formData.numero}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring focus:ring-blue-300"
                                required
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Description</label>
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring focus:ring-blue-300"
                                required
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Type du corps (saisie manuelle)</label>
                            <input
                                type="text"
                                name="type"
                                value={formData.type}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring focus:ring-blue-300"
                                required
                                placeholder="Ex. Administration, Technique, Magistracy..."
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Date de création</label>
                            <input
                                type="date"
                                name="date_creation"
                                value={formData.date_creation}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring focus:ring-blue-300"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-gray-700 font-medium mb-2">Fichier</label>
                            <input
                                type="file"
                                name="fichier"
                                onChange={handleFileChange}
                                required
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <button
                                type="submit"
                                className="bg-blue-900 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                            >
                                {loading ? (
                                    <ThreeDots
                                        visible={true}
                                        height="40"
                                        width="40"
                                        color="#4A90E2"
                                        radius="9"
                                        ariaLabel="three-dots-loading"
                                        wrapperStyle={{}}
                                        wrapperClass=""
                                    />
                                ) : "Ajouter"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CorpsForm;