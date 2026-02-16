import { Request, Response, NextFunction } from 'express';
import { sessionService } from '../services/sessionService';
import { ragPipelineService } from '../services/ragPipelineService';
import logger from '../utils/logger';

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId, message, userId } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'sessionId and message are required',
      });
    }

    logger.info('Processing chat message', { sessionId, messageLength: message.length });

    try {
      // Get session and verify it exists
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          status: 'error',
          message: 'Session not found',
        });
      }

      // Save user message
      await sessionService.addMessage(sessionId, 'user', message);

      // Get conversation history
      const history = await sessionService.getSessionMessages(sessionId);

      // Process query through RAG pipeline
      const response = await ragPipelineService.processQuery({
        query: message,
        conversationHistory: history,
        userId: userId || session.userId,
      });

      // Save assistant response
      await sessionService.addMessage(sessionId, 'assistant', response.answer, {
        sources: response.sources,
        confidence: response.confidence,
      });

      res.json({
        status: 'success',
        data: response,
      });
    } catch (dbError) {
      // If database fails, still process the query but don't persist
      logger.warn('Database unavailable, demo mode response', { error: String(dbError) });

      const response = await ragPipelineService.processQuery({
        query: message,
        conversationHistory: [],
        userId: userId || 'guest',
      });

      res.json({
        status: 'success',
        data: response,
      });
    }
  } catch (error) {
    logger.error('Error in sendMessage', { error: String(error) });
    next(error);
  }
}

export async function createSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, title } = req.body;

    logger.info('Creating new session', { userId });

    try {
      const session = await sessionService.createSession(userId, title || 'New Chat');

      res.status(201).json({
        status: 'success',
        data: session,
      });
    } catch (dbError) {
      // If database fails, return mock session
      logger.warn('Database unavailable, returning mock session', { error: String(dbError) });

      const mockSession = {
        id: `session_${Date.now()}`,
        userId: userId || 'guest',
        title: title || 'New Chat',
        createdAt: new Date(),
        archived: false,
      };

      res.status(201).json({
        status: 'success',
        data: mockSession,
      });
    }
  } catch (error) {
    logger.error('Error creating session', { error: String(error) });
    next(error);
  }
}

export async function getChatHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const { limit } = req.query;

    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        message: 'sessionId is required',
      });
    }

    logger.info('Getting chat history', { sessionId });

    const messages = await sessionService.getSessionMessages(
      sessionId,
      limit ? parseInt(limit as string) : 50
    );

    res.json({
      status: 'success',
      data: { messages, sessionId },
    });
  } catch (error) {
    logger.error('Error getting chat history', { error: String(error) });
    next(error);
  }
}

export async function getUserSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.query;
    const defaultUserId = userId as string || 'guest';

    logger.info('Getting user sessions', { userId: defaultUserId });

    try {
      const sessions = await sessionService.getUserSessions(defaultUserId);
      res.json({
        status: 'success',
        data: { sessions },
      });
    } catch (dbError) {
      // If database fails, return empty sessions
      logger.warn('Database unavailable, returning empty sessions', { error: String(dbError) });
      res.json({
        status: 'success',
        data: { sessions: [] },
      });
    }
  } catch (error) {
    logger.error('Error getting user sessions', { error: String(error) });
    next(error);
  }
}

export async function deleteSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        message: 'sessionId is required',
      });
    }

    logger.info('Deleting session', { sessionId });

    await sessionService.deleteSession(sessionId);

    res.json({
      status: 'success',
      message: 'Session deleted',
    });
  } catch (error) {
    logger.error('Error deleting session', { error: String(error) });
    next(error);
  }
}
