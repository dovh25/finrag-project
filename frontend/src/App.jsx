import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Bot,
  User,
  TrendingUp,
  Loader2,
  Sparkles,
  MessageSquareText,
  Moon,
  Sun,
  Plus,
  MessageSquare,
  Menu,
  X,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

const API_URL = 'https://finrag-backend-sdny.onrender.com/chat';

const SUGGESTED_QUERIES = [
  'Hãy cho tôi biết định hướng chiến lược của Vingroup trong năm 2025',
  'Hãy phân tích cho tôi kết quả kinh doanh của FPT và Vinamilk năm 2025',
  'Hãy cho tôi biết mục tiêu phát triển bền vững (ESG) của MB Bank năm 2025',
  'Hãy phân tích cho tôi tình hình sản xuất và doanh thu của Hòa Phát năm 2025',
];

const generateId = () => Math.random().toString(36).substring(2, 9);

/* ─────────────────────────────────────────────
   Typing Indicator
   ───────────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/20">
        <Bot size={16} className="text-white" />
      </div>
      <div className="bg-white dark:bg-surface-800/80 border border-slate-200 dark:border-white/[0.06] rounded-2xl rounded-tl-sm px-5 py-3.5 flex items-center gap-1.5 shadow-sm dark:shadow-none">
        <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse-dot" style={{ animationDelay: '0s' }} />
        <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse-dot" style={{ animationDelay: '0.2s' }} />
        <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse-dot" style={{ animationDelay: '0.4s' }} />
        <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">Retrieving &amp; Analyzing...</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Chat Bubble
   ───────────────────────────────────────────── */
