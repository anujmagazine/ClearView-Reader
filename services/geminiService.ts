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

  const prompt = `
    ROLE: You are an advanced Content Retrieval and Reconstruction Agent.
    GOAL: Provide the user with the *readable content* of the link provided, regardless of paywalls or clutter.

    TARGET URL: ${url}

    **EXECUTION PROTOCOL:**
    1.  **Aggressive Search**: Use the 'googleSearch' tool to find the article content.
        -   Search for the exact URL.
        -   Search for the *Title* + "full text".
        -   Search for the *Title* + "archive".
        -   Search for the *Author* and *Topic* to find cross-posts (e.g., on LinkedIn, Substack, MSN, Yahoo Finance).
    
    2.  **Content Synthesis (Crucial)**:
        -   **Scenario A (Full Text Found)**: If you find the full text in a cache or syndicated copy, format it in clean Markdown.
        -   **Scenario B (Paywalled)**: If the direct text is blocked, you MUST **reconstruct** the article.
            -   Combine all search snippets, previews, and your internal knowledge of the specific article/topic.
            -   **DO NOT** return a short summary.
            -   **DO NOT** return just the title.
            -   **GENERATE A FULL-LENGTH ARTICLE** (aim for 800-1500 words) that mirrors the structure, arguments, and depth of the original.
            -   Use headers, bullet points, and detailed paragraphs.
    
    3.  **Hyperlink Enrichment (MANDATORY)**:
        -   The user needs access to referenced tools, studies, and external pages.
        -   You MUST include relevant **Markdown links** [Link Text](URL) within the body text.
        -   If the original links are lost, use your Search tool to find the correct homepage or reference URL for tools, people, or concepts mentioned.
        -   *Example*: "Tools like [Nano Banana](https://...) allow users to..."

    **OUTPUT FORMAT:**
    Do NOT use JSON. JSON is fragile for long text.
    Use the following "Frontmatter + Markdown" format strictly:

    ---
    title: [Exact Article Title]
    author: [Author Name or "Unknown"]
    siteName: [Publication Name or "Unknown"]
    ---

    [Insert Full Reconstructed Article Content Here in Markdown]
    [Ensure links are embedded like this: [Link Text](URL)]
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

    let responseText = response.text;

    // Fallback: sometimes the model output is in parts and .text getter might miss it if structured weirdly with tools
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
    // We look for the pattern: --- [metadata] --- [content]
    // The regex handles potential whitespace around the separators.
    const frontmatterRegex = /^\s*---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/;
    const match = responseText.match(frontmatterRegex);

    let title = "Article View";
    let author = "Unknown";
    let siteName = "Web";
    let content = responseText;

    if (match) {
        const metadataStr = match[1];
        content = match[2].trim();

        // Simple line parser for YAML-like metadata
        const getMeta = (key: string) => {
            const line = metadataStr.split('\n').find(l => l.trim().startsWith(key + ':'));
            return line ? line.split(':')[1].trim() : null;
        };

        title = getMeta('title') || title;
        author = getMeta('author') || author;
        siteName = getMeta('siteName') || siteName;
        
        // Remove quotes if the model added them (e.g. title: "My Title")
        title = title.replace(/^"|"$/g, '');
        author = author.replace(/^"|"$/g, '');
        siteName = siteName.replace(/^"|"$/g, '');

    } else {
        // Fallback if model ignored the format:
        // Attempt to clean up if it still sent JSON code blocks by mistake
        if (content.trim().startsWith('```')) {
            content = content.replace(/```json|```markdown|```/g, '');
            // Attempt to recover title if it looks like JSON
            try {
                const possibleJson = JSON.parse(content);
                if (possibleJson.title) title = possibleJson.title;
                if (possibleJson.content) content = possibleJson.content;
                if (possibleJson.author) author = possibleJson.author;
            } catch (e) {
                // Not JSON, just raw text
            }
        } else {
             // Try to extract a title from the first line if it looks like a header
             const lines = content.split('\n');
             if (lines[0].startsWith('# ')) {
                 title = lines[0].replace('# ', '').trim();
                 content = lines.slice(1).join('\n').trim();
             }
        }
    }

    // Extract grounding sources
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
