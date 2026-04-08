import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Book, History, X, Loader2, LogIn, LogOut, Bookmark } from 'lucide-react';
import { fetchArticleContent } from './services/geminiService';
import { ArticleData, AppState, ReaderTheme, ReadingHistoryItem } from './types';
import { ArticleView } from './components/ArticleView';
import { ThemeToggle } from './components/ThemeToggle';
import { auth, db, googleProvider, OperationType, handleFirestoreError } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, orderBy, limit, onSnapshot, setDoc, doc, deleteDoc, getDocs, writeBatch, getDoc, addDoc } from 'firebase/firestore';

export default function App() {
  const [url, setUrl] = useState('');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [articleData, setArticleData] = useState<ArticleData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [theme, setTheme] = useState<ReaderTheme>(ReaderTheme.LIGHT);
  const [history, setHistory] = useState<ReadingHistoryItem[]>([]);
  const [library, setLibrary] = useState<ReadingHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSharedView, setIsSharedView] = useState(false);

  // Check for shared article on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('shareId');
    if (shareId) {
      loadSharedArticle(shareId);
    }
  }, []);

  const loadSharedArticle = async (id: string) => {
    setAppState(AppState.LOADING);
    try {
      const docRef = doc(db, 'shared_articles', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as ArticleData;
        setArticleData(data);
        setIsSharedView(true);
        setAppState(AppState.READING);
      } else {
        setErrorMsg("Shared article not found.");
        setAppState(AppState.ERROR);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load shared article.");
      setAppState(AppState.ERROR);
    }
  };

  const handleShare = async (article: ArticleData) => {
    if (!user) return null;
    try {
      const docRef = await addDoc(collection(db, 'shared_articles'), {
        ...article,
        sharedBy: user.uid,
        timestamp: Date.now()
      });
      const shareUrl = `${window.location.origin}${window.location.pathname}?shareId=${docRef.id}`;
      return shareUrl;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'shared_articles');
      return null;
    }
  };

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Sync user profile
        setDoc(doc(db, 'users', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          lastLogin: Date.now()
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${u.uid}`));
        
        // Sync local history to firestore if any
        syncLocalToFirestore(u.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore listeners
  useEffect(() => {
    if (!user) {
      // Load history from local storage if not logged in
      const savedHistory = localStorage.getItem('clearview_history');
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      } else {
        setHistory([]);
      }
      setLibrary([]);
      return;
    }

    const historyQuery = query(
      collection(db, 'users', user.uid, 'history'),
      orderBy('timestamp', 'desc'),
      limit(30)
    );

    const libraryQuery = query(
      collection(db, 'users', user.uid, 'library'),
      orderBy('timestamp', 'desc')
    );

    const unsubHistory = onSnapshot(historyQuery, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ReadingHistoryItem));
      setHistory(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/history`));

    const unsubLibrary = onSnapshot(libraryQuery, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ReadingHistoryItem));
      setLibrary(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/library`));

    return () => {
      unsubHistory();
      unsubLibrary();
    };
  }, [user]);

  const syncLocalToFirestore = async (uid: string) => {
    const savedHistory = localStorage.getItem('clearview_history');
    if (!savedHistory) return;
    
    try {
      const localHistory: ReadingHistoryItem[] = JSON.parse(savedHistory);
      const batch = writeBatch(db);
      
      localHistory.forEach(item => {
        const docRef = doc(db, 'users', uid, 'history', item.id);
        batch.set(docRef, item);
      });
      
      await batch.commit();
      localStorage.removeItem('clearview_history');
    } catch (err) {
      console.error("Failed to sync local history", err);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const saveToHistory = async (article: ArticleData) => {
    const newItem: ReadingHistoryItem = {
      id: Date.now().toString(),
      url: article.url,
      title: article.title,
      author: article.author,
      siteName: article.siteName,
      timestamp: Date.now()
    };
    
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'history', newItem.id), newItem);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/history/${newItem.id}`);
      }
    } else {
      const updatedHistory = [newItem, ...history.filter(h => h.url !== article.url)].slice(0, 20);
      setHistory(updatedHistory);
      localStorage.setItem('clearview_history', JSON.stringify(updatedHistory));
    }
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
    if (isSharedView) {
      setIsSharedView(false);
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'history', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/history/${id}`);
      }
    } else {
      const newHistory = history.filter(h => h.id !== id);
      setHistory(newHistory);
      localStorage.setItem('clearview_history', JSON.stringify(newHistory));
    }
  };

  const deleteLibraryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'library', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/library/${id}`);
      }
    }
  };

  const saveToLibrary = async (article: ArticleData) => {
    if (!user) return;
    const newItem: ReadingHistoryItem = {
      id: btoa(article.url).substring(0, 20), // Stable ID based on URL
      url: article.url,
      title: article.title,
      author: article.author,
      siteName: article.siteName,
      timestamp: Date.now()
    };
    
    try {
      await setDoc(doc(db, 'users', user.uid, 'library', newItem.id), newItem);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/library/${newItem.id}`);
    }
  };

  const removeFromLibrary = async (url: string) => {
    if (!user) return;
    const id = btoa(url).substring(0, 20);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'library', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/library/${id}`);
    }
  };

  // Render Reading Mode
  if (appState === AppState.READING && articleData) {
    const isSaved = library.some(item => item.url === articleData.url);
    return (
      <ArticleView 
        article={articleData} 
        theme={theme} 
        onBack={handleBack} 
        user={user}
        isSaved={isSaved}
        isSharedView={isSharedView}
        onSaveToLibrary={() => saveToLibrary(articleData)}
        onRemoveFromLibrary={() => removeFromLibrary(articleData.url)}
        onShare={() => handleShare(articleData)}
        onLogin={handleLogin}
      />
    );
  }

  // Render Landing/Input Mode
  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${
      theme === ReaderTheme.DARK ? 'bg-gray-900 text-white' : 
      theme === ReaderTheme.SEPIA ? 'bg-sepia-50 text-sepia-900' : 'bg-gray-50 text-gray-900'
    }`}>
      
      {/* Top Bar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
        {isAuthReady && (
          user ? (
            <div className="flex items-center gap-3">
              <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-current opacity-20" />
              <button onClick={handleLogout} className="text-xs font-bold uppercase tracking-widest opacity-50 hover:opacity-100">Logout</button>
            </div>
          ) : (
            <button onClick={handleLogin} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 transition-colors">
              <LogIn size={14} />
              <span>Login</span>
            </button>
          )
        )}
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
           <div className="mt-8 p-6 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-2xl max-w-md text-center border border-red-200 dark:border-red-900/50 animate-fade-in-up shadow-sm">
              <p className="font-bold text-lg mb-2">Reading Interrupted</p>
              <p className="text-sm mb-4 opacity-90 leading-relaxed">{errorMsg}</p>
              <button 
                onClick={handleBack}
                className="text-xs font-bold uppercase tracking-widest px-6 py-2 bg-red-100 dark:bg-red-900/40 rounded-full hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
              >
                Try Another URL
              </button>
           </div>
        )}

        {/* Recent History & Library Toggles */}
        <div className="mt-16 w-full max-w-2xl animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-center gap-8 mb-6">
            <button 
              onClick={() => { setShowHistory(!showHistory); setShowLibrary(false); }}
              className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wider transition-opacity ${showHistory ? 'opacity-100 text-blue-600' : 'opacity-50 hover:opacity-100'}`}
            >
               <History size={16} />
               <span>History</span>
            </button>
            
            {user && (
              <button 
                onClick={() => { setShowLibrary(!showLibrary); setShowHistory(false); }}
                className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wider transition-opacity ${showLibrary ? 'opacity-100 text-blue-600' : 'opacity-50 hover:opacity-100'}`}
              >
                 <Bookmark size={16} />
                 <span>Read Later</span>
              </button>
            )}
          </div>

          {(showHistory || showLibrary) && (
             <div className={`rounded-xl border overflow-hidden transition-all ${
                 theme === ReaderTheme.DARK ? 'border-gray-700 bg-gray-800/50' : 
                 theme === ReaderTheme.SEPIA ? 'border-sepia-200 bg-sepia-100/50' : 'border-gray-200 bg-white'
             }`}>
                {showHistory && (
                  history.length === 0 ? (
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
                  )
                )}

                {showLibrary && (
                  library.length === 0 ? (
                      <div className="p-8 text-center opacity-40">Your library is empty</div>
                  ) : (
                      <div className="divide-y divide-opacity-10 divide-current max-h-60 overflow-y-auto">
                          {library.map((item) => (
                              <div 
                                  key={item.id}
                                  onClick={() => handleRead(item.url)}
                                  className={`p-4 flex items-center justify-between group cursor-pointer ${
                                      theme === ReaderTheme.DARK ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                                  }`}
                              >
                                  <div className="flex items-center gap-3 overflow-hidden">
                                      <div className="p-2 rounded-lg bg-current opacity-5 text-blue-600">
                                          <Bookmark size={16} />
                                      </div>
                                      <div className="min-w-0">
                                          <p className="font-medium truncate">{item.title}</p>
                                          <p className="text-xs opacity-50 truncate">{item.url}</p>
                                      </div>
                                  </div>
                                  <button 
                                      onClick={(e) => deleteLibraryItem(item.id, e)}
                                      className="p-2 rounded-full opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-red-100 hover:text-red-600 transition-all"
                                  >
                                      <X size={14} />
                                  </button>
                              </div>
                          ))}
                      </div>
                  )
                )}
             </div>
          )}
        </div>

      </div>

      <footer className="p-6 text-center opacity-30 text-xs">
         <p>Powered by Gemini 3 • Designed for clarity</p>
      </footer>
    </div>
  );
}