function ChatBubble({ role, content }) {
  const isUser = role === 'user';

  // Pre-process citations into markdown links so ReactMarkdown can parse them safely
  const processedContent = content.replace(/\[Source:\s*(.*?)\]/gi, '[citation:$1](#citation)');

  return (
    <div className={`flex items-start gap-3 animate-slide-up ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center shadow-lg ${
          isUser
            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20'
            : 'bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand-500/20'
        }`}
      >
        {isUser ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
      </div>

      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3.5 ${
          isUser
            ? 'bg-gradient-to-br from-emerald-600/90 to-teal-700/90 text-white rounded-tr-sm shadow-md'
            : 'bg-white dark:bg-surface-800/80 border border-slate-200 dark:border-white/[0.06] text-slate-800 dark:text-slate-200 rounded-tl-sm shadow-sm dark:shadow-none'
        }`}
      >
        {isUser ? (
          <p className="text-[0.94rem] leading-relaxed">{content}</p>
        ) : (
          <div className="prose-ai text-[0.94rem]">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                a({ node, href, children }) {
                  if (href === '#citation') {
                    const docName = String(children).replace('citation:', '');
                    return (
                      <span className="group relative inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[0.7rem] font-semibold text-blue-700 dark:text-blue-300 ml-1 border border-blue-200 dark:border-blue-800/50 cursor-help transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/50 align-middle">
                        📖 Source
                        {/* Tooltip */}
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs opacity-0 transition-opacity group-hover:opacity-100 z-50">
                          <span className="block rounded bg-slate-900 dark:bg-slate-100 px-2.5 py-1.5 text-[0.75rem] font-medium text-white dark:text-slate-900 shadow-xl whitespace-normal text-center">
                            {docName}
                          </span>
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-100"></span>
                        </span>
                      </span>
                    );
                  }
                  return <a href={href} className="text-brand-500 hover:underline" target="_blank" rel="noreferrer">{children}</a>;
                },
                // Fallback for code block citations if the LLM sometimes uses them
                code({node, className, children, ...props}) {
                  const contentStr = String(children);
                  let isCitation = false;
                  let docName = '';
                  
                  if (contentStr.startsWith('[citation:') && contentStr.endsWith('](#citation)')) {
                    isCitation = true;
                    docName = contentStr.replace(/\[citation:\s*|\s*\]\(#citation\)/g, '');
                  } else if (contentStr.startsWith('[Source:') && contentStr.endsWith(']')) {
                    isCitation = true;
                    docName = contentStr.replace(/\[Source:\s*|\]/g, '');
                  }

                  if (isCitation) {
                    return (
                      <span className="group relative inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[0.7rem] font-semibold text-blue-700 dark:text-blue-300 ml-1 border border-blue-200 dark:border-blue-800/50 cursor-help transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/50 align-middle">
                        📖 Source
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs opacity-0 transition-opacity group-hover:opacity-100 z-50">
                          <span className="block rounded bg-slate-900 dark:bg-slate-100 px-2.5 py-1.5 text-[0.75rem] font-medium text-white dark:text-slate-900 shadow-xl whitespace-normal text-center">
                            {docName}
                          </span>
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-100"></span>
                        </span>
                      </span>
                    );
                  }
                  return <code className={className} {...props}>{children}</code>;
                }
              }}
            >
              {processedContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Welcome Screen
   ───────────────────────────────────────────── */
function WelcomeScreen({ onSuggestionClick }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in">
      <div className="relative mb-6">
        <div className="absolute inset-0 blur-3xl bg-brand-500/20 rounded-full scale-150" />
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-2xl shadow-brand-500/30">
          <TrendingUp size={36} className="text-white" />
        </div>
      </div>

      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight text-center">FinRAG Analyst</h1>
      <p className="text-slate-600 dark:text-slate-400 text-center max-w-md mb-10 leading-relaxed">
        AI-powered financial report analysis. Ask me anything about top Vietnamese corporations' financial data.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {SUGGESTED_QUERIES.map((q, i) => (
          <button
            key={i}
            onClick={() => onSuggestionClick(q)}
            className="group text-left px-4 py-3.5 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-surface-800/50 hover:bg-slate-50 dark:hover:bg-surface-700/60 hover:border-brand-500/30 transition-all duration-200 cursor-pointer shadow-sm dark:shadow-none"
          >
            <div className="flex items-start gap-2.5">
              <Sparkles size={15} className="text-brand-500 dark:text-brand-400 mt-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
              <span className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-brand-600 dark:group-hover:text-white transition-colors leading-snug">{q}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   App
   ───────────────────────────────────────────── */
export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Layout state
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth >= 1024;
    return false;
  });

  // Chat memory state
  const [chatSessions, setChatSessions] = useState(() => {
    const saved = localStorage.getItem('finrag-sessions');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    return localStorage.getItem('finrag-current-session') || null;
  });
  
  // Use a ref to track the session ID synchronously inside closures
  const currentSessionIdRef = useRef(currentSessionId);
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Sync messages when current session changes
  useEffect(() => {
    if (currentSessionId) {
      const session = chatSessions.find(s => s.id === currentSessionId);
      setMessages(session ? session.messages : []);
      localStorage.setItem('finrag-current-session', currentSessionId);
    } else {
      setMessages([]);
      localStorage.removeItem('finrag-current-session');
    }
  }, [currentSessionId, chatSessions]);

  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('finrag-theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem('finrag-theme', newTheme ? 'dark' : 'light');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentSessionId]);

  const updateCurrentSession = (newMessages) => {
    setMessages(newMessages); // Optimistic UI update

    setChatSessions(prev => {
      let updated = [...prev];
      if (!currentSessionIdRef.current) {
        const newId = generateId();
        // Save full title up to 100 chars, let CSS `truncate` handle the display
        const title = newMessages[0].content.slice(0, 100);
        updated.unshift({ id: newId, title, messages: newMessages });
        // Cap at 20 sessions to prevent localStorage quota exhaustion
        if (updated.length > 20) updated = updated.slice(0, 20);
        setCurrentSessionId(newId);
        currentSessionIdRef.current = newId; // Update ref immediately
      } else {
        const index = updated.findIndex(s => s.id === currentSessionIdRef.current);
        if (index !== -1) {
          updated[index].messages = newMessages;
        }
      }
      localStorage.setItem('finrag-sessions', JSON.stringify(updated));
      return updated;
    });
  };

  const createNewChat = () => {
    setCurrentSessionId(null);
    currentSessionIdRef.current = null;
    if (window.innerWidth < 1024) setIsSidebarOpen(false); // Close sidebar on mobile
  };

  const deleteSession = (e, id) => {
    e.stopPropagation();
    const updated = chatSessions.filter(s => s.id !== id);
    setChatSessions(updated);
    localStorage.setItem('finrag-sessions', JSON.stringify(updated));
    if (currentSessionIdRef.current === id) {
      setCurrentSessionId(null);
      currentSessionIdRef.current = null;
    }
  };

  const sendMessage = async (queryText) => {
    const trimmed = (queryText ?? input).trim();
    if (!trimmed || isLoading) return;

    // Build chat history for backend (excluding current query)
    const chatHistory = messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    const userMsg = { id: generateId(), role: 'user', content: trimmed };
    const tempMessages = [...messages, userMsg];
    updateCurrentSession(tempMessages);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto'; // Reset auto-resize
    setIsLoading(true);

    try {
      const { data } = await axios.post(API_URL, { 
        query: trimmed,
        chat_history: chatHistory 
      });
      const aiMsg = { id: generateId(), role: 'ai', content: data.response };
      updateCurrentSession([...tempMessages, aiMsg]);
    } catch (err) {
      const errorMsg = {
        id: generateId(),
        role: 'ai',
        content: '⚠️ **Connection error.** Please make sure the FastAPI backend is running and try again.',
      };
      updateCurrentSession([...tempMessages, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-screen flex bg-surface-50 dark:bg-surface-900 transition-colors duration-200 overflow-hidden font-sans">
      
      {/* ── Sidebar Mobile Overlay ── */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside 
        className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col bg-slate-50 dark:bg-surface-800 transition-all duration-300 ease-in-out ${
          isSidebarOpen 
            ? 'w-64 translate-x-0 border-r border-slate-200 dark:border-white/[0.06]' 
            : 'w-64 -translate-x-full lg:w-0 lg:border-none lg:opacity-0 lg:overflow-hidden'
        }`}
      >
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <TrendingUp size={16} className="text-white" />
            </div>
            <span className="font-semibold text-slate-900 dark:text-white">FinRAG</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)} 
            className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-surface-700 rounded-lg transition-colors"
            title="Close Sidebar"
          >
            <PanelLeftClose size={18} className="hidden lg:block" />
            <X size={18} className="lg:hidden" />
          </button>
        </div>

        <div className="px-3 pb-3">
          <button 
            onClick={createNewChat}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors shadow-sm font-medium text-sm"
          >
            <Plus size={16} />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <h3 className="px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Recent Chats</h3>
          {chatSessions.length === 0 ? (
            <p className="px-3 text-xs text-slate-400 italic">No previous chats.</p>
          ) : (
            chatSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => {
                  setCurrentSessionId(session.id);
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm ${
                  currentSessionId === session.id
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-700/50'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <MessageSquare size={14} className="flex-shrink-0 opacity-70" />
                  <span className="truncate">{session.title}</span>
                </div>
                <button
                  onClick={(e) => deleteSession(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity"
                  title="Delete chat"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        
        {/* Header */}
        <header className="flex-shrink-0 h-14 border-b border-slate-200 dark:border-white/[0.06] bg-white/80 dark:bg-surface-900/80 backdrop-blur-xl flex items-center px-4 justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`p-1.5 -ml-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-surface-800 rounded-lg transition-colors ${isSidebarOpen ? 'lg:hidden' : ''}`}
              title="Toggle Sidebar"
            >
              <PanelLeftOpen size={20} className="hidden lg:block" />
              <Menu size={20} className="lg:hidden" />
            </button>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300 hidden sm:block truncate max-w-sm lg:max-w-xl">
              {chatSessions.find(s => s.id === currentSessionId)?.title || 'New Analysis'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
              aria-label="Toggle theme"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-surface-800/60 px-2.5 py-1 rounded-full border border-slate-200 dark:border-white/[0.04]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
              GPT-OSS 120B
            </span>
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto w-full h-full flex flex-col px-4 sm:px-6 py-6">
            {messages.length === 0 ? (
              <WelcomeScreen onSuggestionClick={(q) => { setInput(q); sendMessage(q); }} />
            ) : (
              <div className="flex flex-col gap-6">
                {messages.map((msg, i) => (
                  <ChatBubble key={msg.id || i} role={msg.role} content={msg.content} />
                ))}
                {isLoading && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </main>

        {/* Input Bar */}
        <footer className="flex-shrink-0 border-t border-slate-200 dark:border-white/[0.06] bg-white/80 dark:bg-surface-900/80 backdrop-blur-xl">
          <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-4">
            <div className="flex items-end gap-3 bg-white dark:bg-surface-800/70 border border-slate-300 dark:border-white/[0.08] rounded-2xl px-4 py-2.5 focus-within:border-brand-500/40 dark:focus-within:border-brand-500/40 focus-within:shadow-lg focus-within:shadow-brand-500/5 transition-all duration-200 shadow-sm dark:shadow-none">
              <MessageSquareText size={20} className="text-slate-400 dark:text-slate-500 mb-1 flex-shrink-0 hidden sm:block" />
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // Auto-resize: expand up to max-h-32 (128px), then scroll
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask about financial reports..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-slate-900 dark:text-white text-[0.94rem] placeholder-slate-400 dark:placeholder-slate-500 outline-none resize-none max-h-32 leading-relaxed disabled:opacity-50 py-0.5"
                style={{ minHeight: '1.7rem' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 disabled:opacity-30 disabled:shadow-none transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            <p className="text-center text-[0.7rem] text-slate-500 dark:text-slate-600 mt-2.5">
              FinRAG uses GPT-OSS 120B via Groq · Hybrid Retrieval from Qdrant Cloud · Responses may contain inaccuracies
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
