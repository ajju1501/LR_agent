import { chromaDBManager } from '../config/database';
import { embeddingService } from './embeddingService';
import { DocumentChunk } from '../types';
import logger from '../utils/logger';
import { config } from '../config/env';

interface RetrievalResult {
  chunks: DocumentChunk[];
  scores: number[];
}

class RetrievalService {
  async retrieveContext(
    query: string,
    topK: number = config.rag.retrievalTopK,
    threshold: number = config.rag.confidenceThreshold
  ): Promise<RetrievalResult> {
    try {
      logger.info('Retrieving context', { query: query.substring(0, 50), topK, threshold });

      // Generate embedding for query
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Query ChromaDB
      const { chunks, scores } = await chromaDBManager.queryDocuments(queryEmbedding, topK);

      // Filter by threshold (convert distance to similarity score)
      // ChromaDB returns distances, we convert to similarity using cosine: similarity = 1 - distance
      const filtered = chunks.filter((chunk, idx) => {
        const similarity = 1 - (scores[idx] || 0);
        return similarity >= threshold;
      });

      logger.info('Context retrieved', { retrieved: chunks.length, filtered: filtered.length });

      return {
        chunks: filtered,
        scores: filtered.map((_, idx) => 1 - (scores[idx] || 0)),
      };
    } catch (error) {
      logger.error('Error retrieving context', { error: String(error) });
      return { chunks: [], scores: [] };
    }
  }

  async addDocumentsToIndex(chunks: DocumentChunk[]): Promise<void> {
    try {
      logger.info('Adding documents to index', { chunkCount: chunks.length });

      // Generate embeddings for all chunks
      const texts = chunks.map(c => c.text);
      const embeddings = await embeddingService.generateBatchEmbeddings(texts);

      // Add to ChromaDB
      await chromaDBManager.addDocuments(chunks, embeddings);

      logger.info('Documents added to index successfully', { chunkCount: chunks.length });
    } catch (error) {
      logger.error('Error adding documents to index', { error: String(error) });
      throw new Error(`Failed to add documents to index: ${error}`);
    }
  }

  async getIndexStats(): Promise<any> {
    try {
      const stats = await chromaDBManager.getCollectionStats();
      return stats;
    } catch (error) {
      logger.error('Error getting index stats', { error: String(error) });
      return null;
    }
  }
}

export const retrievalService = new RetrievalService();
export default RetrievalService;
