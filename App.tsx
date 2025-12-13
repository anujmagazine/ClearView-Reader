import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Book, History, X, Loader2 } from 'lucide-react';
import { fetchArticleContent } from './services/geminiService';
import { ArticleData, AppState, ReaderTheme, ReadingHistoryItem } from './types';
import { ArticleView } from './components/ArticleView';
import { ThemeToggle } from './components/ThemeToggle';

export default function App() {
  const [url, setUrl] = useState('');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [articleData, setArticleData] = useState<ArticleData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [theme, setTheme] = useState<ReaderTheme>(ReaderTheme.LIGHT);
  const [history, setHistory] = useState<ReadingHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history from local storage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('clearview_history');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  const saveToHistory = (article: ArticleData) => {
    const newItem: ReadingHistoryItem = {
      id: Date.now().toString(),
      url: article.url,
      title: article.title,
      timestamp: Date.now()
    };
    
    // Filter out duplicates and keep last 20
    const updatedHistory = [newItem, ...history.filter(h => h.url !== article.url)].slice(0, 20);
    setHistory(updatedHistory);
    localStorage.setItem('clearview_history', JSON.stringify(updatedHistory));
  };

  const handleRead = async (inputUrl: string) => {
    if (!inputUrl.trim()) return;
    
    // Auto-prepend https if missing
    let finalUrl = inputUrl.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
    }

    setAppState(AppState.LOADING);
    setErrorMsg('');
    
    try {
      const data = await fetchArticleContent(finalUrl);
      setArticleData(data);
      saveToHistory(data);
      setAppState(AppState.READING);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to process article");
      setAppState(AppState.ERROR);
    }
  };

  const handleBack = () => {
    setAppState(AppState.IDLE);
    setArticleData(null);
    setUrl('');
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHistory = history.filter(h => h.id !== id);
    setHistory(newHistory);
    localStorage.setItem('clearview_history', JSON.stringify(newHistory));
  };

  // Render Reading Mode
  if (appState === AppState.READING && articleData) {
    return <ArticleView article={articleData} theme={theme} onBack={handleBack} />;
  }

  // Render Landing/Input Mode
  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${
      theme === ReaderTheme.DARK ? 'bg-gray-900 text-white' : 
      theme === ReaderTheme.SEPIA ? 'bg-sepia-50 text-sepia-900' : 'bg-gray-50 text-gray-900'
    }`}>
      
      {/* Top Bar */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle currentTheme={theme} onThemeChange={setTheme} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 max-w-5xl mx-auto w-full">
        
        {/* Brand */}
        <div className="text-center mb-12 animate-fade-in-up">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg mb-6">
            <Sparkles size={32} />
          </div>
          <h1 className="text-4xl md:text-6xl font-serif font-bold mb-4 tracking-tight">
            ClearView Reader
          </h1>
          <p className="text-lg md:text-xl opacity-60 max-w-lg mx-auto font-light">
            Read articles without friction. Paste a URL to get a clean, distraction-free, AI-enhanced reading experience.
          </p>
        </div>

        {/* Input Card */}
        <div className="w-full max-w-2xl relative group animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className={`absolute -inset-1 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200 ${
              theme === ReaderTheme.DARK ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-gradient-to-r from-blue-400 to-indigo-400'
          }`}></div>
          
          <div className={`relative rounded-2xl p-2 shadow-xl ${
               theme === ReaderTheme.DARK ? 'bg-gray-800' : 'bg-white'
          }`}>
             <form 
                onSubmit={(e) => { e.preventDefault(); handleRead(url); }}
                className="flex items-center"
             >
                <input
                  type="text"
                  placeholder="Paste article URL here..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className={`flex-1 p-4 rounded-xl text-lg outline-none bg-transparent placeholder-opacity-40 ${
                    theme === ReaderTheme.DARK ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'
                  }`}
                />
                <button
                  type="submit"
                  disabled={appState === AppState.LOADING || !url}
                  className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-2 font-medium px-6"
                >
                  {appState === AppState.LOADING ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <>
                      <span>Read</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
             </form>
          </div>
        </div>

        {/* Error Message */}
        {appState === AppState.ERROR && (
           <div className="mt-8 p-4 bg-red-100 text-red-700 rounded-lg max-w-md text-center border border-red-200 animate-fade-in-up">
              <p className="font-medium">Error processing article</p>
              <p className="text-sm mt-1 opacity-80">{errorMsg}</p>
           </div>
        )}

        {/* Recent History Toggle */}
        <div className="mt-16 w-full max-w-2xl animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider opacity-50 hover:opacity-100 transition-opacity mx-auto mb-6"
          >
             <History size={16} />
             <span>Recent Reads</span>
          </button>

          {showHistory && (
             <div className={`rounded-xl border overflow-hidden transition-all ${
                 theme === ReaderTheme.DARK ? 'border-gray-700 bg-gray-800/50' : 
                 theme === ReaderTheme.SEPIA ? 'border-sepia-200 bg-sepia-100/50' : 'border-gray-200 bg-white'
             }`}>
                {history.length === 0 ? (
                    <div className="p-8 text-center opacity-40">No history yet</div>
                ) : (
                    <div className="divide-y divide-opacity-10 divide-current max-h-60 overflow-y-auto">
                        {history.map((item) => (
                            <div 
                                key={item.id}
                                onClick={() => handleRead(item.url)}
                                className={`p-4 flex items-center justify-between group cursor-pointer ${
                                    theme === ReaderTheme.DARK ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="p-2 rounded-lg bg-current opacity-5">
                                        <Book size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium truncate">{item.title}</p>
                                        <p className="text-xs opacity-50 truncate">{item.url}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={(e) => deleteHistoryItem(item.id, e)}
                                    className="p-2 rounded-full opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-red-100 hover:text-red-600 transition-all"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
             </div>
          )}
        </div>

      </div>

      <footer className="p-6 text-center opacity-30 text-xs">
         <p>Powered by Gemini 2.5 • Designed for clarity</p>
      </footer>
    </div>
  );
}