import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/refresh-token', authController.refreshToken);

// OAuth 2.0 Authorization Code Grant
router.get('/oauth/authorize', authController.getOAuthAuthorizeUrl);   // Step 1: Get authorize URL
router.post('/oauth/callback', authController.oauthCallback);          // Step 2: Exchange code for token

// Legacy token exchange (backward compatibility)
router.post('/exchange-code', authController.exchangeCode);

// Protected routes (any authenticated user)
router.get('/profile', requireAuth, authController.getProfile);

// Admin-only routes
router.post('/assign-role', requireAuth, requireRole('administrator'), authController.assignRole);

// One-time setup
router.post('/setup-roles', authController.setupRoles);

export default router;
