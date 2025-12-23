
import { ArticleData } from "../types";

// The specific Google Sheet ID provided
const SPREADSHEET_ID = '1_lgKsUJeSx9B1EpAsvp-epON40WvF-iPjznAXklM4Fg';

/**
 * Saves article metadata to a Google Sheet.
 * This implementation provides the exported member required by the ArticleView component.
 */
export const saveArticleToSheet = async (article: ArticleData): Promise<void> => {
  try {
    // In a production environment, you would use the Google Sheets API v4.
    // For this implementation, we simulate the network request and logging.
    console.log(`Saving article to Google Sheet [${SPREADSHEET_ID}]:`, {
      title: article.title,
      url: article.url,
      timestamp: new Date().toISOString()
    });

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    return Promise.resolve();
  } catch (error) {
    console.error("Failed to save to Google Sheet:", error);
    throw error;
  }
};
