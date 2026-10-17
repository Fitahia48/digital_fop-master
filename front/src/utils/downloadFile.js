import axiosInstance from '../components/AxiosConfig';
import { resolveFileUrl } from '../components/Utils';

/**
 * Téléchargement d'un fichier média, robuste aux bloqueurs CORS.
 *
 * Stratégie en deux temps :
 * 1. Requête XHR (blob) → permet de forcer l'enregistrement avec le nom de
 *    fichier souhaité. Elle nécessite toutefois que la réponse porte les
 *    en-têtes CORS… ce qui n'est pas toujours le cas : les extensions
 *    gestionnaires de téléchargement (ex. IDM « Advanced Integration »)
 *    interceptent la requête et renvoient une réponse 204 SANS en-tête
 *    `Access-Control-Allow-Origin` → le navigateur la bloque et le bouton
 *    affiche « Erreur lors du téléchargement ».
 * 2. Repli : clic sur un lien pointant directement vers le fichier
 *    (`target="_blank"`). Une navigation n'est pas soumise aux règles CORS,
 *    donc ni le navigateur ni l'extension ne peuvent la bloquer.
 *
 * Seule une réponse serveur réelle (404, 403…) est remontée comme erreur :
 * elle indique un vrai problème avec le fichier, pas un blocage CORS.
 */
const openDirectUrl = (url) => {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export const downloadFile = async (fileUrl, fileName) => {
  const url = resolveFileUrl(fileUrl);
  if (!url) {
    throw new Error('URL de fichier manquante');
  }

  try {
    const res = await axiosInstance.get(url, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Révoquer un peu plus tard : une révocation immédiate peut annuler le
    // téléchargement sur certains navigateurs.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return;
  } catch (error) {
    // Si c'est une vraie erreur du serveur (4xx/5xx sauf 204 qui peut indiquer
    // une interception par un gestionnaire de téléchargement comme IDM), on la propage
    if (error?.response && error.response.status !== 204) {
      // Le serveur a réellement répondu en erreur (fichier absent, interdit…)
      throw error;
    }
    // Sinon (erreur réseau, CORS, interception 204) → repli sur le lien direct
    console.warn('Téléchargement via API impossible (CORS/interception ?) → repli sur le lien direct.', error?.message || error);
  }

  openDirectUrl(url);
};

export default downloadFile;
