import React, { useEffect, useState } from "react";
import axiosInstance from "./AxiosConfig";
import { toast } from "react-toastify";

const AdminSubscribers = () => {
    const [subscribers, setSubscribers] = useState([]);

    useEffect(() => {
        axiosInstance.get('/api/subscribers/')
        .then(response => {
            // Assuming the response format is { count, results } or just an array
            if (response.data && response.data.results) {
                setSubscribers(response.data.results);
            } else if (Array.isArray(response.data)) {
                setSubscribers(response.data);
            } else {
                setSubscribers([]);
            }
        })
        .catch(() => {
            toast.error('Erreur lors de la récupération des abonnés.');
        });
    }, []);

    return (
        <div className="flex flex-col items-center p-6 bg-white shadow-lg rounded-lg max-w-4xl mx-auto max-h-96 overflow-y-auto">
            <h1 className="text-2xl font-semibold text-gray-800 mb-6">Abonnés aux alertes</h1>
            <div className="w-full">
                {subscribers.length > 0 ? (
                    subscribers.map((sub) => (
                        <div key={sub.id} className="p-4 mb-4 border border-gray-300 rounded-md bg-gray-50">
                            <p className="text-lg font-medium"><strong>Email:</strong> {sub.email}</p>
                            <p className="mt-2 text-sm text-gray-600"><strong>Date d'inscription:</strong> {new Date(sub.created_at).toLocaleString()}</p>
                        </div>
                    ))
                ) : (
                    <p className="text-gray-600">Aucun abonné trouvé.</p>
                )}
            </div>
        </div>
    );
};

export default AdminSubscribers;