import { ArticleData } from "../types";

// The specific Google Sheet ID provided
const SPREADSHEET_ID = '1_lgKsUJeSx9B1EpAsvp-epON40WvF-iPjznAXklM4Fg';
const STORAGE_KEY_CLIENT_ID = 'clearview_google_client_id';

// GLOBAL CONFIGURATION
// To make this work, you need a Client ID from Google Cloud Console (https://console.cloud.google.com/)
// 1. Create a project
// 2. Enable "Google Sheets API"
// 3. Create OAuth 2.0 Client ID (Web Application)
// 4. Add your domain (or localhost) to "Authorized JavaScript origins"

// Check env var, then local storage, then default to empty
let activeClientId = process.env.GOOGLE_CLIENT_ID || '';
if (!activeClientId && typeof window !== 'undefined') {
  activeClientId = localStorage.getItem(STORAGE_KEY_CLIENT_ID) || '';
}

const API_KEY = process.env.API_KEY || ''; 

// Scopes needed
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

declare var gapi: any;
declare var google: any;

let tokenClient: any;
let gapiInited = false;

/**
 * Initialize the Google API Client
 * @param clientId Optional client ID to use if initializing late
 */
export const initializeGoogleApi = async (clientId?: string) => {
  if (clientId) {
      activeClientId = clientId;
      localStorage.setItem(STORAGE_KEY_CLIENT_ID, clientId);
  }

  return new Promise<void>((resolve, reject) => {
    // Wait for scripts to load if they haven't yet
    const checkScripts = () => {
        if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
            loadClients();
        } else {
            setTimeout(checkScripts, 100);
        }
    };

    const loadClients = () => {
        gapi.load('client', async () => {
          try {
            // 1. Initialize GAPI (if not already done)
            if (!gapiInited) {
                await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
                });
                gapiInited = true;
            }
            
            // 2. Initialize GIS Token Client (if we have an ID)
            if (activeClientId) {
                // If tokenClient already exists but with a different ID (unlikely) or just to be safe
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: activeClientId,
                    scope: SCOPES,
                    callback: '', // defined at request time
                });
            }
            
            resolve();
          } catch (err) {
            console.error("Error initializing Google API", err);
            reject(err);
          }
        });
    };

    checkScripts();
  });
};

/**
 * Extracts links from Markdown content in the format [Text](URL)
 */
const extractLinksFromMarkdown = (markdown: string): string => {
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: string[] = [];
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    // match[1] is Text, match[2] is URL
    links.push(`${match[1]}: ${match[2]}`);
  }
  
  if (links.length === 0) return "No links found";
  return links.join('\n');
};

/**
 * Main function to save article to sheet
 */
export const saveArticleToSheet = async (article: ArticleData): Promise<void> => {
  // 1. Check for Client ID
  if (!activeClientId) {
    const userClientId = window.prompt("Google Client ID is required for Sheets integration.\n\nPlease paste your OAuth 2.0 Client ID (from Google Cloud Console):");
    if (!userClientId) {
        throw new Error("Client ID is required to save to Sheets.");
    }
    activeClientId = userClientId.trim();
    localStorage.setItem(STORAGE_KEY_CLIENT_ID, activeClientId);
    
    // Force re-initialization with the new ID
    await initializeGoogleApi(activeClientId);
  } else {
    // Standard initialization check
    await initializeGoogleApi();
  }

  // 2. Verify Token Client exists
  if (!tokenClient) {
      // Attempt one last time with current ID
      await initializeGoogleApi(activeClientId);
      if (!tokenClient) {
          // If still failing, maybe the ID was invalid or something went wrong.
          // Allow user to reset.
          const reset = window.confirm("Failed to initialize with current Client ID. Would you like to reset it?");
          if (reset) {
              localStorage.removeItem(STORAGE_KEY_CLIENT_ID);
              activeClientId = '';
              throw new Error("Client ID reset. Please try again.");
          }
          throw new Error("Failed to initialize Google Auth Client.");
      }
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = async (resp: any) => {
      if (resp.error) {
        console.error("Auth Error:", resp);
        reject(resp);
        return;
      }
      
      try {
        const linksText = extractLinksFromMarkdown(article.content);
        
        // Prepare row data: Title, Original Link, Full article, Links in the Article
        const values = [
          [
            article.title,
            article.url,
            article.content,
            linksText
          ]
        ];

        const response = await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Sheet1!A:D', // Assuming Sheet1 and appending to columns A-D
          valueInputOption: 'USER_ENTERED',
          resource: {
            values,
          },
        });

        console.log('Sheet append response', response);
        resolve();
      } catch (err) {
        console.error("Error appending to sheet", err);
        reject(err);
      }
    };

    // Request token (triggers popup if needed)
    // tokenClient is guaranteed to exist here due to checks above
    if (gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
      tokenClient.requestAccessToken({prompt: ''});
    }
  });
};
