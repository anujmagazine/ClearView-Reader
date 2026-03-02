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
    GOAL: Provide a comprehensive, high-fidelity synthesis of the article at the provided URL for accessibility purposes.
    
    TARGET URL: ${url}

    **INSTRUCTIONS:**
    1. RESEARCH: Use Google Search and the provided URL context to find the full content and context of the article.
    2. SYNTHESIS: Provide a highly detailed, section-by-section synthesis of the article.
    3. NO VERBATIM RECITATION: To comply with copyright guidelines, do NOT copy long passages verbatim. Instead, accurately paraphrase the content while maintaining all original information, data, quotes, and nuances.
    4. STRUCTURE: Maintain the original structure, headings, and logical flow of the article.
    5. IMAGES: Identify high-quality, relevant image URLs from the article or related search results to include in the markdown.
    6. ACCESSIBILITY: Your goal is to make this content fully accessible and understandable for users who cannot access the original source.

    **MANDATORY OUTPUT FORMAT:**
    You MUST output a YAML frontmatter block followed by the article content in Markdown.
    
    ---
    title: [Exact Original Article Headline]
    author: [Author Name]
    siteName: [Publication Name]
    ---

    Source: [Original Article](${url})

    ![Feature Image Description](Direct_Public_Image_URL)

    [Full Detailed Synthesis in Markdown with subheaders and inline images]

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
    let candidate = response.candidates?.[0];
    
    // If we hit a recitation block, try one more time with an even stricter synthesis prompt
    if (candidate && candidate.finishReason === 'RECITATION') {
        console.warn("Recitation block detected, retrying with strict synthesis prompt...");
        const strictSynthesisPrompt = prompt + "\n\nCRITICAL: You hit a copyright recitation block. You MUST NOT use verbatim text. Provide a 100% original synthesis and explanation of the article's content, data, and arguments in your own words. Do not copy any sentences directly.";
        
        response = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: strictSynthesisPrompt,
            config: {
                systemInstruction: "You are a specialized reading assistant. Provide a 100% original synthesis of the article to avoid copyright blocks. Do not use verbatim text.",
                tools: [{ googleSearch: {} }, { urlContext: {} }],
                thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
            },
        });
        candidate = response.candidates?.[0];
    }

    if (candidate && candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn(`Gemini Finish Reason: ${candidate.finishReason}`);
        if (candidate.finishReason === 'SAFETY') {
            throw new Error("Content blocked by safety filters. This usually happens with sensitive or highly protected material.");
        }
        if (candidate.finishReason === 'RECITATION') {
            throw new Error("This article is under strict copyright protection. We've attempted to synthesize it, but the protection is too high for a full reconstruction.");
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