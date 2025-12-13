import React from 'react';
import { ReaderTheme } from '../types';
import { Sun, Moon, Coffee } from 'lucide-react';

interface ThemeToggleProps {
  currentTheme: ReaderTheme;
  onThemeChange: (theme: ReaderTheme) => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ currentTheme, onThemeChange }) => {
  return (
    <div className="flex items-center bg-gray-200 dark:bg-gray-800 rounded-full p-1 shadow-inner">
      <button
        onClick={() => onThemeChange(ReaderTheme.LIGHT)}
        className={`p-2 rounded-full transition-all ${
          currentTheme === ReaderTheme.LIGHT
            ? 'bg-white text-yellow-600 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        title="Light Mode"
      >
        <Sun size={18} />
      </button>
      <button
        onClick={() => onThemeChange(ReaderTheme.SEPIA)}
        className={`p-2 rounded-full transition-all ${
          currentTheme === ReaderTheme.SEPIA
            ? 'bg-[#f5eeda] text-[#5c4b37] shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        title="Sepia Mode"
      >
        <Coffee size={18} />
      </button>
      <button
        onClick={() => onThemeChange(ReaderTheme.DARK)}
        className={`p-2 rounded-full transition-all ${
          currentTheme === ReaderTheme.DARK
            ? 'bg-gray-700 text-blue-200 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        title="Dark Mode"
      >
        <Moon size={18} />
      </button>
    </div>
  );
};