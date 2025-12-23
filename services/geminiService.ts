
import { GoogleGenAI } from "@google/genai";
import { ArticleData } from "../types";

// Initialize the client strictly following guidelines using process.env.API_KEY directly
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Fetches and reconstructs an article using Gemini with Google Search Grounding.
 * This effectively bypasses friction by finding the content via search index.
 */
export const fetchArticleContent = async (url: string): Promise<ArticleData> => {
  const modelId = "gemini-3-flash-preview"; 

  const prompt = `
    ROLE: You are an advanced Content Retrieval and Reconstruction Agent.
    GOAL: Provide the user with the *readable content* of the link provided, including all text and visual media, regardless of paywalls or clutter.

    TARGET URL: ${url}

    **EXECUTION PROTOCOL:**
    1.  **Aggressive Search**: Use the 'googleSearch' tool to find the article content and its associated media.
        -   Search for the exact URL.
        -   Search for the *Title* + "full text" + "images".
        -   Search for the *Author* and *Topic* to find syndicated copies.
    
    2.  **Content Synthesis**:
        -   **Scenario A (Full Text Found)**: If you find the full text, format it in clean, rich Markdown.
        -   **Scenario B (Paywalled)**: If direct text is blocked, RECONSTRUCT the article in full depth (800-1500 words) mirroring the original structure.
    
    3.  **Visual Content Integration (MANDATORY)**:
        -   You MUST identify and include the **Hero/Feature image** of the article.
        -   Identify and include any **Key Diagrams, Infographics, or Illustrative Photos** mentioned or used in the original content.
        -   Embed them using Markdown: \`![Alt Text Description](Direct Image URL)\`.
        -   Prefer high-resolution URLs from the original site or official CDN.
    
    4.  **Hyperlink Enrichment**:
        -   Include relevant **Markdown links** [Link Text](URL) within the body text for tools, studies, or people mentioned.

    **OUTPUT FORMAT:**
    Do NOT use JSON. Use the following strictly:

    ---
    title: [Exact Article Title]
    author: [Author Name or "Unknown"]
    siteName: [Publication Name or "Unknown"]
    ---

    ![Hero Image Description](Hero Image URL)

    [Insert Full Reconstructed Article Content Here in Markdown]
    [Include inline images where they contextually fit]
    [Do NOT repeat the title as the first header]
    [Use ## for section headers]
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    // Access text property directly as per guidelines
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
        console.error("Empty response from Gemini:", JSON.stringify(response, null, 2));
        throw new Error("AI returned no content. The article might be totally inaccessible.");
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

        title = getMeta('title') || title;
        author = getMeta('author') || author;
        siteName = getMeta('siteName') || siteName;
        
        // Clean quotes
        title = title.replace(/^"|"$/g, '');
        author = author.replace(/^"|"$/g, '');
        siteName = siteName.replace(/^"|"$/g, '');

    } else {
         // Fallback if formatting failed but content is there
         const lines = content.split('\n');
         if (lines[0].startsWith('# ')) {
             title = lines[0].replace('# ', '').trim();
             content = lines.slice(1).join('\n').trim();
         }
    }

    // Extract grounding sources as required by Google Search grounding guidelines
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => {
        return chunk.web ? { title: chunk.web.title, uri: chunk.web.uri } : null;
    }).filter((item: any) => item !== null) || [];

    return {
      title,
      content,
      author,
      siteName,
      url: url,
      sources: sources
    };

  } catch (error: any) {
    console.error("Error fetching article:", error);
    throw new Error(error.message || "Failed to retrieve article. It might be inaccessible.");
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
