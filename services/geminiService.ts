import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { ArticleData } from "../types";

// Initialize the client strictly following guidelines using process.env.GEMINI_API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Fetches and reconstructs an article using Gemini with Google Search Grounding.
 * Uses Pro model for better extraction of paywalled content and images.
 */
export const fetchArticleContent = async (url: string): Promise<ArticleData> => {
  // Using Flash for high-speed reconstruction while maintaining good quality
  const modelId = "gemini-3-flash-preview"; 

  const prompt = `
    ROLE: You are an expert Reading Assistance Specialist.
    GOAL: Provide a 100% complete, high-fidelity, lossless reconstruction of the article at the provided URL for accessibility purposes.
    
    TARGET URL: ${url}

    **INSTRUCTIONS:**
    1. RESEARCH: Use Google Search and the provided URL context to find the COMPLETE content of the article. If the target URL is paywalled, search for full-text versions, syndicated copies, or archived versions to ensure you have the entire text.
    2. RECONSTRUCTION: Provide a highly detailed, comprehensive reconstruction. You must cover every single paragraph, argument, data point, and quote found in the original.
    3. START AT THE BEGINNING: The reconstruction MUST start from the very first sentence of the article. Do not skip the introductory hook, the "lead-in", or any stylistic opening. VERIFY that your reconstruction includes the opening hook (e.g., "SYSTEM DESIGNED to predict...").
    4. NO MISSES: Ensure no parts of the article are omitted. If the article is long, provide a long, detailed response (typically 800-1500 words for this publication).
    5. LOSSLESS PARAPHRASING: To comply with copyright guidelines, do NOT copy long passages verbatim. Instead, accurately paraphrase every single sentence and paragraph while maintaining 100% of the original information, data, quotes, and nuances. 
    6. STRUCTURE: Maintain the exact original structure, headings, and logical flow.
    7. IMAGES: Identify high-quality, relevant image URLs from the article to include in the markdown.
    8. ACCESSIBILITY: Your goal is to make this content fully accessible for users who cannot access the original source due to paywalls or other restrictions.

    **MANDATORY OUTPUT FORMAT:**
    You MUST output a YAML frontmatter block followed by the article content in Markdown.
    
    ---
    title: [Exact Original Article Headline]
    author: [Author Name]
    siteName: [Publication Name]
    ---

    Source: [Original Article](${url})

    ![Feature Image Description](Direct_Public_Image_URL)

    [Full Detailed Reconstruction in Markdown with subheaders and inline images]

    **STRICT RULES:**
    - The "title" in frontmatter must be the exact original headline.
    - The first line of the body MUST be: "Source: [Title](${url})".
    - Use actual high-resolution image URLs found via search.
    - DO NOT SUMMARIZE. RECONSTRUCT the full narrative paragraph by paragraph.
    - Start immediately with '---'. No preamble.
  `;

  try {
    let response;
    try {
        response = await ai.models.generateContent({
            model: modelId,
            contents: prompt,
            config: {
                systemInstruction: "You are a specialized reading assistant. Your task is to provide a 100% complete, lossless reconstruction of articles for users with accessibility needs. You must capture every single paragraph, starting from the very first sentence. Use Google Search and URL Context to find the full content if the direct link is restricted.",
                tools: [{ googleSearch: {} }, { urlContext: {} }],
                // Using ThinkingLevel.LOW to prioritize speed while still allowing some reasoning
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
            },
        });
    } catch (primaryError) {
        console.warn("Primary model failed, falling back to Flash Latest:", primaryError);
        response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: prompt,
            config: {
                systemInstruction: "You are a specialized reading assistant. Your task is to provide a 100% complete, lossless reconstruction of articles for users with accessibility needs.",
                tools: [{ googleSearch: {} }, { urlContext: {} }]
            },
        });
    }

    // Check for safety blocks or other finish reasons
    let candidate = response.candidates?.[0];
    
    // If we hit a recitation block, try one more time with an even stricter synthesis prompt
        if (candidate && candidate.finishReason === 'RECITATION') {
        console.warn("Recitation block detected, retrying with strict reconstruction prompt...");
        const strictReconstructionPrompt = prompt + "\n\nCRITICAL: You hit a copyright recitation block. You MUST NOT use verbatim text. Provide a 100% original, lossless reconstruction of the article's content, data, and arguments in your own words. Do not copy any sentences directly, but ensure every single detail and paragraph is captured, starting from the very first sentence.";
        
        response = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: strictReconstructionPrompt,
            config: {
                systemInstruction: "You are a specialized reading assistant. Provide a 100% original, lossless reconstruction of the article to avoid copyright blocks. Do not use verbatim text, but capture every single detail and paragraph starting from the very first sentence.",
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

    // Strip markdown code block wrappers if Gemini accidentally added them
    responseText = responseText.replace(/^```markdown\n?/, '').replace(/```$/, '').trim();

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