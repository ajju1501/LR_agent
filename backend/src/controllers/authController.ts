import { Request, Response, NextFunction } from 'express';
import { loginRadiusService, UserRole } from '../services/loginRadiusService';
import { userService } from '../services/userService';
import { AuthenticatedRequest } from '../middleware/auth';
import logger from '../utils/logger';

/**
 * POST /api/auth/login
 * Login with email & password via LoginRadius
 */
export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'Email and password are required',
            });
        }

        logger.info('Login attempt', { email });

        const result = await loginRadiusService.loginByEmail(email, password);
        const primaryEmail = result.profile.Email?.[0]?.Value || email;
        const lrRoles = result.roles;

        // Sync LoginRadius roles to local DB as cache
        await userService.upsertUser({
            uid: result.profile.Uid,
            email: primaryEmail,
            defaultRoles: lrRoles
        });
        await userService.updateUserRoles(result.profile.Uid, lrRoles);

        res.json({
            status: 'success',
            data: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                user: {
                    uid: result.profile.Uid,
                    email: primaryEmail,
                    firstName: result.profile.FirstName,
                    lastName: result.profile.LastName,
                    fullName: result.profile.FullName,
                    profileImage: result.profile.ProfileImage,
                    roles: lrRoles,
                },
            },
        });
    } catch (error: any) {
        logger.error('Login error', { error: error.message });
        res.status(401).json({
            status: 'error',
            message: error.message || 'Login failed',
        });
    }
}

/**
 * POST /api/auth/register
 * Register with email & password via LoginRadius (defaults to 'user' role)
 */
export async function register(req: Request, res: Response, next: NextFunction) {
    try {
        const { email, password, firstName, lastName, username } = req.body;

        if (!email || !password || !username) {
            return res.status(400).json({
                status: 'error',
                message: 'Email, password, and username are required',
            });
        }

        logger.info('Registration attempt', { email, username });

        const result = await loginRadiusService.registerByEmail(
            email,
            password,
            firstName || '',
            lastName || '',
            username
        );

        const primaryEmail = result.profile?.Email?.[0]?.Value || email;
        const lrRoles = result.roles;

        // Sync to local DB as cache
        await userService.upsertUser({
            uid: result.profile?.Uid,
            email: primaryEmail,
            defaultRoles: lrRoles
        });

        res.status(201).json({
            status: 'success',
            data: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                user: {
                    uid: result.profile?.Uid,
                    email: primaryEmail,
                    firstName: result.profile?.FirstName,
                    lastName: result.profile?.LastName,
                    fullName: result.profile?.FullName,
                    roles: lrRoles,
                },
                message: result.accessToken
                    ? 'Registration successful'
                    : 'Registration successful. Please verify your email before logging in.',
            },
        });
    } catch (error: any) {
        logger.error('Registration error', { error: error.message });
        res.status(400).json({
            status: 'error',
            message: error.message || 'Registration failed',
        });
    }
}

/**
 * GET /api/auth/profile
 * Get current user profile + roles (requires auth)
 */
export async function getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        if (!req.user) {
            return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        res.json({
            status: 'success',
            data: {
                uid: req.user.uid,
                email: req.user.email,
                firstName: req.user.firstName,
                lastName: req.user.lastName,
                fullName: req.user.fullName,
                roles: req.user.roles,
            },
        });
    } catch (error: any) {
        logger.error('Get profile error', { error: error.message });
        next(error);
    }
}

/**
 * POST /api/auth/assign-role (Admin only)
 * Assign a role to a user
 */
export async function assignRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const { uid, roles } = req.body;

        if (!uid || !roles || !Array.isArray(roles)) {
            return res.status(400).json({
                status: 'error',
                message: 'uid and roles (array) are required',
            });
        }

        const validRoles: UserRole[] = ['administrator', 'user', 'observer'];
        const invalid = roles.filter((r: string) => !validRoles.includes(r as UserRole));
        if (invalid.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: `Invalid roles: ${invalid.join(', ')}. Valid: ${validRoles.join(', ')}`,
            });
        }

        await loginRadiusService.assignRoles(uid, roles);
        await userService.updateUserRoles(uid, roles);

        logger.info('Role assigned via LoginRadius + synced to DB', {
            adminUid: req.user?.uid,
            targetUid: uid,
            roles,
        });

        res.json({
            status: 'success',
            message: `Roles [${roles.join(', ')}] assigned to user ${uid} in LoginRadius`,
        });
    } catch (error: any) {
        logger.error('Assign role error', { error: error.message });
        next(error);
    }
}

/**
 * POST /api/auth/setup-roles (one-time setup)
 * Creates the 3 roles in LoginRadius
 */
export async function setupRoles(req: Request, res: Response, next: NextFunction) {
    try {
        await loginRadiusService.createRoles();

        res.json({
            status: 'success',
            message: 'Roles (administrator, user, observer) created/verified in LoginRadius',
        });
    } catch (error: any) {
        logger.error('Setup roles error', { error: error.message });
        next(error);
    }
}

