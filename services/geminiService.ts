import { GoogleGenAI } from "@google/genai";
import { ArticleData } from "../types";

// Initialize the client strictly following guidelines using process.env.API_KEY directly
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Fetches and reconstructs an article using Gemini with Google Search Grounding.
 * Uses Pro model for better extraction of paywalled content and images.
 */
export const fetchArticleContent = async (url: string): Promise<ArticleData> => {
  // Using Pro for superior reasoning and multi-source synthesis capabilities
  const modelId = "gemini-3-pro-preview"; 

  const prompt = `
    ROLE: You are an elite Investigative Content Extraction Specialist.
    GOAL: Reconstruct the ABSOLUTE FULL article at the provided URL, bypassing strict paywalls (e.g., NYT, The Information, WSJ, Bloomberg).
    
    TARGET URL: ${url}

    **STRICT BYPASS & RECONSTRUCTION PROTOCOL:**
    1. DEEP SEARCH: The target URL is likely paywalled. Do NOT rely solely on the content from the target URL. 
    2. MULTI-SOURCE SYNTHESIS: Use Google Search to find the FULL text. Search for the article's headline and author. Look for:
       - Syndicated versions on other platforms (e.g., Yahoo, Substack, News aggregators).
       - Archive snapshots (Archive.is, Wayback Machine).
       - Detailed snippets and quotes across multiple search results.
    3. NO TRUNCATION: If the article is 2000 words, reconstruct all 2000 words. Do NOT summarize. Do NOT stop halfway. 
    4. STITCHING: If you find fragments of the article in different places, stitch them together into a single, continuous, logical narrative.
    5. QUALITY CHECK: Ensure the text ends with a natural conclusion (e.g., "END", or an author bio). If it feels cut off, find more search results to complete it.

    **MANDATORY OUTPUT FORMAT:**
    You MUST output a YAML frontmatter block followed by the article content in Markdown.
    
    ---
    title: [Exact Original Article Headline]
    author: [Author Name]
    siteName: [Publication Name]
    ---

    Source: [Original Article](${url})

    ![Feature Image Description](Direct_Public_Image_URL)

    [Full Reconstructed Article Body in Markdown with subheaders and inline images]

    **STRICT RULES:**
    - The "title" in frontmatter must be the exact original headline.
    - The first line of the body MUST be: "Source: [Title](${url})".
    - Use actual high-resolution image URLs found via search.
    - Start immediately with '---'. No preamble.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // Maximize thinking for complex paywall bypass and synthesis
        thinkingConfig: { thinkingBudget: 8000 }
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
        throw new Error("No content received. The paywall may be extremely restrictive.");
    }

    // Parsing Logic
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

        title = (getMeta('title') || "").replace(/^["']|["']$/g, '');
        author = (getMeta('author') || "Unknown").replace(/^["']|["']$/g, '');
        siteName = (getMeta('siteName') || "Web").replace(/^["']|["']$/g, '');
    }

    // Robust Title Fallback
    if (!title || title.toLowerCase().includes('article view') || title.length < 5) {
        const h1Match = content.match(/^#\s+(.*)$/m);
        if (h1Match) {
          title = h1Match[1].trim();
        } else {
          try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace('www.', '');
            title = `Report from ${domain}`;
          } catch {
            title = "Extracted Article";
          }
        }
    }

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
    throw new Error(error.message || "Failed to reconstruct the full article. This source is highly protected.");
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
                Answer strictly based on the provided text.
            `
        });
        return response.text || "No response generated.";
    } catch (e) {
        return "Error querying article.";
    }
};