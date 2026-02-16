import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/login', authController.login);
router.post('/register', authController.register);

// Protected routes (any authenticated user)
router.get('/profile', requireAuth, authController.getProfile);

// Admin-only routes
router.post('/assign-role', requireAuth, requireRole('administrator'), authController.assignRole);

// One-time setup (should be called with admin credentials or protected in production)
router.post('/setup-roles', authController.setupRoles);

export default router;
