import { Request, Response, NextFunction } from 'express';
import { loginRadiusService, UserRole, LRProfile } from '../services/loginRadiusService';
import { userService } from '../services/userService';
import logger from '../utils/logger';

/**
 * Extended Express Request with auth info
 */
export interface AuthenticatedRequest extends Request {
    user?: {
        uid: string;
        email: string;
        firstName?: string;
        lastName?: string;
        fullName?: string;
        roles: UserRole[];
        orgId?: string; // Active organization ID
        accessToken: string;
    };
}

/**
 * Middleware: Requires a valid LoginRadius access token.
 * Attaches user profile + roles to req.user.
 * Also handles organization context if x-organization-id header is present.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const orgIdHeader = req.headers['x-organization-id'] as string;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status: 'error',
            message: 'Missing or invalid Authorization header. Use: Bearer <access_token>',
        });
    }

    const accessToken = authHeader.split(' ')[1];

    // Validate token + get profile concurrently
    Promise.all([
        loginRadiusService.validateAccessToken(accessToken),
        loginRadiusService.getProfileByToken(accessToken),
    ])
        .then(async ([validation, profile]) => {
            if (!validation.isValid) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Access token is invalid or expired',
                });
            }

            const primaryEmail = profile.Email?.[0]?.Value || '';

            // 1. Fetch global roles
            const lrRoles = await loginRadiusService.getRolesByUid(profile.Uid);

            // 2. Fetch organization context
            const orgContexts = await loginRadiusService.getUserOrgContext(profile.Uid);

            // 3. Verify organization access if header is present
            let activeOrgId: string | undefined = undefined;
            if (orgIdHeader) {
                const hasOrgAccess = orgContexts.some(ctx => ctx.OrgId === orgIdHeader);
                if (!hasOrgAccess && !lrRoles.includes('administrator')) {
                    return res.status(403).json({
                        status: 'error',
                        message: 'Unauthorized: User does not belong to the specified organization',
                    });
                }
                activeOrgId = orgIdHeader;
            } else if (orgContexts.length > 0) {
                // Default to first org if none specified? 
                // Better to leave it empty if not explicitly asked.
                // activeOrgId = orgContexts[0].OrgId;
            }

            // Sync to local DB as cache
            await userService.ensureUser(profile.Uid, primaryEmail);
            await userService.updateUserRoles(profile.Uid, lrRoles);

            req.user = {
                uid: profile.Uid,
                email: primaryEmail,
                firstName: profile.FirstName,
                lastName: profile.LastName,
                fullName: profile.FullName,
                roles: lrRoles,
                orgId: activeOrgId,
                accessToken,
            };

            next();
        })
        .catch((error) => {
            logger.error('Auth middleware error', { error: String(error) });
            return res.status(401).json({
                status: 'error',
                message: 'Authentication failed',
            });
        });
}

/**
 * Middleware factory: Requires user to have at least one of the specified roles.
 * Must be used AFTER requireAuth.
 */
export function requireRole(...allowedRoles: UserRole[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Not authenticated',
            });
        }

        const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

        if (!hasRole) {
            logger.warn('Access denied — insufficient role', {
                uid: req.user.uid,
                userRoles: req.user.roles,
                requiredRoles: allowedRoles,
            });

            return res.status(403).json({
                status: 'error',
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
            });
        }

        next();
    };
}
