import { huggingfaceClient } from '../config/huggingface';
import logger from '../utils/logger';

class LLMService {
  async generateResponse(
    prompt: string,
    temperature: number = 0.3
  ): Promise<string> {
    try {
      logger.info('Generating LLM response', { promptLength: prompt.length });

      const startTime = Date.now();
      const response = await huggingfaceClient.generateResponse(prompt, temperature);
      const duration = Date.now() - startTime;

      logger.info('LLM response generated', { duration, responseLength: response.length });

      return response.trim();
    } catch (error) {
      logger.error('Error generating LLM response', { error: String(error) });
      throw new Error(`Failed to generate response: ${error}`);
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const isHealthy = await huggingfaceClient.isHealthy();
      if (isHealthy) {
        logger.info('HuggingFace connection validated');
      } else {
        logger.warn('HuggingFace connection unhealthy');
      }
      return isHealthy;
    } catch (error) {
      logger.error('Error validating HuggingFace connection', { error: String(error) });
      return false;
    }
  }
}

export const llmService = new LLMService();
export default LLMService;
