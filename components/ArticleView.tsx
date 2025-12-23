import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArticleData, ReaderTheme } from '../types';
import { ArrowLeft, BookOpen, ExternalLink, MessageSquare, FileSpreadsheet, Check, Loader2, Copy, Download, FileText } from 'lucide-react';
import { askQuestionAboutArticle } from '../services/geminiService';
import { saveArticleToSheet } from '../services/sheetService';

// Declaring html2pdf for TypeScript since it's loaded via script tag
declare var html2pdf: any;

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
  
  // States for actions
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const articleRef = useRef<HTMLElement>(null);

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
        if (error.message === 'CANCELLED_BY_USER') return;
        alert("Failed to save to Google Sheet. Ensure popups are allowed.");
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

  const handleDownloadMD = () => {
    const filename = `${article.title.substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    const blob = new Blob([`# ${article.title}\n\nSource: ${article.url}\n\n${article.content}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Generates and downloads a PDF using html2pdf.js.
   * This is much more reliable than window.print() for sandboxed environments.
   */
  const handleExportPDF = async () => {
    if (!articleRef.current) return;
    
    setIsExporting(true);
    
    // Configure PDF options
    const filename = `${article.title.substring(0, 40).replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
    
    // Use a cloned element for PDF generation to apply specific print styles if needed
    const element = articleRef.current;
    const opt = {
      margin: 0.75,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    try {
      // html2pdf is globally available from the script tag in index.html
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Try 'Download MD' or 'Print' instead.");
      // Fallback to native print if library fails
      window.print();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 ${themeClasses[theme]}`}>
      {/* Navbar for Reader */}
      <div className="sticky top-0 z-20 backdrop-blur-md border-b print:hidden border-gray-200 dark:border-gray-800 bg-opacity-80 transition-colors duration-300">
        <div className={`max-w-4xl mx-auto px-4 h-16 flex items-center justify-between ${theme === ReaderTheme.DARK ? 'bg-gray-900/80' : theme === ReaderTheme.SEPIA ? 'bg-sepia-50/80' : 'bg-white/80'}`}>
          <button 
            onClick={onBack}
            className="flex items-center space-x-2 opacity-70 hover:opacity-100 transition-opacity font-medium"
          >
            <ArrowLeft size={20} />
            <span>Back</span>
          </button>
          
          <div className="flex items-center space-x-1 md:space-x-3">
             <button
                onClick={handleCopy}
                className={`p-2 rounded-lg transition-colors ${
                    copied 
                    ? 'text-green-600 bg-green-50' 
                    : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title="Copy Markdown"
             >
                {copied ? <Check size={20} /> : <Copy size={20} />}
             </button>

             <button
                onClick={handleDownloadMD}
                className="p-2 rounded-lg opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                title="Download Markdown (.md)"
             >
                <FileText size={20} />
             </button>

             <button
                onClick={handleExportPDF}
                disabled={isExporting}
                className={`p-2 rounded-lg transition-colors ${
                    isExporting ? 'animate-pulse text-blue-500' : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title="Save as PDF"
             >
                {isExporting ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
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
        {/* PDF Wrapper - this is what gets exported */}
        <div ref={articleRef} className="pdf-container">
            {/* PDF-Only Header (Hidden in Browser) */}
            <div className="hidden print:block mb-8 pb-4 border-b border-gray-200 text-sm text-blue-600 font-sans break-all">
                <span className="font-bold text-gray-500 mr-2">Source URL:</span>
                <span className="underline">{article.url}</span>
            </div>

            {/* Header Info */}
            <header className="mb-12 border-b border-opacity-20 pb-8 border-current">
                {/* Print-Hidden Action Buttons */}
                <div className="mb-8 flex flex-wrap gap-3 print:hidden">
                    <button
                        onClick={handleSaveToSheet}
                        disabled={isSaving || saveSuccess}
                        className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all shadow-sm active:scale-95 ${
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
                        <span>{isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save to Sheet'}</span>
                    </button>

                    <button
                        onClick={handleExportPDF}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95 disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        <span>{isExporting ? 'Generating PDF...' : 'Save as PDF'}</span>
                    </button>
                </div>

                <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6 leading-tight tracking-tight">
                    {article.title}
                </h1>
                
                <div className="flex flex-wrap items-center gap-4 text-sm font-medium opacity-70 font-sans uppercase tracking-wider">
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
                        ClearView Reader
                    </span>
                </div>
            </header>

            {/* AI Chat Drawer - Printed Only if Answer exists or hidden entirely */}
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
                            placeholder="e.g. Summarize the key takeaways"
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
            <article className={`prose ${proseClasses[theme]} max-w-none font-serif pb-20 print:text-black`}>
                <ReactMarkdown 
                    components={{
                        h1: ({node, ...props}) => <h2 className="text-3xl font-bold mt-12 mb-6" {...props} />,
                        h2: ({node, ...props}) => <h2 className="text-2xl font-bold mt-10 mb-5" {...props} />,
                        p: ({node, ...props}) => <p className="mb-6 leading-8 text-xl" {...props} />,
                        a: ({node, ...props}) => (
                            <a 
                                className={`underline decoration-2 underline-offset-2 ${
                                    theme === ReaderTheme.DARK ? 'text-blue-400' : 
                                    theme === ReaderTheme.SEPIA ? 'text-sepia-900 font-medium' : 'text-blue-700'
                                } print:text-black print:no-underline`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                {...props} 
                            />
                        ),
                        blockquote: ({node, ...props}) => (
                            <blockquote className={`border-l-4 pl-6 italic my-8 ${
                                theme === ReaderTheme.SEPIA ? 'border-sepia-400 text-sepia-800' : 'border-blue-500 opacity-80'
                            } print:border-gray-300`} {...props} />
                        ),
                        img: ({node, ...props}) => (
                            <img className="rounded-xl shadow-md my-8 w-full object-cover max-h-[500px] print:shadow-none" {...props} />
                        )
                    }}
                >
                    {article.content}
                </ReactMarkdown>
            </article>

            {/* Sources Footer */}
            {article.sources && article.sources.length > 0 && (
                <div className={`mt-12 pt-8 border-t print:border-gray-200 ${theme === ReaderTheme.DARK ? 'border-gray-800' : 'border-gray-200'}`}>
                    <h4 className="text-sm font-bold uppercase tracking-wider opacity-60 mb-4">Reconstruction Sources</h4>
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
        </div>
      </main>
    </div>
  );
};