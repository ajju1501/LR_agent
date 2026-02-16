import { Message, DocumentChunk } from '../types';

interface PromptContext {
  query: string;
  retrievedDocuments: DocumentChunk[];
  conversationHistory: Message[];
}

/**
 * Build a comprehensive RAG prompt with context, sources, and instructions for code examples
 */
export function buildRAGPrompt(context: PromptContext): string {
  const { query, retrievedDocuments, conversationHistory } = context;

  const systemPrompt = `You are an expert LoginRadius documentation assistant. Your role is to provide **accurate, detailed, and actionable** answers based on the LoginRadius documentation provided below.

## Instructions:
1. **Always base your answers on the provided documentation context.** If the context contains relevant information, use it thoroughly.
2. **Include code examples** whenever the documentation provides them. Format code blocks with the appropriate language identifier (e.g., \`\`\`javascript, \`\`\`python, \`\`\`html, \`\`\`curl).
3. **Cite your sources** by referencing the document section numbers (e.g., [Source 1], [Source 2]) so the user knows where the information comes from.
4. **Structure your response clearly** using headings, bullet points, and numbered steps where appropriate.
5. **If the documentation includes API endpoints, parameters, or configuration options**, present them in a well-formatted way (tables or lists).
6. **If the answer is NOT in the provided context**, clearly state: "This information is not available in the current LoginRadius documentation. However, here's what I can suggest..." and provide general guidance.
7. **Be thorough but concise** — don't omit important details, but avoid unnecessary filler.
8. **For implementation questions**, provide step-by-step instructions with code snippets.`;

  // Build context section from retrieved documents
  let contextSection = '';
  if (retrievedDocuments.length > 0) {
    contextSection = '\n\n---\n## 📚 Retrieved Documentation Context:\n\n';
    contextSection += retrievedDocuments
      .map((doc, idx) => {
        const heading = doc.metadata.heading || 'Documentation Section';
        const url = doc.metadata.url || '';
        const sourceLabel = `### [Source ${idx + 1}] ${heading}`;
        const urlLine = url ? `\n> URL: ${url}` : '';
        return `${sourceLabel}${urlLine}\n\n${doc.text}`;
      })
      .join('\n\n---\n\n');
    contextSection += '\n\n---';
  } else {
    contextSection = '\n\n> ⚠️ No matching documentation was found in the knowledge base. Please provide a general helpful response based on your knowledge of LoginRadius.';
  }

  // Build conversation history section
  let historySection = '';
  if (conversationHistory.length > 0) {
    const recentMessages = conversationHistory.slice(-8); // Last 4 exchanges
    historySection = '\n\n## 💬 Recent Conversation:\n' +
      recentMessages
        .map(msg => `**${msg.role === 'user' ? 'User' : 'Assistant'}:** ${msg.content.substring(0, 500)}`)
        .join('\n\n');
  }

  // Build the complete prompt
  const fullPrompt = `${systemPrompt}${contextSection}${historySection}

## ❓ User Question:
${query}

## ✅ Your Response:
Provide a comprehensive answer with code examples where applicable. Cite sources using [Source N] references.`;

  return fullPrompt;
}

/**
 * Extract sources from retrieved documents with full metadata
 */
export function extractSources(documents: DocumentChunk[]): { docId: string; title: string; excerpt: string; url?: string }[] {
  return documents.map(doc => ({
    docId: doc.docId,
    title: doc.metadata.heading || `Document ${doc.docId}`,
    excerpt: doc.text.substring(0, 300) + (doc.text.length > 300 ? '...' : ''),
    url: doc.metadata.url,
  }));
}

/**
 * Validate and clean prompt
 */
export function validatePrompt(prompt: string): boolean {
  return prompt.length > 0 && prompt.length < 100000; // Higher limit for richer context
}

/**
 * Truncate prompt if too long — preserves system prompt and query, trims context
 */
export function truncatePrompt(prompt: string, maxTokens: number = 8000): string {
  const maxChars = maxTokens * 4;
  if (prompt.length > maxChars) {
    // Find the user question section and preserve it
    const questionIdx = prompt.indexOf('## ❓ User Question:');
    if (questionIdx > 0) {
      const systemAndContext = prompt.substring(0, maxChars - (prompt.length - questionIdx) - 100);
      const questionAndAfter = prompt.substring(questionIdx);
      return systemAndContext + '\n\n[...context truncated for length...]\n\n' + questionAndAfter;
    }
    return prompt.substring(0, maxChars) + '\n\n[...truncated...]';
  }
  return prompt;
}

/**
 * Parse LLM response to extract answer and compute confidence score
 */
export function parseResponse(response: string): { answer: string; confidence: number } {
  const trimmedResponse = response.trim();

  // Compute confidence based on multiple signals
  let confidence = 0.5;
  let signals = 0;

  // Signal: Response references sources
  const sourceRefCount = (trimmedResponse.match(/\[Source \d+\]/g) || []).length;
  if (sourceRefCount > 0) {
    confidence += 0.15;
    signals++;
  }

  // Signal: Response contains code blocks
  const codeBlockCount = (trimmedResponse.match(/```/g) || []).length / 2;
  if (codeBlockCount > 0) {
    confidence += 0.1;
    signals++;
  }

  // Signal: Response length indicates substance
  if (trimmedResponse.length > 500) {
    confidence += 0.1;
    signals++;
  } else if (trimmedResponse.length > 200) {
    confidence += 0.05;
  }

  // Signal: Contains structured content (lists, headings)
  const hasStructure = /^[\s]*[-*•]\s/m.test(trimmedResponse) || /^#+\s/m.test(trimmedResponse);
  if (hasStructure) {
    confidence += 0.05;
    signals++;
  }

  // Negative signal: Explicitly says no info available
  if (
    trimmedResponse.toLowerCase().includes("not available in the current") ||
    trimmedResponse.toLowerCase().includes("don't have information") ||
    trimmedResponse.toLowerCase().includes("not found in the documentation")
  ) {
    confidence = Math.min(confidence, 0.3);
  }

  // Cap confidence
  confidence = Math.min(confidence, 0.98);

  return {
    answer: trimmedResponse,
    confidence: Math.round(confidence * 100) / 100,
  };
}
