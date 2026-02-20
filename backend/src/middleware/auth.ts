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
        orgRole?: UserRole; // User's effective (highest) role within the active org
        orgRoles?: UserRole[]; // All roles the user has in the active org
        accessToken: string;
    };
}
/**
 * In-memory cache for auth data to avoid hammering LoginRadius API.
 * Key: access token, Value: { profile, roles, orgContexts, timestamp }
 * TTL: 30 seconds
 */
interface CachedAuthData {
    profile: LRProfile;
    primaryEmail: string;
    lrRoles: UserRole[];
    orgContexts: any[];
    timestamp: number;
}

const AUTH_CACHE_TTL_MS = 30_000; // 30 seconds
const authCache = new Map<string, CachedAuthData>();

// Clean up stale entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of authCache.entries()) {
        if (now - value.timestamp > AUTH_CACHE_TTL_MS * 2) {
            authCache.delete(key);
        }
    }
}, 60_000);

/**
 * Middleware: Requires a valid LoginRadius access token.
 * Attaches user profile + roles to req.user.
 * Also handles organization context if x-organization-id header is present.
 *
 * Uses a 30-second in-memory cache to avoid rate-limiting from LoginRadius
 * when multiple requests fire simultaneously (e.g., page navigation).
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

    // Check cache first
    const cached = authCache.get(accessToken);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < AUTH_CACHE_TTL_MS) {
        // Use cached data — no LoginRadius API calls needed
        return buildUserFromCache(req, res, next, cached, orgIdHeader, accessToken);
    }

    // Cache miss or stale — full validation
    Promise.all([
        loginRadiusService.validateAccessToken(accessToken),
        loginRadiusService.getProfileByToken(accessToken),
    ])
        .then(async ([validation, profile]) => {
            if (!validation.isValid) {
                authCache.delete(accessToken);
                return res.status(401).json({
                    status: 'error',
                    message: 'Access token is invalid or expired',
                });
            }

            const primaryEmail = profile.Email?.[0]?.Value || '';

            // Fetch roles and org context
            const lrRoles = await loginRadiusService.getRolesByUid(profile.Uid);
            const orgContexts = await loginRadiusService.getUserOrgContext(profile.Uid);

            // Store in cache
            const cacheEntry: CachedAuthData = {
                profile,
                primaryEmail,
                lrRoles,
                orgContexts,
                timestamp: Date.now(),
            };
            authCache.set(accessToken, cacheEntry);

            // Sync to local DB
            await userService.ensureUser(profile.Uid, primaryEmail);
            await userService.updateUserRoles(profile.Uid, lrRoles);

            return buildUserFromCache(req, res, next, cacheEntry, orgIdHeader, accessToken);
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
 * Build req.user from cached auth data and continue.
 */
function buildUserFromCache(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
    cached: CachedAuthData,
    orgIdHeader: string | undefined,
    accessToken: string,
) {
    const { profile, primaryEmail, lrRoles, orgContexts } = cached;

    // Verify organization access if header is present
    let activeOrgId: string | undefined = undefined;
    if (orgIdHeader) {
        const hasOrgAccess = orgContexts.some((ctx: any) => ctx.OrgId === orgIdHeader);
        if (!hasOrgAccess && !lrRoles.includes('administrator')) {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized: User does not belong to the specified organization',
            });
        }
        activeOrgId = orgIdHeader;
    }

    req.user = {
        uid: profile.Uid,
        email: primaryEmail,
        firstName: profile.FirstName,
        lastName: profile.LastName,
        fullName: profile.FullName,
        roles: lrRoles,
        orgId: activeOrgId,
        orgRole: undefined,
        orgRoles: [],
        accessToken,
    };

    // Resolve org-level role(s) if an org is active
    if (activeOrgId) {
        const orgCtx = orgContexts.find((ctx: any) => ctx.OrgId === activeOrgId);
        if (orgCtx) {
            if (orgCtx.EffectiveRole) {
                req.user.orgRole = orgCtx.EffectiveRole as UserRole;
            }
            // Parse all roles from raw role names (e.g., 'testlr1_user' → 'user')
            if (orgCtx.Roles && Array.isArray(orgCtx.Roles)) {
                const knownSuffixes: UserRole[] = ['administrator', 'user', 'observer'];
                const parsed: UserRole[] = [];
                for (const rawRole of orgCtx.Roles) {
                    const lower = (rawRole as string).toLowerCase();
                    for (const suffix of knownSuffixes) {
                        if (lower.endsWith(`_${suffix}`) || lower === suffix) {
                            if (!parsed.includes(suffix)) parsed.push(suffix);
                        }
                    }
                }
                req.user.orgRoles = parsed;
            }
        }
    }

    next();
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

/**
 * Middleware factory: Allows access if the user has the required role
 * either globally (tenant-level) OR within the active organization.
 * Must be used AFTER requireAuth.
 */
export function requireOrgRole(...allowedRoles: UserRole[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Not authenticated',
            });
        }

        // Global admin always passes
        if (req.user.roles.includes('administrator')) {
            return next();
        }

        // Check if ANY of the user's org roles matches the allowed roles
        const userOrgRoles = req.user.orgRoles || [];
        if (userOrgRoles.some(role => allowedRoles.includes(role))) {
            return next();
        }

        // Fallback: check single effective org role
        if (req.user.orgRole && allowedRoles.includes(req.user.orgRole)) {
            return next();
        }

        logger.warn('Org access denied — insufficient role', {
            uid: req.user.uid,
            globalRoles: req.user.roles,
            orgRole: req.user.orgRole,
            orgRoles: req.user.orgRoles,
            orgId: req.user.orgId,
            requiredRoles: allowedRoles,
        });

        return res.status(403).json({
            status: 'error',
            message: `Access denied. Required role: ${allowedRoles.join(' or ')} (global or org-level)`,
        });
    };
}
