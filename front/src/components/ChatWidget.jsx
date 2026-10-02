import React, { useCallback, useEffect, useRef, useState } from 'react';
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
 *
 * Les messages bot ne stockent que des CLÉS de traduction + données : le texte
 * est résolu au rendu via t(), donc changer de langue met instantanément à jour
 * toute la conversation affichée (l'accueil, erreurs, libellés d'actions…).
 */
let nextMessageId = 1;

const ChatWidget = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  // Message d'accueil à la première ouverture
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ id: nextMessageId++, role: 'bot', kind: 'accueil' }]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll vers le dernier message
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, suggestions]);

  // Fermeture au clavier (Échap) : a11y — le panneau se comporte comme une boîte de dialogue
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Charge quelques questions FAQ (fr) comme suggestions cliquables.
  // Échoue en silence : les suggestions sont un plus, pas une dépendance.
  useEffect(() => {
    if (!open || suggestions.length > 0) return undefined;
    let cancelled = false;
    axiosInstance
      .get('/api/faq/')
      .then((res) => {
        if (cancelled) return;
        const items = (res.data?.results || [])
          .filter((r) => r.question_fr)
          .slice(0, 3)
          .map((r) => ({ id: r.id, question: r.question_fr }));
        setSuggestions(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reconstruit l'historique conversationnel (user/assistant) pour le LLM :
  // seuls les messages portant du texte sont transmis.
  const construireHistorique = (prev) =>
    prev
      .filter((m) => m.role === 'user' || m.kind === 'llm' || m.kind === 'faq')
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.role === 'user' ? m.text : m.text || `${m.question || ''}
${m.reponse || ''}`.trim(),
      }))
      .filter((t) => t.content);

  const envoyer = useCallback(
    async (e, questionOverride) => {
      e?.preventDefault?.();
      const question = String(questionOverride ?? input).trim();
      if (!question || loading) return;

      setInput('');
      setSuggestions([]);
      const history = construireHistorique(messages);
      setMessages((prev) => [...prev, { id: nextMessageId++, role: 'user', text: question }]);
      setLoading(true);

      try {
        const res = await axiosInstance.post('/api/faq/ask/', {
          question,
          lang: i18n.language,
          history,
        });
        const data = res.data || {};

        if (data.type === 'llm' && data.text) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextMessageId++,
              role: 'bot',
              kind: 'llm',
              text: data.text,
              documents: data.sources?.documents || [],
            },
          ]);
        } else if (data.type === 'faq' && data.faq) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextMessageId++,
              role: 'bot',
              kind: 'faq',
              question: data.faq.question,
              reponse: data.faq.reponse,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { id: nextMessageId++, role: 'bot', kind: 'documents', documents: data.documents || [] },
          ]);
        }
      } catch (err) {
        console.error('ChatWidget ask error:', err);
        setMessages((prev) => [...prev, { id: nextMessageId++, role: 'bot', kind: 'error' }]);
      } finally {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    },
    [input, loading, i18n.language, messages]
  );

  const ouvrirDocument = (doc) => {
    setOpen(false);
    // AfficherDocs ouvre la fiche détaillée du document demandé (F9 → recherche)
    navigate('/AfficherDoc', { state: { openDocumentId: doc.id } });
  };

  const poserAutre = () => {
    setMessages([{ id: nextMessageId++, role: 'bot', kind: 'accueil' }]);
    setInput('');
    setSuggestions([]);
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
      ref={panelRef}
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
      <div
        ref={scrollRef}
        aria-live="polite"
        aria-atomic="false"
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50"
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onOpenDocument={ouvrirDocument} t={t} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Oval height={16} width={16} color="#1e3a8a" secondaryColor="#93c5fd" strokeWidth={4} />
            {t('common.chargement')}
          </div>
        )}

        {/* Suggestions cliquables : affichées tant qu'aucune question n'a été posée */}
        {!dejaEchange && !loading && suggestions.length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
              {t('chat.suggestions')}
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={(e) => envoyer(e, s.question)}
                  className="border border-blue-200 bg-white text-blue-900 text-xs rounded-full px-3 py-1.5 hover:bg-blue-50 hover:border-blue-400 transition text-left"
                >
                  {s.question}
                </button>
              ))}
            </div>
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
          maxLength={500}
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
        {message.kind === 'llm' && (
          <>
            <p className="whitespace-pre-line">{message.text}</p>
            {message.documents && message.documents.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-blue-800 mb-1.5">
                  {t('chat.documents_suggeres')}
                </p>
                <ul className="space-y-1.5">
                  {message.documents.slice(0, 3).map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        onClick={() => onOpenDocument(doc)}
                        className="w-full text-left border border-gray-200 rounded-md px-2 py-1.5 hover:border-blue-300 hover:bg-blue-50 transition"
                      >
                        <span className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase">
                          <FontAwesomeIcon icon={faFileLines} />
                          {doc.type}
                          {doc.numero ? ` · ${doc.numero}` : ''}
                        </span>
                        <span className="block text-sm text-gray-800">{doc.objet}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {message.kind === 'faq' && (
          <>
            {message.question && (
              <p className="text-xs font-semibold text-blue-800 mb-1 flex items-center gap-1">
                <FontAwesomeIcon icon={faCircleQuestion} />
                {message.question}
              </p>
            )}
            <p className="whitespace-pre-line">{message.reponse}</p>
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
          <p className="whitespace-pre-line">
            {message.kind === 'accueil' ? t('chat.accueil') : t('chat.erreur')}
          </p>
        )}
      </div>
    </div>
  );
};

export default ChatWidget;
