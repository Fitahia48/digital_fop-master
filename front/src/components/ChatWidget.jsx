import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCommentDots,
  faPaperPlane,
  faXmark,
  faCircleQuestion,
  faFileLines,
  faRotateRight,
} from '@fortawesome/free-solid-svg-icons';
import { Oval } from 'react-loader-spinner';
import axiosInstance from './AxiosConfig';

/**
 * Bulle de chat flottante (F9 — FAQ dynamique).
 * L'historique vit uniquement dans le state local (non persisté), conformément
 * au choix MVP : aucune conversation n'est enregistrée côté serveur.
 */
const ChatWidget = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Message d'accueil à la première ouverture
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ id: 1, role: 'bot', kind: 'accueil', text: t('chat.accueil') }]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll vers le dernier message
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const envoyer = async (e) => {
    e?.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', text: question }]);
    setLoading(true);

    try {
      const res = await axiosInstance.post('/api/faq/ask/', {
        question,
        lang: i18n.language,
      });
      const data = res.data || {};

      if (data.type === 'faq' && data.faq) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'bot',
            kind: 'faq',
            text: data.faq.reponse,
            question: data.faq.question,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'bot',
            kind: 'documents',
            documents: data.documents || [],
          },
        ]);
      }
    } catch (err) {
      console.error('ChatWidget ask error:', err);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 2, role: 'bot', kind: 'error', text: t('chat.erreur') },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const ouvrirDocument = (doc) => {
    setOpen(false);
    // AfficherDocs ouvre la fiche détaillée du document demandé (F9 → recherche)
    navigate('/AfficherDoc', { state: { openDocumentId: doc.id } });
  };

  const poserAutre = () => {
    setMessages([{ id: Date.now(), role: 'bot', kind: 'accueil', text: t('chat.accueil') }]);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const allerAide = () => {
    setOpen(false);
    navigate('/aide');
  };

  const dejaEchange = messages.some((m) => m.role === 'user');

  // ─── Bulle fermée ──────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('chat.ouvrir')}
        title={t('chat.ouvrir')}
        className="fixed bottom-5 right-5 z-[55] w-14 h-14 rounded-full bg-blue-900 text-white shadow-xl flex items-center justify-center hover:bg-blue-700 transition"
      >
        <FontAwesomeIcon icon={faCommentDots} className="text-xl" />
      </button>
    );
  }

  // ─── Panneau ouvert ────────────────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-label={t('chat.titre')}
      className="fixed bottom-5 right-5 z-[55] w-[calc(100vw-2.5rem)] sm:w-96 h-[28rem] max-h-[80vh] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
    >
      {/* En-tête */}
      <div className="bg-blue-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faCommentDots} />
          <div>
            <p className="font-semibold leading-tight">{t('chat.titre')}</p>
            <p className="text-xs text-blue-100 leading-tight">{t('chat.sous_titre')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('chat.fermer')}
          className="text-blue-100 hover:text-white transition"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onOpenDocument={ouvrirDocument} t={t} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Oval height={16} width={16} color="#1e3a8a" secondaryColor="#93c5fd" strokeWidth={4} />
            {t('common.chargement')}
          </div>
        )}
      </div>

      {/* Actions secondaires */}
      {dejaEchange && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-white text-xs">
          <button
            type="button"
            onClick={poserAutre}
            className="flex items-center gap-1 text-blue-800 hover:text-blue-600 font-medium"
          >
            <FontAwesomeIcon icon={faRotateRight} />
            {t('chat.poser_autre')}
          </button>
          <button
            type="button"
            onClick={allerAide}
            className="text-gray-600 hover:text-blue-800 underline"
          >
            {t('chat.lien_aide')}
          </button>
        </div>
      )}

      {/* Saisie */}
      <form onSubmit={envoyer} className="flex items-center gap-2 border-t border-gray-200 p-2 bg-white">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          aria-label={t('chat.envoyer')}
          className="bg-blue-900 text-white rounded-md px-3 py-2 text-sm hover:bg-blue-700 transition disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </form>
    </div>
  );
};

// ─── Rendu d'un message ───────────────────────────────────────────────────────

const MessageBubble = ({ message, onOpenDocument, t }) => {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] bg-blue-900 text-white text-sm rounded-lg rounded-br-none px-3 py-2 whitespace-pre-line">
          {message.text}
        </p>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] bg-white border border-gray-200 text-gray-800 text-sm rounded-lg rounded-bl-none px-3 py-2 shadow-sm">
        {message.kind === 'faq' && (
          <>
            {message.question && (
              <p className="text-xs font-semibold text-blue-800 mb-1 flex items-center gap-1">
                <FontAwesomeIcon icon={faCircleQuestion} />
                {message.question}
              </p>
            )}
            <p className="whitespace-pre-line">{message.text}</p>
          </>
        )}

        {message.kind === 'documents' && (
          <>
            {message.documents && message.documents.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-blue-800 mb-2">
                  {t('chat.documents_suggeres')}
                </p>
                <ul className="space-y-2">
                  {message.documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="border border-gray-200 rounded-md p-2 hover:border-blue-300 hover:bg-blue-50 transition"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenDocument(doc)}
                        className="text-left w-full"
                      >
                        <span className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase">
                          <FontAwesomeIcon icon={faFileLines} />
                          {doc.type}
                          {doc.numero ? ` · ${doc.numero}` : ''}
                        </span>
                        <span className="block text-sm text-gray-800 mt-0.5">{doc.objet}</span>
                        <span className="block text-xs text-blue-800 mt-1">
                          {t('chat.consulter')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{t('chat.aucun_resultat')}</p>
            )}
          </>
        )}

        {(message.kind === 'accueil' || message.kind === 'error') && (
          <p className="whitespace-pre-line">{message.text}</p>
        )}
      </div>
    </div>
  );
};

export default ChatWidget;
