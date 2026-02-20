import { createApp } from './app';
import { config } from './config/env';
import logger from './utils/logger';
import { userService } from './services/userService';
import { sessionService } from './services/sessionService';
import { resourceService } from './services/resourceService';
import { ragPipelineService } from './services/ragPipelineService';

const app = createApp();

const PORT = config.app.port;

const server = app.listen(PORT, () => {
  logger.info(`
    ╔═══════════════════════════════════════════╗
    ║   LoginRadius Chatbot Backend Server      ║
    ║   Version: 1.0.0                          ║
    ╚═══════════════════════════════════════════╝
  `);
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`Environment: ${config.app.nodeEnv}`);
  logger.info(`LLM: HuggingFace (${config.huggingface.model})`);
  logger.info(`Database: ${config.database.url.split('@')[1] || 'configured'}`);

  // Initialize services in background (non-blocking for serverless cold starts)
  (async () => {
    try {
      await userService.initialize();
      await sessionService.initialize();
      await resourceService.initialize();
      logger.info('Database services initialized successfully');

      // Warm up RAG pipeline in background (don't block server startup)
      ragPipelineService.warmUp().catch(err => {
        logger.warn('RAG warmup failed (non-fatal)', { error: String(err) });
      });
    } catch (error) {
      logger.error('Database initialization failed', { error: String(error) });
    }
  })();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason: Error) => {
  logger.error('Unhandled Rejection:', { reason: reason.message, stack: reason.stack });
  process.exit(1);
});

export default server;
