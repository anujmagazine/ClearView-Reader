import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { ArticleData } from "../types";

// Initialize the client strictly following guidelines using process.env.GEMINI_API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Fetches and reconstructs an article using Gemini with Google Search Grounding.
 * Uses Pro model for better extraction of paywalled content and images.
 */
export const fetchArticleContent = async (url: string): Promise<ArticleData> => {
  // Using Pro for superior reasoning and multi-source synthesis capabilities
  const modelId = "gemini-3.1-pro-preview"; 

  const prompt = `
    ROLE: You are an expert Reading Assistance Specialist.
    GOAL: Provide a clean, full-text, distraction-free version of the article at the provided URL for accessibility purposes.
    
    TARGET URL: ${url}

    **INSTRUCTIONS:**
    1. RESEARCH: Use Google Search and the provided URL context to find the full content of the article. Search for the headline and author.
    2. SYNTHESIS: If the primary URL is restricted, look for syndicated versions, public archives, or detailed excerpts across multiple reliable sources.
    3. RECONSTRUCTION: Reconstruct the complete article text. Do NOT summarize. Maintain the original structure, headings, and flow.
    4. ACCURACY: Ensure the text is accurate to the original. If you find multiple fragments, stitch them together logically.
    5. IMAGES: Identify high-quality, relevant image URLs from the article or related search results to include in the markdown.
    6. ACCESSIBILITY: Your primary goal is to make this content accessible to users who have difficulty reading the original source due to clutter, paywalls, or formatting issues.

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
    let response;
    try {
        response = await ai.models.generateContent({
            model: modelId,
            contents: prompt,
            config: {
                systemInstruction: "You are a specialized reading assistant. Your task is to provide the full text of articles for users with accessibility needs. Use Google Search and URL Context to find the content if the direct link is restricted.",
                tools: [{ googleSearch: {} }, { urlContext: {} }],
                // Maximize thinking for complex synthesis
                thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
            },
        });
    } catch (proError) {
        console.warn("Pro model failed, falling back to Flash:", proError);
        response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction: "You are a specialized reading assistant. Your task is to provide the full text of articles for users with accessibility needs.",
                tools: [{ googleSearch: {} }, { urlContext: {} }]
            },
        });
    }

    // Check for safety blocks or other finish reasons
    const candidate = response.candidates?.[0];
    if (candidate && candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn(`Gemini Finish Reason: ${candidate.finishReason}`);
        if (candidate.finishReason === 'SAFETY') {
            throw new Error("Content blocked by safety filters. This usually happens with sensitive or highly protected material.");
        }
        if (candidate.finishReason === 'RECITATION') {
            throw new Error("The content was blocked due to copyright recitation limits. We are working on a better way to synthesize this.");
        }
    }

    let responseText = response.text || "";

    if (!responseText && candidate?.content?.parts) {
        responseText = candidate.content.parts
            .filter((p: any) => p.text)
            .map((p: any) => p.text)
            .join('');
    }

    if (!responseText) {
        // If still no text, check if there's a refusal in the parts
        throw new Error("No content received. The source might be too restrictive or the request was blocked.");
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