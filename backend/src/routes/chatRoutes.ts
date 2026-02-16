import { Router } from 'express';
import * as chatController from '../controllers/chatController';

const router = Router();

// POST /api/chat/send - Send a message in a session
router.post('/send', chatController.sendMessage);

// POST /api/chat/new - Create a new chat session
router.post('/new', chatController.createSession);

// GET /api/chat/history/:sessionId - Get chat history
router.get('/history/:sessionId', chatController.getChatHistory);

// GET /api/chat/sessions - Get all sessions for a user
router.get('/sessions', chatController.getUserSessions);

// DELETE /api/chat/:sessionId - Delete a session
router.delete('/:sessionId', chatController.deleteSession);

export default router;
