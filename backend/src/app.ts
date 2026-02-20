import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config/env';
import logger from './utils/logger';
import { AppError } from './types';
import authRoutes from './routes/authRoutes';
import chatRoutes from './routes/chatRoutes';
import documentRoutes from './routes/documentRoutes';
import orgRoutes from './routes/orgRoutes';
import { requireAuth, requireRole, requireOrgRole } from './middleware/auth';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(cors({
    origin: config.app.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
  }));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });

    next();
  });

  // Health check endpoint (public)
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date(),
      services: {
        api: true,
        huggingface: 'checking...',
        chromadb: 'checking...',
        database: 'checking...',
      },
    });
  });

  // ──────────── Routes ────────────

  // Auth routes (public: login/register, protected: profile/assign-role)
  app.use('/api/auth', authRoutes);

  // Chat routes — requires auth, roles: administrator or user (global or org-level)
  app.use('/api/chat', requireAuth, requireOrgRole('administrator', 'user'), chatRoutes);

  // Document routes — requires auth, role: administrator (global or org-level)
  app.use('/api/documents', requireAuth, requireOrgRole('administrator'), documentRoutes);

  // Organization routes — auth + role checks handled per-route in orgRoutes.ts
  app.use('/api/orgs', orgRoutes);

  // Dashboard stats (observer + administrator, global or org-level)
  app.get('/api/dashboard/stats', requireAuth, requireOrgRole('administrator', 'observer'), async (req: Request, res: Response) => {
    // Placeholder — will be expanded with real metrics
    res.json({
      status: 'success',
      data: {
        totalSessions: 0,
        totalMessages: 0,
        totalDocuments: 0,
        avgConfidence: 0,
        activeUsers: 0,
        recentQueries: [],
      },
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      message: 'Route not found',
      path: req.path,
    });
  });

  // Error handling middleware
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error(`Error: ${err.message}`, { stack: err.stack });

    const status = err.status || 500;
    const message = err.message || 'Internal server error';

    res.json({
      status: 'error',
      message,
      ...(config.app.nodeEnv === 'development' && { details: err }),
    });
  });

  return app;
}

export default createApp;
