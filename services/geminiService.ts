import { GoogleGenAI } from "@google/genai";
import { ArticleData } from "../types";

// Initialize the client strictly following guidelines using process.env.API_KEY directly
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Fetches and reconstructs an article using Gemini with Google Search Grounding.
 * Uses Pro model for better extraction of paywalled content and images.
 */
export const fetchArticleContent = async (url: string): Promise<ArticleData> => {
  const modelId = "gemini-3-pro-preview"; 

  const prompt = `
    ROLE: You are an elite Content Extraction Specialist.
    GOAL: Reconstruct the full article at the provided URL, bypassing paywalls by synthesizing data found via Google Search.

    TARGET URL: ${url}

    **MANDATORY OUTPUT FORMAT:**
    You MUST output a YAML frontmatter block followed by the article content in Markdown.
    
    ---
    title: [Exact Article Title]
    author: [Author Name]
    siteName: [Publication Name]
    ---

    Source: [Original Article](${url})

    ![Feature Image Description](Direct_Public_Image_URL)

    [Full Article Body in Markdown with subheaders and inline images]

    **RULES:**
    1. The "title" in frontmatter must be the actual headline of the article.
    2. The very first line of the markdown body (after the frontmatter) must be: "Source: [Title](${url})".
    3. Find and include the primary feature image URL. 
    4. Ensure images use direct public URLs (no base64, no relative paths). Use the search tool to find actual hosted image assets.
    5. No conversational filler like "Here is the article". Start immediately with '---'.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    let responseText = response.text || "";

    if (!responseText && response.candidates && response.candidates.length > 0) {
        const parts = response.candidates[0].content?.parts;
        if (parts) {
            responseText = parts
                .filter((p: any) => p.text)
                .map((p: any) => p.text)
                .join('');
        }
    }

    if (!responseText) {
        throw new Error("No content received from AI.");
    }

    // Advanced Parsing Logic
    // 1. Try to find the YAML block
    const frontmatterMatch = responseText.match(/---([\s\S]*?)---([\s\S]*)/);
    
    let title = "";
    let author = "Unknown";
    let siteName = "Web";
    let content = responseText;

    if (frontmatterMatch) {
        const metadataStr = frontmatterMatch[1];
        content = frontmatterMatch[2].trim();

        const getMeta = (key: string) => {
            const regex = new RegExp(`^${key}:\\s*(.*)$`, 'mi');
            const match = metadataStr.match(regex);
            return match ? match[1].trim() : null;
        };

        title = (getMeta('title') || "").replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        author = (getMeta('author') || "Unknown").replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        siteName = (getMeta('siteName') || "Web").replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    }

    // 2. Fallback Title Extraction: If frontmatter failed or title is empty
    if (!title || title.toLowerCase() === 'article view') {
        // Look for the first # or ## header in the content
        const h1Match = content.match(/^#\s+(.*)$/m);
        const h2Match = content.match(/^##\s+(.*)$/m);
        if (h1Match) title = h1Match[1].trim();
        else if (h2Match) title = h2Match[1].trim();
        else {
            // Last resort: extract from URL
            try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/').filter(p => p.length > 2);
                if (pathParts.length > 0) {
                    title = pathParts[pathParts.length - 1].replace(/-/g, ' ').replace(/\.[^/.]+$/, "");
                    title = title.charAt(0).toUpperCase() + title.slice(1);
                } else {
                    title = urlObj.hostname;
                }
            } catch {
                title = "Untitled Article";
            }
        }
    }

    // Final cleanup of title: remove markdown bold/italics
    title = title.replace(/[*_#]/g, '').trim();

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => {
        return chunk.web ? { title: chunk.web.title, uri: chunk.web.uri } : null;
    }).filter((item: any) => item !== null) || [];

    return { 
        title, 
        content, 
        author, 
        siteName, 
        url, 
        sources 
    };

  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    throw new Error(error.message || "Failed to reconstruct article content.");
  }
};

/**
 * Chat with the article content.
 */
export const askQuestionAboutArticle = async (articleContent: string, question: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `
                Context: The following is the content of an article:
                ---
                ${articleContent.substring(0, 30000)} 
                ---
                User Question: ${question}
                Answer concisely based on the text.
            `
        });
        return response.text || "I couldn't generate an answer.";
    } catch (e) {
        return "Error answering question.";
    }
};