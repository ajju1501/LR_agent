import { Request, Response, NextFunction } from 'express';
import { loginRadiusService } from '../services/loginRadiusService';
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

        // Upsert user in local DB to ensure they exist and have roles
        const dbUser = await userService.upsertUser({
            uid: result.profile.Uid,
            email: primaryEmail
        });

        res.json({
            status: 'success',
            data: {
                accessToken: result.accessToken,
                user: {
                    uid: result.profile.Uid,
                    email: primaryEmail,
                    firstName: result.profile.FirstName,
                    lastName: result.profile.LastName,
                    fullName: result.profile.FullName,
                    profileImage: result.profile.ProfileImage,
                    roles: dbUser.roles, // Use roles from DB
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

        // Store user and roles in LOCAL DB
        const dbUser = await userService.upsertUser({
            uid: result.profile?.Uid,
            email: primaryEmail,
            defaultRoles: ['user']
        });

        res.status(201).json({
            status: 'success',
            data: {
                accessToken: result.accessToken,
                user: {
                    uid: result.profile?.Uid,
                    email: primaryEmail,
                    firstName: result.profile?.FirstName,
                    lastName: result.profile?.LastName,
                    fullName: result.profile?.FullName,
                    roles: dbUser.roles,
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

        // Validate that requested roles are valid
        const validRoles = ['administrator', 'user', 'observer'];
        const invalid = roles.filter((r: string) => !validRoles.includes(r));
        if (invalid.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: `Invalid roles: ${invalid.join(', ')}. Valid: ${validRoles.join(', ')}`,
            });
        }

        // Update roles in LOCAL DB instead of LoginRadius
        await userService.updateUserRoles(uid, roles);

        logger.info('Role assigned by admin', {
            adminUid: req.user?.uid,
            targetUid: uid,
            roles,
        });

        res.json({
            status: 'success',
            message: `Roles [${roles.join(', ')}] assigned to user ${uid}`,
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
