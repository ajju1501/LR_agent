import { v4 as uuidv4 } from 'uuid';
import { Document, DocumentChunk } from '../types';
import logger from '../utils/logger';
import { chunkDocument } from '../utils/chunkDocument';
import { retrievalService } from './retrievalService';

class DocumentService {
  /**
   * Create a new document and generate chunks
   */
  async createDocument(
    title: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<Document> {
    try {
      const docId = uuidv4();

      // Generate chunks
      const chunks = chunkDocument(content, docId);

      logger.info('Document created', { docId, title, chunkCount: chunks.length });

      return {
        id: docId,
        title,
        content,
        metadata: metadata || {},
        chunks,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Error creating document', { error: String(error) });
      throw new Error(`Failed to create document: ${error}`);
    }
  }

  /**
   * Index a document (store embeddings in vector DB)
   */
  async indexDocument(document: Document): Promise<void> {
    try {
      logger.info('Indexing document', { docId: document.id, chunkCount: document.chunks.length });

      // Add chunks to retrieval index
      await retrievalService.addDocumentsToIndex(document.chunks);

      logger.info('Document indexed successfully', { docId: document.id });
    } catch (error) {
      logger.error('Error indexing document', { error: String(error) });
      throw new Error(`Failed to index document: ${error}`);
    }
  }

  /**
   * Process and index a document from text
   */
  async processDocument(
    title: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<Document> {
    try {
      // Create document with chunks
      const document = await this.createDocument(title, content, metadata);

      // Index the document
      await this.indexDocument(document);

      return document;
    } catch (error) {
      logger.error('Error processing document', { error: String(error) });
      throw new Error(`Failed to process document: ${error}`);
    }
  }

  /**
   * Get document retrieval statistics
   */
  async getDocumentStats(): Promise<any> {
    try {
      const stats = await retrievalService.getIndexStats();
      return stats;
    } catch (error) {
      logger.error('Error getting document stats', { error: String(error) });
      return null;
    }
  }
}

export const documentService = new DocumentService();
export default DocumentService;
