import { config } from '../config/env';
import { DocumentChunk, DocumentMetadata } from '../types';

interface ChunkParams {
  chunkSize?: number;
  overlap?: number;
}

/**
 * Simple word-based token counter (approximation)
 * Actual token count would require tokenizer training, but this is a good estimate
 */
export function estimateTokenCount(text: string): number {
  // Rough approximation: 1 token ≈ 1.3 words (for English)
  const wordCount = text.split(/\s+/).length;
  return Math.ceil(wordCount / 1.3);
}

/**
 * Split text into sentences while preserving some context
 */
export function splitIntoSentences(text: string): string[] {
  // Split on sentence boundaries while keeping punctuation
  const sentences = text
    .replace(/([.!?])\s+/g, '$1||')
    .split('||')
    .filter(s => s.trim().length > 0);
  return sentences;
}

/**
 * Create chunks from text with optional overlap
 */
export function createChunks(
  text: string,
  docId: string,
  chunkSize: number = config.rag.chunkSize,
  overlap: number = config.rag.chunkOverlap
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const sentences = splitIntoSentences(text);

  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  let charIndex = 0;
  let startPos = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokenCount(sentence);

    // If adding this sentence would exceed chunk size, save current chunk
    if (currentTokens + sentenceTokens > chunkSize && currentChunk.length > 0) {
      chunks.push({
        id: `${docId}_chunk_${chunkIndex}`,
        docId,
        text: currentChunk.trim(),
        metadata: {
          chunkIndex,
          startPos,
          endPos: charIndex
        }
      });

      chunkIndex++;

      // Create overlap by including last part of previous chunk
      const overlapTokens = Math.min(overlap, estimateTokenCount(currentChunk));
      const overlapChars = Math.ceil((overlapTokens / currentTokens) * currentChunk.length);
      currentChunk = currentChunk.slice(-overlapChars) + ' ' + sentence + ' ';
      currentTokens = estimateTokenCount(currentChunk);
      startPos = charIndex - overlapChars;
    } else {
      currentChunk += sentence + ' ';
      currentTokens += sentenceTokens;
    }

    charIndex += sentence.length + 1;
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `${docId}_chunk_${chunkIndex}`,
      docId,
      text: currentChunk.trim(),
      metadata: {
        chunkIndex,
        startPos,
        endPos: charIndex
      }
    });
  }

  return chunks;
}

/**
 * Chunk a document into multiple parts
 */
export function chunkDocument(
  text: string,
  docId: string,
  metadata?: Partial<DocumentChunk['metadata']>,
  params?: ChunkParams
): DocumentChunk[] {
  const chunkSize = params?.chunkSize || config.rag.chunkSize;
  const overlap = params?.overlap || config.rag.chunkOverlap;

  const chunks = createChunks(text, docId, chunkSize, overlap);

  // Propagate metadata (heading, url, category, orgId) to all chunks
  if (metadata) {
    chunks.forEach(chunk => {
      if (metadata.heading) chunk.metadata.heading = metadata.heading;
      if (metadata.url) chunk.metadata.url = metadata.url;
      if (metadata.category) chunk.metadata.category = metadata.category;
      if (metadata.orgId) chunk.metadata.orgId = metadata.orgId;
    });
  }

  return chunks;
}

/**
 * Validate chunk quality
 */
export function isValidChunk(chunk: DocumentChunk, minTokens: number = 10): boolean {
  const tokens = estimateTokenCount(chunk.text);
  return tokens >= minTokens && chunk.text.trim().length > 0;
}

/**
 * Merge small chunks together
 */
export function mergeSmallChunks(
  chunks: DocumentChunk[],
  minTokens: number = 10
): DocumentChunk[] {
  const merged: DocumentChunk[] = [];
  let currentChunk: DocumentChunk | null = null;

  for (const chunk of chunks) {
    if (!isValidChunk(chunk, minTokens)) {
      // Merge with previous chunk
      if (currentChunk) {
        currentChunk.text += ' ' + chunk.text;
      }
    } else {
      if (currentChunk) {
        merged.push(currentChunk);
      }
      currentChunk = { ...chunk };
    }
  }

  if (currentChunk) {
    merged.push(currentChunk);
  }

  return merged;
}