/**
 * GET /api/auth/oauth/authorize
 * Returns the OAuth 2.0 Authorization URL.
 * The frontend calls this to get the URL, then redirects the user's browser.
 */
export async function getOAuthAuthorizeUrl(req: Request, res: Response, next: NextFunction) {
    try {
        const { authorizeUrl, state } = loginRadiusService.getAuthorizeUrl();

        res.json({
            status: 'success',
            data: {
                authorizeUrl,
                state,
            },
        });
    } catch (error: any) {
        logger.error('OAuth authorize URL generation failed', { error: error.message });
        next(error);
    }
}

/**
 * POST /api/auth/oauth/callback
 * Exchanges the OAuth 2.0 authorization code for an access token.
 * This is the server-side back-channel exchange — client_secret never goes to the browser.
 */
export async function oauthCallback(req: Request, res: Response, next: NextFunction) {
    try {
        const { code, state } = req.body;

        if (!code) {
            return res.status(400).json({
                status: 'error',
                message: 'Authorization code is required',
            });
        }

        logger.info('OAuth 2.0 authorization code exchange', { state });

        const result = await loginRadiusService.exchangeAuthorizationCode(code);
        const primaryEmail = result.profile.Email?.[0]?.Value || '';
        const lrRoles = result.roles;

        // Sync to local DB
        await userService.upsertUser({
            uid: result.profile.Uid,
            email: primaryEmail,
            defaultRoles: lrRoles
        });
        await userService.updateUserRoles(result.profile.Uid, lrRoles);

        res.json({
            status: 'success',
            data: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                user: {
                    uid: result.profile.Uid,
                    email: primaryEmail,
                    firstName: result.profile.FirstName,
                    lastName: result.profile.LastName,
                    fullName: result.profile.FullName,
                    profileImage: result.profile.ProfileImage,
                    roles: lrRoles,
                },
            },
        });
    } catch (error: any) {
        logger.error('OAuth callback error', { error: error.message });
        res.status(401).json({
            status: 'error',
            message: error.message || 'OAuth authentication failed',
        });
    }
}

/**
 * POST /api/auth/refresh-token
 * Refresh the access token.
 * Tries OAuth refresh_token grant first, falls back to legacy LR API.
 */
export async function refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
        const { accessToken, refreshToken: refreshTkn } = req.body;

        if (!accessToken && !refreshTkn) {
            return res.status(400).json({
                status: 'error',
                message: 'accessToken or refreshToken is required',
            });
        }

        logger.info('Refreshing access token');

        let result;

        // Prefer OAuth refresh_token grant if a refresh token is provided
        if (refreshTkn) {
            result = await loginRadiusService.refreshOAuthToken(refreshTkn);
        } else {
            // Fall back to legacy LR token refresh
            result = await loginRadiusService.refreshAccessToken(accessToken!);
        }

        res.json({
            status: 'success',
            data: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                expiresIn: result.expiresIn,
            },
        });
    } catch (error: any) {
        logger.error('Token refresh error', { error: error.message });
        res.status(401).json({
            status: 'error',
            message: error.message || 'Token refresh failed',
        });
    }
}

/**
 * POST /api/auth/exchange-code (LEGACY — kept for backward compatibility)
 * Exchange short-lived LR request token for an access token
 */
export async function exchangeCode(req: Request, res: Response, next: NextFunction) {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                status: 'error',
                message: 'Token is required',
            });
        }

        logger.info('Legacy token exchange attempt (consider using /oauth/callback instead)');

        // Use the legacy LR token exchange (kept for backward compat)
        const url = `https://api.loginradius.com/api/v2/access_token?token=${token}&secret=${loginRadiusService['apiSecret']}&apikey=${loginRadiusService['apiKey']}`;
        const { default: axios } = await import('axios');
        const response = await axios.get(url);

        const { access_token, refresh_token } = response.data;
        if (!access_token) throw new Error('No access token from legacy exchange');

        const profile = await loginRadiusService.getProfileByToken(access_token);
        const roles = await loginRadiusService.getRolesByUid(profile.Uid);
        const primaryEmail = profile.Email?.[0]?.Value || '';

        await userService.upsertUser({ uid: profile.Uid, email: primaryEmail, defaultRoles: roles });
        await userService.updateUserRoles(profile.Uid, roles);

        res.json({
            status: 'success',
            data: {
                accessToken: access_token,
                refreshToken: refresh_token,
                user: {
                    uid: profile.Uid,
                    email: primaryEmail,
                    firstName: profile.FirstName,
                    lastName: profile.LastName,
                    fullName: profile.FullName,
                    profileImage: profile.ProfileImage,
                    roles,
                },
            },
        });
    } catch (error: any) {
        logger.error('Legacy code exchange error', { error: error.message });
        res.status(401).json({
            status: 'error',
            message: error.message || 'Authentication failed',
        });
    }
}
