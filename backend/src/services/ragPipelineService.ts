import { retrievalService } from './retrievalService';
import { llmService } from './llmService';
import { embeddingService } from './embeddingService';
import { buildRAGPrompt, parseResponse, truncatePrompt } from '../utils/promptBuilder';
import { Message, DocumentChunk, ChatResponse } from '../types';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';

interface RAGPipelineInput {
  query: string;
  conversationHistory: Message[];
  userId?: string;
  orgId?: string;
}

class RAGPipelineService {
  async processQuery(input: RAGPipelineInput): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      logger.info('Processing RAG query', { queryLength: input.query.length });

      // Step 1: Retrieve context from vector store
      const retrievalStart = Date.now();
      let retrievalResult = { chunks: [] as DocumentChunk[], scores: [] as number[] };

      try {
        retrievalResult = await retrievalService.retrieveContext(
          input.query,
          input.orgId,
          config.rag.retrievalTopK
        );
      } catch (retrievalError) {
        logger.warn('Retrieval failed, proceeding without context', { error: String(retrievalError) });
      }

      const retrievalTime = Date.now() - retrievalStart;
      logger.info('Retrieval complete', {
        documentCount: retrievalResult.chunks.length,
        duration: retrievalTime,
      });

      // Step 2: Build prompt with context
      const promptStart = Date.now();

      let basePrompt: string | undefined = undefined;
      if (input.orgId) {
        try {
          const { loginRadiusService } = await import('./loginRadiusService');
          const orgDetails = await loginRadiusService.getOrganization(input.orgId);
          if (orgDetails && (orgDetails as any).Metadata?.BasePrompt) {
            basePrompt = (orgDetails as any).Metadata.BasePrompt;
            logger.info('Using organization-specific base prompt', { orgId: input.orgId, promptLength: basePrompt!.length });
          }
        } catch (orgError) {
          logger.warn('Failed to fetch org details for prompt', { orgId: input.orgId, error: String(orgError) });
        }
      }

      let prompt = buildRAGPrompt({
        query: input.query,
        retrievedDocuments: retrievalResult.chunks,
        conversationHistory: input.conversationHistory,
        basePrompt: basePrompt,
      });

      // Ensure prompt doesn't exceed token limits
      prompt = truncatePrompt(prompt, 8000);
      const promptTime = Date.now() - promptStart;

      logger.info('Prompt built', { promptLength: prompt.length, duration: promptTime });

      // Step 3: Generate response from LLM
      const generationStart = Date.now();
      const rawResponse = await llmService.generateResponse(prompt, 0.3);
      const generationTime = Date.now() - generationStart;

      logger.info('Response generated', {
        responseLength: rawResponse.length,
        duration: generationTime,
      });

      // Step 4: Parse and score response
      const { answer, confidence } = parseResponse(rawResponse);

      // Step 5: Build rich source references
      const sources = retrievalResult.chunks.map((chunk, idx) => ({
        docId: chunk.docId,
        chunkId: chunk.id,
        title: chunk.metadata.heading || `Documentation Section ${chunk.metadata.chunkIndex + 1}`,
        excerpt: this.buildExcerpt(chunk.text),
        url: chunk.metadata.url,
        relevanceScore: Math.round((retrievalResult.scores[idx] || 0) * 100) / 100,
      }));

      const totalTime = Date.now() - startTime;

      const response: ChatResponse = {
        id: uuidv4(),
        answer,
        sources,
        confidence,
        timestamp: new Date(),
        messageId: uuidv4(),
      };

      logger.info('RAG pipeline complete', {
        totalTime,
        retrievalTime,
        generationTime,
        sourceCount: sources.length,
        confidence,
        answerLength: answer.length,
      });

      return response;
    } catch (error) {
      logger.error('Error in RAG pipeline', { error: String(error) });

      return {
        id: uuidv4(),
        answer: `I encountered an error processing your query: ${error}. Please try again.`,
        sources: [],
        confidence: 0,
        timestamp: new Date(),
        messageId: uuidv4(),
      };
    }
  }

  /**
   * Build a meaningful excerpt from chunk text, trying to capture the most relevant part
   */
  private buildExcerpt(text: string): string {
    // Try to find a code block and include it in the excerpt
    const codeBlockMatch = text.match(/```[\s\S]*?```/);
    if (codeBlockMatch && codeBlockMatch.index !== undefined) {
      const start = Math.max(0, codeBlockMatch.index - 100);
      const end = Math.min(text.length, codeBlockMatch.index + codeBlockMatch[0].length + 50);
      const excerpt = text.substring(start, end);
      return (start > 0 ? '...' : '') + excerpt + (end < text.length ? '...' : '');
    }

    // Otherwise return the first 400 chars
    if (text.length > 400) {
      return text.substring(0, 400) + '...';
    }
    return text;
  }

  async warmUp(): Promise<void> {
    try {
      logger.info('Warming up RAG pipeline...');

      // Test embedding service
      try {
        const testEmbedding = await embeddingService.generateEmbedding('test');
        logger.info('Embedding service test successful', { embeddingDim: testEmbedding.length });
      } catch (embError) {
        logger.warn('Embedding service test failed', { error: String(embError) });
      }

      // Test LLM service
      const isConnected = await llmService.validateConnection();
      logger.info('LLM service test', { isConnected });

      if (!isConnected) {
        logger.warn('LLM service connection failed. Check your HuggingFace token and model configuration.');
      }

      logger.info('RAG pipeline warmup complete');
    } catch (error) {
      logger.warn('Error warming up RAG pipeline', { error: String(error) });
    }
  }
}

export const ragPipelineService = new RAGPipelineService();
export default RAGPipelineService;
