import { Request, Response, NextFunction } from 'express';
import { loginRadiusService } from '../services/loginRadiusService';
import { AuthenticatedRequest } from '../middleware/auth';
import logger from '../utils/logger';

// ═══════════════════════════════════════════════════════
// Organization CRUD
// ═══════════════════════════════════════════════════════

/**
 * GET /api/orgs
 * List all organizations (admin only)
 */
export async function listOrganizations(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const orgs = await loginRadiusService.listOrganizations();

        res.json({
            status: 'success',
            data: orgs,
        });
    } catch (error: any) {
        logger.error('Failed to list organizations', { error: error.message });
        res.status(500).json({ status: 'error', message: error.message });
    }
}

/**
 * POST /api/orgs
 * Create a new organization (admin only)
 */
export async function createOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const { name, metadata, basePrompt } = req.body;

        if (!name) {
            return res.status(400).json({ status: 'error', message: 'Organization name is required' });
        }

        const orgMetadata = {
            ...(metadata || {}),
            BasePrompt: basePrompt
        };

        const org = await loginRadiusService.createOrganization(name, orgMetadata);

        res.status(201).json({
            status: 'success',
            data: org,
            message: `Organization "${name}" created successfully`,
        });
    } catch (error: any) {
        logger.error('Failed to create organization', { error: error.message });
        res.status(500).json({ status: 'error', message: error.message });
    }
}

/**
 * PUT /api/orgs/:orgId
 * Update organization details (admin only)
 */
export async function updateOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const { orgId } = req.params;
        const { name, basePrompt, ...metadata } = req.body;

        if (!orgId) {
            return res.status(400).json({ status: 'error', message: 'Organization ID is required' });
        }

        const updateData: any = {};

        if (name) updateData.Name = name;
        if (basePrompt !== undefined) updateData.Metadata = { BasePrompt: basePrompt };

        const org = await loginRadiusService.updateOrganization(orgId, updateData);

        res.json({
            status: 'success',
            data: org,
            message: 'Organization updated successfully',
        });
    } catch (error: any) {
        logger.error('Failed to update organization', { orgId: req.params.orgId, error: error.message });
        res.status(500).json({ status: 'error', message: error.message });
    }
}

/**
 * GET /api/orgs/:orgId
 * Get a single organization's details
 */
export async function getOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const { orgId } = req.params;
        const org = await loginRadiusService.getOrganization(orgId);

        res.json({
            status: 'success',
            data: org,
        });
    } catch (error: any) {
        logger.error('Failed to get organization', { orgId: req.params.orgId, error: error.message });
        res.status(500).json({ status: 'error', message: error.message });
    }
}



/**
 * DELETE /api/orgs/:orgId
 * Delete an organization (admin only)
 */
export async function deleteOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const { orgId } = req.params;

        await loginRadiusService.deleteOrganization(orgId);

        res.json({
            status: 'success',
            message: 'Organization deleted successfully',
        });
    } catch (error: any) {
        logger.error('Failed to delete organization', { orgId: req.params.orgId, error: error.message });
        res.status(500).json({ status: 'error', message: error.message });
    }
}

// ═══════════════════════════════════════════════════════
// Organization Roles
// ═══════════════════════════════════════════════════════

/**
 * GET /api/orgs/:orgId/roles
 * List roles for an organization
 */
export async function getOrgRoles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const { orgId } = req.params;
        const roles = await loginRadiusService.getOrgRoles(orgId);

        res.json({
            status: 'success',
            data: roles,
        });
    } catch (error: any) {
        logger.error('Failed to get org roles', { orgId: req.params.orgId, error: error.message });
        res.status(500).json({ status: 'error', message: error.message });
    }
}


// ═══════════════════════════════════════════════════════
// Organization Members (user-org context)
// ═══════════════════════════════════════════════════════

/**
 * GET /api/orgs/user/:uid/context
 * Get a user's organization context (all orgs they belong to)
 */
export async function getUserOrgContext(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const { uid } = req.params;
        const contexts = await loginRadiusService.getUserOrgContext(uid);

        res.json({
            status: 'success',
            data: contexts,
        });
    } catch (error: any) {
        logger.error('Failed to get user org context', { uid: req.params.uid, error: error.message });
        res.status(500).json({ status: 'error', message: error.message });
    }
}

/**
 * GET /api/orgs/my-orgs
 * Get the current authenticated user's organizations
 */
export async function getMyOrganizations(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        if (!req.user) {
            return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const contexts = await loginRadiusService.getUserOrgContext(req.user.uid);

        res.json({
            status: 'success',
            data: contexts,
        });
    } catch (error: any) {
        logger.error('Failed to get my organizations', { error: error.message });
        res.status(500).json({ status: 'error', message: error.message });
    }
}

/**
 * GET /api/orgs/my-org-role/:orgId
 * Get the current authenticated user's effective role in a specific organization
 */
export async function getMyOrgRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        if (!req.user) {
            return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const { orgId } = req.params;

        // If user is a global admin, they always have 'administrator' role in any org
        if (req.user.roles.includes('administrator')) {
            let orgName = orgId;
            try {
                const org = await loginRadiusService.getOrganization(orgId);
                orgName = org.Name;
            } catch (_) { /* ignore */ }

            return res.json({
                status: 'success',
                data: {
                    orgId,
                    orgName,
                    role: 'administrator',
                    rawRoles: ['administrator'],
                    isMember: true,
                    isTenantAdmin: true,
                },
            });
        }

        // For non-admin users, fetch their org context
        const contexts = await loginRadiusService.getUserOrgContext(req.user.uid);
        const orgCtx = contexts.find(c => c.OrgId === orgId);

        if (!orgCtx) {
            return res.json({
                status: 'success',
                data: {
                    orgId,
                    role: null,
                    rawRoles: [],
                    isMember: false,
                    isTenantAdmin: false,
                },
            });
        }

        res.json({
            status: 'success',
            data: {
                orgId,
                orgName: orgCtx.OrgName,
                role: orgCtx.EffectiveRole || null,
                rawRoles: orgCtx.Roles || [],
                isMember: true,
                isTenantAdmin: false,
            },
        });
    } catch (error: any) {
        logger.error('Failed to get user org role', { uid: req.user?.uid, orgId: req.params.orgId, error: error.message });
        res.status(500).json({ status: 'error', message: error.message });
    }
}
