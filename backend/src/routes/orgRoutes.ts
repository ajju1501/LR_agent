import { Router } from 'express';
import * as orgController from '../controllers/orgController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ──────────── Organization CRUD (admin only) ────────────
router.get('/', requireAuth, requireRole('administrator'), orgController.listOrganizations);
router.post('/', requireAuth, requireRole('administrator'), orgController.createOrganization);
router.get('/my-orgs', requireAuth, orgController.getMyOrganizations);  // Any authenticated user
router.get('/user/:uid/context', requireAuth, requireRole('administrator'), orgController.getUserOrgContext);
router.get('/:orgId', requireAuth, requireRole('administrator'), orgController.getOrganization);
router.put('/:orgId', requireAuth, requireRole('administrator'), orgController.updateOrganization);
router.delete('/:orgId', requireAuth, requireRole('administrator'), orgController.deleteOrganization);

// ──────────── Organization Roles ────────────
router.get('/:orgId/roles', requireAuth, requireRole('administrator'), orgController.getOrgRoles);


export default router;
