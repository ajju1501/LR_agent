import { huggingfaceClient } from '../config/huggingface';
import logger from '../utils/logger';

class EmbeddingService {
  private cache: Map<string, number[]> = new Map();

  async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    if (this.cache.has(text)) {
      return this.cache.get(text)!;
    }

    try {
      const embedding = await huggingfaceClient.generateEmbedding(text);

      // Cache the embedding
      this.cache.set(text, embedding);

      return embedding;
    } catch (error) {
      logger.error('Error generating embedding', { error: String(error) });
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const embeddings: number[][] = [];

      for (const text of texts) {
        const embedding = await this.generateEmbedding(text);
        embeddings.push(embedding);
      }

      logger.info('Batch embeddings generated', { count: texts.length });
      return embeddings;
    } catch (error) {
      logger.error('Error generating batch embeddings', { error: String(error) });
      throw new Error(`Failed to generate batch embeddings: ${error}`);
    }
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Embedding cache cleared');
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

export const embeddingService = new EmbeddingService();
export default EmbeddingService;
