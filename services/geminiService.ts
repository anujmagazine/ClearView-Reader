import { GoogleGenAI } from "@google/genai";
import { ArticleData } from "../types";

const apiKey = process.env.API_KEY || '';

// Initialize the client
const ai = new GoogleGenAI({ apiKey });

/**
 * Fetches and reconstructs an article using Gemini with Google Search Grounding.
 * This effectively bypasses friction by finding the content via search index.
 */
export const fetchArticleContent = async (url: string): Promise<ArticleData> => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please set process.env.API_KEY.");
  }

  const modelId = "gemini-2.5-flash"; // Use flash for speed and search capability

  // Refined prompt to better handle paywalls by looking for alternative sources
  const prompt = `
    I need to read the full content of the article located at this URL: ${url}

    Your goal is to reconstruct the *full* reading experience, bypassing any paywalls, popups, or login screens by finding the content elsewhere on the web if the direct link is blocked.

    Step 1: SEARCH STRATEGY
    - Search for the specific URL first.
    - CRITICAL: Search for the *Title* of the article (deduced from the URL slug) to find syndicated versions on free platforms (e.g., MSN, Yahoo Finance, LinkedIn articles, or re-blogs).
    - Search for "archive.is [URL]" or "cache:[URL]" to find preserved full-text versions.

    Step 2: CONTENT RECONSTRUCTION
    - If you find the full text (original or syndicated), format it as clean, readable Markdown.
    - If the text is split across multiple search snippets or pages, stitch it together coherently.
    - If the article is strictly paywalled and NO full version exists: Write a "Comprehensive Deep-Dive Report". This must be a long-form detailed piece (not a short summary) that covers every single argument, data point, and section of the original article based on all available search data, reviews, and discussion threads.

    Step 3: OUTPUT FORMAT
    Return the output strictly as a JSON object inside a JSON code block. 
    Structure:
    \`\`\`json
    {
      "title": "Article Title",
      "author": "Author Name (or 'Unknown')",
      "siteName": "Source Website",
      "content": "# Full Markdown Content Here..."
    }
    \`\`\`
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // responseMimeType: "application/json" is NOT supported with googleSearch
      },
    });

    let responseText = response.text;
    if (!responseText) {
        throw new Error("No content generated");
    }

    // Manual JSON extraction since we can't use responseMimeType: application/json with tools
    // 1. Try to find content within ```json ... ``` code blocks
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
        responseText = jsonMatch[1];
    } else {
        // 2. Fallback: Try to find the first '{' and last '}'
        const firstBrace = responseText.indexOf('{');
        const lastBrace = responseText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            responseText = responseText.substring(firstBrace, lastBrace + 1);
        }
    }

    let data;
    try {
        data = JSON.parse(responseText);
    } catch (parseError) {
        console.error("Failed to parse JSON response:", response.text);
        throw new Error("Failed to parse article data from AI response.");
    }

    // Extract grounding sources if available
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => {
        return chunk.web ? { title: chunk.web.title, uri: chunk.web.uri } : null;
    }).filter((item: any) => item !== null) || [];

    return {
      title: data.title || "Untitled Article",
      content: data.content || "Could not retrieve content. Please try a different source.",
      author: data.author,
      siteName: data.siteName,
      url: url,
      sources: sources
    };

  } catch (error: any) {
    console.error("Error fetching article:", error);
    // Enhance error message for the user
    throw new Error(error.message || "Failed to retrieve article. It might be inaccessible.");
  }
};

/**
 * Chat with the article content.
 */
export const askQuestionAboutArticle = async (articleContent: string, question: string): Promise<string> => {
    if (!apiKey) return "API Key missing";

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `
                Context: The following is the content of an article the user is reading:
                ---
                ${articleContent.substring(0, 30000)} 
                ---
                
                User Question: ${question}
                
                Answer concisely and helpfully based ONLY on the provided text.
            `
        });
        return response.text || "I couldn't generate an answer.";
    } catch (e) {
        return "Sorry, I encountered an error answering that.";
    }
};