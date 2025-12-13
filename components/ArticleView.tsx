import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArticleData, ReaderTheme } from '../types';
import { ArrowLeft, BookOpen, ExternalLink, MessageSquare } from 'lucide-react';
import { askQuestionAboutArticle } from '../services/geminiService';

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

  return (
    <div className={`min-h-screen transition-colors duration-500 ${themeClasses[theme]}`}>
      {/* Navbar for Reader */}
      <div className={`sticky top-0 z-20 backdrop-blur-md border-b ${
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
          
          <div className="flex items-center space-x-4">
             <button
                onClick={() => setShowChat(!showChat)}
                className={`p-2 rounded-lg transition-colors ${showChat ? 'bg-blue-500 text-white' : 'hover:bg-black/5'}`}
                title="Ask AI"
             >
                <MessageSquare size={20} />
             </button>
             <a 
                href={article.url} 
                target="_blank" 
                rel="noreferrer"
                className="opacity-50 hover:opacity-100 transition-opacity"
                title="Open Original"
             >
               <ExternalLink size={20} />
             </a>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-12 animate-fade-in-up">
        {/* Header Info */}
        <header className="mb-12 border-b border-opacity-20 pb-8 border-current">
          <h1 className={`text-4xl md:text-5xl font-serif font-bold mb-6 leading-tight tracking-tight`}>
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
            <span>•</span>
            <span className="flex items-center gap-1">
                <BookOpen size={14} />
                AI Enhanced
            </span>
          </div>
        </header>

        {/* AI Chat Drawer */}
        {showChat && (
            <div className={`mb-10 p-6 rounded-2xl shadow-lg border ${
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
        <article className={`prose ${proseClasses[theme]} max-w-none font-serif pb-20`}>
          <ReactMarkdown 
            components={{
              h1: ({node, ...props}) => <h2 className="text-3xl font-bold mt-12 mb-6" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-2xl font-bold mt-10 mb-5" {...props} />,
              p: ({node, ...props}) => <p className="mb-6 leading-8 text-xl" {...props} />,
              a: ({node, ...props}) => <a className="underline decoration-2 underline-offset-4 opacity-80 hover:opacity-100" {...props} />,
              blockquote: ({node, ...props}) => (
                <blockquote className={`border-l-4 pl-6 italic my-8 ${
                    theme === ReaderTheme.SEPIA ? 'border-sepia-400 text-sepia-800' : 'border-blue-500 opacity-80'
                }`} {...props} />
              ),
              img: ({node, ...props}) => (
                 // eslint-disable-next-line jsx-a11y/alt-text
                 <img className="rounded-xl shadow-md my-8 w-full object-cover max-h-[500px]" {...props} />
              )
            }}
          >
            {article.content}
          </ReactMarkdown>
        </article>

        {/* Sources Footer */}
        {article.sources && article.sources.length > 0 && (
            <div className={`mt-12 pt-8 border-t ${theme === ReaderTheme.DARK ? 'border-gray-800' : 'border-gray-200'}`}>
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