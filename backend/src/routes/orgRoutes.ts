import { Router } from 'express';
import * as orgController from '../controllers/orgController';
import { requireAuth, requireRole, requireOrgRole } from '../middleware/auth';

const router = Router();

// ──────────── User's own org info (any authenticated user) ────────────
router.get('/my-orgs', requireAuth, orgController.getMyOrganizations);
router.get('/my-org-role/:orgId', requireAuth, orgController.getMyOrgRole);

// ──────────── Organization CRUD ────────────
// Tenant admin only: create, delete
router.post('/', requireAuth, requireRole('administrator'), orgController.createOrganization);
router.delete('/:orgId', requireAuth, requireRole('administrator'), orgController.deleteOrganization);

// List all orgs — tenant admin only
router.get('/', requireAuth, requireRole('administrator'), orgController.listOrganizations);

// View/update org — tenant admin OR org admin
router.get('/user/:uid/context', requireAuth, requireRole('administrator'), orgController.getUserOrgContext);
router.get('/:orgId', requireAuth, requireOrgRole('administrator'), orgController.getOrganization);
router.put('/:orgId', requireAuth, requireOrgRole('administrator'), orgController.updateOrganization);

// ──────────── Organization Roles ────────────
router.get('/:orgId/roles', requireAuth, requireOrgRole('administrator'), orgController.getOrgRoles);


export default router;
