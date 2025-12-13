export interface ArticleData {
  title: string;
  content: string; // Markdown content
  author?: string;
  siteName?: string;
  url: string;
  summary?: string;
  sources?: Array<{
    title: string;
    uri: string;
  }>;
}

export enum ReaderTheme {
  LIGHT = 'light',
  DARK = 'dark',
  SEPIA = 'sepia'
}

export enum AppState {
  IDLE = 'idle',
  LOADING = 'loading',
  READING = 'reading',
  ERROR = 'error'
}

export interface ReadingHistoryItem {
  id: string;
  url: string;
  title: string;
  timestamp: number;
}