import React, { useState, useRef } from 'react';
import Markdown from 'react-markdown';
import { ArticleData, ReaderTheme } from '../types';
import { ArrowLeft, BookOpen, ExternalLink, MessageSquare, FileSpreadsheet, Check, Loader2, Copy, Download, Printer, Bookmark, BookmarkCheck, Share2, LogIn } from 'lucide-react';
import { askQuestionAboutArticle } from '../services/geminiService';
import { saveArticleToSheet } from '../services/sheetService';
import { User } from 'firebase/auth';

// Declaring html2pdf for TypeScript since it's loaded via script tag
declare var html2pdf: any;

interface ArticleViewProps {
  article: ArticleData;
  theme: ReaderTheme;
  onBack: () => void;
  user: User | null;
  isSaved: boolean;
  isSharedView?: boolean;
  onSaveToLibrary: () => void;
  onRemoveFromLibrary: () => void;
  onShare: () => Promise<string | null>;
  onLogin: () => void;
}

export const ArticleView: React.FC<ArticleViewProps> = ({ 
  article, 
  theme, 
  onBack, 
  user, 
  isSaved, 
  isSharedView = false,
  onSaveToLibrary, 
  onRemoveFromLibrary,
  onShare,
  onLogin
}) => {
  const [showChat, setShowChat] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const articleRef = useRef<HTMLDivElement>(null);

  const themeClasses = {
    [ReaderTheme.LIGHT]: 'bg-white text-gray-900',
    [ReaderTheme.DARK]: 'bg-gray-900 text-gray-200',
    [ReaderTheme.SEPIA]: 'bg-[#fbf7f0] text-[#3e3223]',
  };

  const proseClasses = {
    [ReaderTheme.LIGHT]: 'prose-stone prose-lg',
    [ReaderTheme.DARK]: 'prose-invert prose-lg',
    [ReaderTheme.SEPIA]: 'prose-stone prose-lg marker:text-sepia-800 prose-headings:text-sepia-900 prose-a:text-sepia-900',
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setIsAsking(true);
    try {
        const result = await askQuestionAboutArticle(article.content, question);
        setAnswer(result);
    } catch (err) {
        setAnswer("Failed to get answer.");
    } finally {
        setIsAsking(false);
    }
  };

  const handleSaveToSheet = async () => {
    setIsSaving(true);
    try {
        await saveArticleToSheet(article);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
        alert("Failed to save to Sheet.");
    } finally {
        setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
        await navigator.clipboard.writeText(`# ${article.title}\n\n${article.content}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    } catch (err) { /* ignore */ }
  };

  const handleNativePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (!user) {
      alert("Please login to share articles publicly.");
      return;
    }
    if (isSharing) return;
    setIsSharing(true);
    const url = await onShare();
    if (url) {
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 3000);
      } catch (err) {
        console.error("Failed to copy share URL", err);
      }
    }
    setIsSharing(false);
  };

  const handleSaveToggle = () => {
    if (!user) {
      alert("Please login to save articles to your library.");
      return;
    }
    if (isSaved) {
      onRemoveFromLibrary();
    } else {
      onSaveToLibrary();
    }
  };

  const handleExportPDF = async () => {
    if (!articleRef.current) return;
    
    setIsExporting(true);
    
    // Ensure all images are loaded
    const images = articleRef.current.getElementsByTagName('img');
    const promises = Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    });
    
    await Promise.all(promises);
    
    // Small delay to ensure rendering is complete
    await new Promise(resolve => setTimeout(resolve, 500));

    const filename = `${article.title.substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
    
    const element = articleRef.current;
    const opt = {
      margin: [0.5, 0.5],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        allowTaint: true, 
        letterRendering: true,
        logging: false,
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      if (typeof html2pdf !== 'undefined') {
        await html2pdf().set(opt).from(element).save();
      } else {
        throw new Error("html2pdf library not loaded");
      }
    } catch (err) {
      console.warn("Library PDF failed, falling back to print", err);
      window.print();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 ${themeClasses[theme]}`}>
      {/* Reader Navbar */}
      <div className="sticky top-0 z-30 backdrop-blur-md border-b print:hidden border-gray-200 dark:border-gray-800 transition-colors">
        <div className={`max-w-5xl mx-auto px-4 h-16 flex items-center justify-between ${theme === ReaderTheme.DARK ? 'bg-gray-900/80' : 'bg-white/80'}`}>
          <button onClick={onBack} className="flex items-center space-x-2 opacity-70 hover:opacity-100 font-medium">
            <ArrowLeft size={20} />
            <span className="hidden sm:inline">Back</span>
          </button>
          
          <div className="flex items-center space-x-1">
             {!user && (
               <button 
                 onClick={onLogin}
                 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-blue-600 text-white px-3 py-1.5 rounded-full hover:bg-blue-700 transition-colors mr-2"
               >
                 <LogIn size={14} />
                 <span className="hidden sm:inline">Login</span>
               </button>
             )}
             {user && (
               <div className="flex items-center gap-2 mr-2 opacity-50">
                 <img src={user.photoURL || ''} alt="" className="w-6 h-6 rounded-full border border-current opacity-20" />
               </div>
             )}
             {!isSharedView && (
               <button 
                 onClick={handleShare}
                 disabled={isSharing}
                 className={`p-2 rounded-lg transition-colors ${shareSuccess ? 'text-green-500' : 'hover:bg-black/5 dark:hover:bg-white/10'} ${!user ? 'opacity-40' : ''}`}
                 title={user ? "Share Public Link" : "Login to share"}
               >
                  {isSharing ? <Loader2 size={20} className="animate-spin" /> : shareSuccess ? <Check size={20} /> : <Share2 size={20} />}
               </button>
             )}
             <button 
               onClick={handleSaveToggle} 
               className={`p-2 rounded-lg transition-colors ${isSaved ? 'text-blue-600' : 'hover:bg-black/5 dark:hover:bg-white/10'} ${!user ? 'opacity-40' : ''}`}
               title={!user ? "Login to save" : isSaved ? "Remove from Read Later" : "Save for Later"}
             >
                {isSaved ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
             </button>
             <button onClick={handleCopy} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10" title="Copy Text">
                {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
             </button>
             <button onClick={handleNativePrint} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10" title="Print Selection">
                <Printer size={20} />
             </button>
             <button onClick={handleExportPDF} disabled={isExporting} className={`p-2 rounded-lg ${isExporting ? 'text-blue-500' : 'hover:bg-black/5 dark:hover:bg-white/10'}`} title="Save as PDF">
                {isExporting ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
             </button>
             <button onClick={() => setShowChat(!showChat)} className={`p-2 rounded-lg transition-colors ${showChat ? 'bg-blue-600 text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>
                <MessageSquare size={20} />
             </button>
             <a href={article.url} target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
               <ExternalLink size={20} />
             </a>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div ref={articleRef} className="pdf-source">
            {/* Header Content */}
            <header className="mb-12 border-b border-gray-200 dark:border-gray-800 pb-8">
                {isSharedView && (
                  <div className="mb-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex items-center gap-3 text-sm text-blue-700 dark:text-blue-300 print:hidden">
                    <Share2 size={18} />
                    <span>You are viewing a shared article. <button onClick={onBack} className="font-bold underline">Go back home</button> to read your own.</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-3 mb-8 print:hidden">
                    <button onClick={handleSaveToSheet} disabled={isSaving || saveSuccess} className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700">
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : saveSuccess ? <Check size={16} /> : <FileSpreadsheet size={16} />}
                        <span>{isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Add to Sheets'}</span>
                    </button>
                </div>

                <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6 leading-tight tracking-tight print:text-black">
                    {article.title}
                </h1>
                
                <div className="flex flex-wrap items-center gap-4 text-sm font-medium opacity-70 uppercase tracking-widest print:text-gray-600">
                    {article.author && <span>By {article.author}</span>}
                    {article.siteName && <span>• {article.siteName}</span>}
                    <span className="hidden sm:inline">•</span>
                    <span className="flex items-center gap-1"><BookOpen size={14} /> ClearView</span>
                </div>
            </header>

            {/* AI Interaction Drawer */}
            {showChat && (
                <div className="mb-10 p-6 rounded-2xl border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10 print:hidden">
                    <form onSubmit={handleAsk} className="flex gap-2 mb-4">
                        <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask Gemini something..." className="flex-1 px-4 py-2 rounded-lg border dark:bg-gray-800 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none" />
                        <button type="submit" disabled={isAsking} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium">{isAsking ? '...' : 'Ask'}</button>
                    </form>
                    {answer && <div className="p-4 bg-white dark:bg-gray-800 rounded-lg text-sm shadow-sm prose-sm dark:prose-invert"><Markdown>{answer}</Markdown></div>}
                </div>
            )}

            {/* Main Article Body */}
            <article className={`prose ${proseClasses[theme]} max-w-none font-serif pb-20 print:text-black print:max-w-full`}>
                <Markdown 
                    components={{
                        h2: ({node, ...props}) => <h2 className="text-2xl font-serif font-bold mt-10 mb-4" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-xl font-serif font-bold mt-8 mb-3" {...props} />,
                        p: ({node, children, ...props}) => {
                            const hasImage = React.Children.toArray(children).some(
                                (child) => React.isValidElement(child) && (child as any).type === 'img'
                            );
                            if (hasImage) return <div className="mb-6" {...props}>{children}</div>;
                            return <p className="mb-6 leading-relaxed text-xl font-serif" {...props}>{children}</p>;
                        },
                        a: ({node, ...props}) => <a className="text-blue-600 dark:text-blue-400 underline" target="_blank" {...props} />,
                        img: ({node, ...props}) => (
                            <div className="my-10 flex flex-col items-center">
                                <img 
                                    className="rounded-xl shadow-lg w-full max-h-[600px] object-contain bg-gray-50 dark:bg-gray-800" 
                                    loading="lazy"
                                    crossOrigin="anonymous" 
                                    onError={(e) => { 
                                        const img = e.target as HTMLImageElement;
                                        if (img.crossOrigin === 'anonymous') {
                                            img.removeAttribute('crossOrigin');
                                        } else {
                                            img.style.display = 'none'; 
                                        }
                                    }}
                                    {...props} 
                                />
                                {props.alt && <span className="text-sm mt-3 opacity-50 italic">{props.alt}</span>}
                            </div>
                        ),
                        blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 pl-6 italic my-8 opacity-80" {...props} />
                    }}
                >
                    {article.content}
                </Markdown>
            </article>

            {/* Verification Footer */}
            {article.sources && article.sources.length > 0 && (
                <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800 print:border-gray-300">
                    <h4 className="text-xs font-bold uppercase tracking-widest opacity-40 mb-4">Verified Sources</h4>
                    <ul className="space-y-1">
                        {article.sources.map((s, i) => (
                            <li key={i}><a href={s.uri} target="_blank" rel="noreferrer" className="text-sm opacity-60 hover:opacity-100 truncate block">{s.title}</a></li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
      </main>
    </div>
  );
};
