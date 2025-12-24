
import { GoogleGenAI } from "@google/genai";
import { ArticleData } from "../types";

// Initialize the client strictly following guidelines using process.env.API_KEY directly
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Fetches and reconstructs an article using Gemini with Google Search Grounding.
 * Uses Pro model for better extraction of paywalled content and images.
 */
export const fetchArticleContent = async (url: string): Promise<ArticleData> => {
  // Using Pro for better reasoning and higher probability of finding full text and images
  const modelId = "gemini-3-pro-preview"; 

  const prompt = `
    ROLE: You are an elite Content Extraction Specialist.
    GOAL: Reconstruct the full article at the provided URL, bypassing paywalls or login walls by synthesizing data found via Google Search.

    TARGET URL: ${url}

    **STRICT CONTENT REQUIREMENTS:**
    1. **Full Text Reconstruction**: Provide the complete article text. Do not summarize unless the full text is absolutely unavailable. Maintain the original flow, headers, and nuance.
    2. **Source Attribution (CRITICAL)**: At the very beginning of the article body (before any other text), include a clear line: "Source: [Original Article Title](${url})".
    3. **Visual Media (MANDATORY)**: 
       - You MUST identify the primary Hero/Feature image and include it at the top.
       - You MUST include at least 2-3 inline images or diagrams from the article body if they exist.
       - Use Markdown: ![Alt text](Direct_Image_URL).
       - Ensure URLs are direct, high-quality, and publicly accessible (not behind a login). Use the search tool to find the highest quality image assets for the article.
    4. **Formatting**: Use clean, rich Markdown. Use ## for headers. Do not include the title inside the markdown body as it's handled by frontmatter.
    5. **Frontmatter**: Start with a metadata block.

    **OUTPUT FORMAT:**
    ---
    title: [Article Title]
    author: [Author Name]
    siteName: [Publication Name]
    ---

    ![Hero Image Description](Direct Hero Image URL)
    
    Source: [Link to Original Article](${url})

    ---

    [Full Article Body in Markdown with inline images]
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    let responseText = response.text;

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

    // Parse Frontmatter + Markdown
    const frontmatterRegex = /^\s*---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/;
    const match = responseText.match(frontmatterRegex);

    let title = "Article View";
    let author = "Unknown";
    let siteName = "Web";
    let content = responseText;

    if (match) {
        const metadataStr = match[1];
        content = match[2].trim();

        const getMeta = (key: string) => {
            const line = metadataStr.split('\n').find(l => l.trim().toLowerCase().startsWith(key.toLowerCase() + ':'));
            return line ? line.split(':').slice(1).join(':').trim() : null;
        };

        title = (getMeta('title') || title).replace(/^"|"$/g, '');
        author = (getMeta('author') || author).replace(/^"|"$/g, '');
        siteName = (getMeta('siteName') || siteName).replace(/^"|"$/g, '');
    }

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => {
        return chunk.web ? { title: chunk.web.title, uri: chunk.web.uri } : null;
    }).filter((item: any) => item !== null) || [];

    return { title, content, author, siteName, url, sources };

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
