import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArticleData, ReaderTheme } from '../types';
import { ArrowLeft, BookOpen, ExternalLink, MessageSquare, FileSpreadsheet, Check, Loader2, Copy, Download } from 'lucide-react';
import { askQuestionAboutArticle } from '../services/geminiService';
import { saveArticleToSheet } from '../services/sheetService';

interface ArticleViewProps {
  article: ArticleData;
  theme: ReaderTheme;
  onBack: () => void;
}

export const ArticleView: React.FC<ArticleViewProps> = ({ article, theme, onBack }) => {
  const [showChat, setShowChat] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  
  // Sheet saving states
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Copy state
  const [copied, setCopied] = useState(false);

  // Theme configuration
  const themeClasses = {
    [ReaderTheme.LIGHT]: 'bg-white text-gray-900 selection:bg-yellow-200',
    [ReaderTheme.DARK]: 'bg-gray-900 text-gray-300 selection:bg-blue-900',
    [ReaderTheme.SEPIA]: 'bg-sepia-50 text-sepia-900 selection:bg-sepia-200',
  };

  const proseClasses = {
    [ReaderTheme.LIGHT]: 'prose-stone prose-lg',
    [ReaderTheme.DARK]: 'prose-invert prose-lg',
    [ReaderTheme.SEPIA]: 'prose-stone prose-lg marker:text-sepia-800 prose-headings:text-sepia-900 prose-a:text-sepia-800',
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    
    setIsAsking(true);
    setAnswer('');
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
        console.error(error);
        if (error.message === 'CANCELLED_BY_USER') {
            return;
        }
        alert("Failed to save to Google Sheet. " + (error.message || "Ensure popups are allowed."));
    } finally {
        setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
        const textToCopy = `# ${article.title}\n\n${article.content}`;
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    } catch (err) {
        console.error('Failed to copy', err);
    }
  };

  /**
   * Triggers the browser print dialog. 
   * Most modern browsers allow "Save as PDF" within this dialog.
   */
  const handleExportPDF = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 1. Ensure the window has focus (critical for some iframe-based previews)
    window.focus();

    // 2. Prepare the filename by changing the document title
    const originalTitle = document.title;
    try {
      const words = (article.title || 'Article').split(/\s+/).filter(w => w.length > 0);
      document.title = words.slice(0, 6).join(' ');
      
      // 3. Trigger the native print dialog
      // This is the most reliable "Export to PDF" strategy on the web.
      window.print();
    } catch (err) {
      console.error("Print failed", err);
      alert("Print dialog could not be opened. Check if your browser is blocking popups/dialogs.");
    } finally {
      // 4. Restore the original title after a short delay
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 ${themeClasses[theme]} print:bg-white print:text-black`}>
      {/* Navbar for Reader */}
      <div className={`sticky top-0 z-20 backdrop-blur-md border-b print:hidden ${
          theme === ReaderTheme.DARK ? 'border-gray-800 bg-gray-900/80' : 
          theme === ReaderTheme.SEPIA ? 'border-sepia-200 bg-sepia-50/80' : 'border-gray-200 bg-white/80'
      }`}>
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <button 
            onClick={onBack}
            className="flex items-center space-x-2 opacity-70 hover:opacity-100 transition-opacity font-medium"
          >
            <ArrowLeft size={20} />
            <span>Back</span>
          </button>
          
          <div className="flex items-center space-x-2 md:space-x-4">
             <button
                onClick={handleCopy}
                className={`p-2 rounded-lg transition-colors ${
                    copied 
                    ? 'text-green-600 bg-green-50' 
                    : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title="Copy Article Markdown"
             >
                {copied ? <Check size={20} /> : <Copy size={20} />}
             </button>

             <button
                onClick={handleExportPDF}
                className="p-2 rounded-lg opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                title="Print / Save as PDF"
             >
                <Download size={20} />
             </button>

             <button
                onClick={() => setShowChat(!showChat)}
                className={`p-2 rounded-lg transition-colors ${
                    showChat 
                    ? 'bg-blue-500 text-white' 
                    : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title="Ask AI"
             >
                <MessageSquare size={20} />
             </button>
             <a 
                href={article.url} 
                target="_blank" 
                rel="noreferrer"
                className="p-2 rounded-lg opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all"
                title="Open Original"
             >
               <ExternalLink size={20} />
             </a>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-12 animate-fade-in-up">
        {/* PDF-Only Header (Hidden in Browser) */}
        <div className="hidden print:block mb-8 pb-4 border-b border-gray-200 text-sm text-blue-600 font-sans break-all">
          <span className="font-bold text-gray-500 mr-2">Source URL:</span>
          <span className="underline">{article.url}</span>
        </div>

        {/* Header Info */}
        <header className="mb-12 border-b border-opacity-20 pb-8 border-current print:border-black">
          
          {/* Action Buttons Row */}
          <div className="mb-8 flex flex-wrap gap-3 print:hidden">
            <button
                onClick={handleSaveToSheet}
                disabled={isSaving || saveSuccess}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all cursor-pointer shadow-sm active:scale-95 ${
                    saveSuccess 
                        ? 'bg-green-100 text-green-700 border border-green-200'
                        : theme === ReaderTheme.DARK
                            ? 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white'
                            : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'
                }`}
            >
                {isSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                ) : saveSuccess ? (
                    <Check size={16} />
                ) : (
                    <FileSpreadsheet size={16} className="text-green-600" />
                )}
                <span>
                    {isSaving ? 'Saving...' : saveSuccess ? 'Saved to Sheet' : 'Save to Google Sheet'}
                </span>
            </button>

            {/* Main Export PDF Button */}
            <button
                onClick={handleExportPDF}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all cursor-pointer shadow-sm active:scale-95 ${
                    theme === ReaderTheme.DARK
                        ? 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-500'
                        : 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-500'
                }`}
            >
                <Download size={16} />
                <span>Export as PDF</span>
            </button>
          </div>

          <h1 className={`text-4xl md:text-5xl font-serif font-bold mb-6 leading-tight tracking-tight print:text-black`}>
            {article.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm font-medium opacity-70 font-sans uppercase tracking-wider print:text-gray-600 print:opacity-100">
            {article.author && (
                <div className="flex items-center">
                    <span>By {article.author}</span>
                </div>
            )}
            {article.siteName && (
                <>
                    <span>•</span>
                    <span>{article.siteName}</span>
                </>
            )}
            <span className="print:hidden">•</span>
            <span className="flex items-center gap-1 print:hidden">
                <BookOpen size={14} />
                AI Enhanced
            </span>
          </div>
        </header>

        {/* AI Chat Drawer */}
        {showChat && (
            <div className={`mb-10 p-6 rounded-2xl shadow-lg border print:hidden ${
                theme === ReaderTheme.DARK ? 'bg-gray-800 border-gray-700' : 
                theme === ReaderTheme.SEPIA ? 'bg-sepia-100 border-sepia-200' : 'bg-blue-50 border-blue-100'
            }`}>
                <h3 className="font-bold mb-4 flex items-center gap-2">
                    <MessageSquare size={18} />
                    Ask Gemini about this article
                </h3>
                <form onSubmit={handleAsk} className="flex gap-2 mb-4">
                    <input 
                        type="text" 
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="e.g. What is the main argument?"
                        className={`flex-1 px-4 py-2 rounded-lg border focus:ring-2 focus:outline-none ${
                            theme === ReaderTheme.DARK 
                            ? 'bg-gray-700 border-gray-600 focus:ring-blue-500' 
                            : 'bg-white border-gray-300 focus:ring-blue-400'
                        }`}
                    />
                    <button 
                        type="submit" 
                        disabled={isAsking}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 font-medium"
                    >
                        {isAsking ? '...' : 'Ask'}
                    </button>
                </form>
                {answer && (
                    <div className={`p-4 rounded-lg text-sm leading-relaxed ${
                         theme === ReaderTheme.DARK ? 'bg-gray-900' : 'bg-white/50'
                    }`}>
                        <ReactMarkdown>{answer}</ReactMarkdown>
                    </div>
                )}
            </div>
        )}

        {/* Main Content */}
        <article className={`prose ${proseClasses[theme]} max-w-none font-serif pb-20 print:prose-stone print:text-black print:max-w-full`}>
          <ReactMarkdown 
            components={{
              h1: ({node, ...props}) => <h2 className="text-3xl font-bold mt-12 mb-6" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-2xl font-bold mt-10 mb-5" {...props} />,
              p: ({node, ...props}) => <p className="mb-6 leading-8 text-xl" {...props} />,
              a: ({node, ...props}) => (
                <a 
                    className={`underline decoration-2 underline-offset-2 transition-colors ${
                        theme === ReaderTheme.DARK ? 'text-blue-400 decoration-blue-400/30 hover:decoration-blue-400' : 
                        theme === ReaderTheme.SEPIA ? 'text-sepia-900 decoration-sepia-900/30 hover:decoration-sepia-900 font-medium' : 
                        'text-blue-700 decoration-blue-700/30 hover:decoration-blue-700'
                    } print:text-black print:no-underline`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    {...props} 
                />
              ),
              blockquote: ({node, ...props}) => (
                <blockquote className={`border-l-4 pl-6 italic my-8 ${
                    theme === ReaderTheme.SEPIA ? 'border-sepia-400 text-sepia-800' : 'border-blue-500 opacity-80'
                } print:border-gray-300 print:text-gray-700`} {...props} />
              ),
              img: ({node, ...props}) => (
                 // eslint-disable-next-line jsx-a11y/alt-text
                 <img className="rounded-xl shadow-md my-8 w-full object-cover max-h-[500px] print:shadow-none print:rounded-none" {...props} />
              )
            }}
          >
            {article.content}
          </ReactMarkdown>
        </article>

        {/* Sources Footer */}
        {article.sources && article.sources.length > 0 && (
            <div className={`mt-12 pt-8 border-t print:hidden ${theme === ReaderTheme.DARK ? 'border-gray-800' : 'border-gray-200'}`}>
                <h4 className="text-sm font-bold uppercase tracking-wider opacity-60 mb-4">Sources Found</h4>
                <ul className="space-y-2">
                    {article.sources.map((source, idx) => (
                        <li key={idx}>
                            <a href={source.uri} target="_blank" rel="noreferrer" className="text-sm hover:underline opacity-70 hover:opacity-100 truncate block">
                                {source.title}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        )}
      </main>
    </div>
  );
};