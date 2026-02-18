import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env';
import logger from '../utils/logger';

// LoginRadius API base
const LR_API_BASE = 'https://api.loginradius.com';

export type UserRole = 'administrator' | 'user' | 'observer';

export interface LRProfile {
    Uid: string;
    Email: { Type: string; Value: string }[];
    FirstName?: string;
    LastName?: string;
    FullName?: string;
    ProfileImage?: string;
    Roles?: string[];
}

export interface AuthResult {
    accessToken: string;
    refreshToken?: string;
    profile: LRProfile;
    roles: UserRole[];
}

class LoginRadiusService {
    private client: AxiosInstance;
    private apiKey: string;
    private apiSecret: string;

    constructor() {
        this.apiKey = config.loginRadius.apiKey;
        this.apiSecret = config.loginRadius.apiSecret;

        this.client = axios.create({
            baseURL: LR_API_BASE,
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    /**
     * Login by email using LoginRadius Auth API
     * POST /identity/v2/auth/login
     */
    async loginByEmail(email: string, password: string): Promise<AuthResult> {
        try {
            const response = await this.client.post(
                '/identity/v2/auth/login',
                { email, password },
                { params: { apikey: this.apiKey, apiSecret: this.apiSecret } }
            );

            const { access_token, refresh_token, Profile } = response.data;

            if (!access_token) {
                throw new Error('No access token received from LoginRadius');
            }

            // Fetch user roles
            const roles = await this.getRolesByUid(Profile.Uid);

            return {
                accessToken: access_token,
                refreshToken: refresh_token,
                profile: Profile,
                roles,
            };
        } catch (error: any) {
            const lrError = error.response?.data;
            logger.error('LoginRadius login failed', {
                error: lrError?.Description || error.message,
                errorCode: lrError?.ErrorCode,
                statusCode: error.response?.status,
                fullError: JSON.stringify(lrError || {}),
            });
            throw new Error(lrError?.Description || 'Login failed');
        }
    }

    /**
     * Register using LoginRadius Account Create (Management API)
     * POST /identity/v2/manage/account
     * Bypasses SOTT and email verification — uses apikey + apisecret
     */
    async registerByEmail(
        email: string,
        password: string,
        firstName: string,
        lastName: string,
        userName: string
    ): Promise<AuthResult> {
        try {
            // Step 1: Create account via Management API (no SOTT required)

            const createResponse = await this.client.post(
                '/identity/v2/manage/account',
                {
                    Email: [{ Type: 'Primary', Value: email }],
                    Password: password,
                    FirstName: firstName,
                    LastName: lastName,
                    UserName: userName,
                    EmailVerified: true, // Skip email verification
                },
                {
                    params: { apikey: this.apiKey, apiSecret: this.apiSecret },
                }
            );

            const profile: LRProfile = createResponse.data;

            // Step 2: Assign default 'user' role
            if (profile?.Uid) {
                await this.assignRoles(profile.Uid, ['user']);
            }

            // Step 3: Login immediately to get an access_token
            let accessToken = '';
            let refreshToken: string | undefined;
            try {
                const loginResult = await this.loginByEmail(email, password);
                accessToken = loginResult.accessToken;
                refreshToken = loginResult.refreshToken;
            } catch (loginErr) {
                logger.warn('Auto-login after registration failed — user can login manually', {
                    error: String(loginErr),
                });
            }

            return {
                accessToken,
                refreshToken,
                profile,
                roles: ['user'],
            };
        } catch (error: any) {
            const lrError = error.response?.data;
            logger.error('LoginRadius registration failed', {
                message: lrError?.Description || error.message,
                errorCode: lrError?.ErrorCode,
                details: lrError, // Log the full object to see validation errors
            });
            throw new Error(lrError?.Description || 'Registration failed');
        }
    }

    /**
     * Validate access token
     * GET /identity/v2/auth/access_token/Validate
     */
    async validateAccessToken(accessToken: string): Promise<{ isValid: boolean; expiresIn?: string }> {
        try {
            const response = await this.client.get('/identity/v2/auth/access_token/Validate', {
                params: { apikey: this.apiKey, access_token: accessToken },
            });

            return { isValid: true, expiresIn: response.data.expires_in };
        } catch (error: any) {
            logger.warn('Access token validation failed', { error: error.response?.data?.Description || error.message });
            return { isValid: false };
        }
    }

    /**
     * Get user profile by access token
     * GET /identity/v2/auth/account
     */
    async getProfileByToken(accessToken: string): Promise<LRProfile> {
        try {
            const response = await this.client.get('/identity/v2/auth/account', {
                params: { apikey: this.apiKey, access_token: accessToken },
            });

            return response.data;
        } catch (error: any) {
            const lrError = error.response?.data;
            logger.error('Failed to get profile by token', { error: lrError?.Description || error.message });
            throw new Error(lrError?.Description || 'Failed to get profile');
        }
    }

    /**
     * Get roles assigned to a user by UID (Management API)
     * GET /identity/v2/manage/account/:uid/role
     */
    async getRolesByUid(uid: string): Promise<UserRole[]> {
        try {
            const response = await this.client.get(`/identity/v2/manage/account/${uid}/role`, {
                params: { apikey: this.apiKey, apisecret: this.apiSecret },
            });

            const rawRoles = response.data?.Roles || [];
            // LoginRadius may return roles as strings ["user"] or objects [{ Name: "user" }]
            const roles = rawRoles.map((r: any) => (typeof r === 'string' ? r : r.Name)).filter(Boolean);
            return (roles.length > 0 ? roles : ['user']) as UserRole[];
        } catch (error: any) {
            logger.warn('Failed to get roles for user', { uid, error: error.message });
            return ['user']; // Default to 'user' if role lookup fails
        }
    }

    /**
     * Assign roles to a user by UID (Management API)
     * PUT /identity/v2/manage/account/:uid/role
     */
    async assignRoles(uid: string, roles: string[]): Promise<void> {
        try {
            await this.client.put(
                `/identity/v2/manage/account/${uid}/role`,
                { Roles: roles },
                { params: { apikey: this.apiKey, apisecret: this.apiSecret } }
            );

            logger.info('Roles assigned', { uid, roles });
        } catch (error: any) {
            logger.warn('Failed to assign roles', { uid, roles, error: error.message });
        }
    }

    /**
     * Create roles in LoginRadius (Management API, one-time setup)
     * POST /identity/v2/manage/role
     */
    async createRoles(): Promise<void> {
        const roleDefs = [
            {
                Name: 'administrator',
                Permissions: {
                    chat: true,
                    'manage-documents': true,
                    'view-dashboard': true,
                    'manage-users': true,
                },
            },
            {
                Name: 'user',
                Permissions: { chat: true },
            },
            {
                Name: 'observer',
                Permissions: { 'view-dashboard': true },
            },
        ];

        try {
            await this.client.post(
                '/identity/v2/manage/role',
                { Roles: roleDefs },
                { params: { apikey: this.apiKey, apisecret: this.apiSecret } }
            );

            logger.info('LoginRadius roles created successfully');
        } catch (error: any) {
            // Roles may already exist — that's OK
            const lrError = error.response?.data;
            const desc = lrError?.Description || error.message || '';
            if (lrError?.ErrorCode === 968 || desc.toLowerCase().includes('already exists')) {
                logger.info('Roles already exist in LoginRadius');
            } else {
                logger.error('Failed to create roles', { error: desc });
            }
        }
    }

    /**
     * Refresh an access token before it expires
     * GET /api/v2/access_token/refresh
     * Returns a new access_token with an extended expiry
     */
    async refreshAccessToken(oldAccessToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: string }> {
        try {
            const response = await this.client.get('/api/v2/access_token/refresh', {
                params: {
                    access_token: oldAccessToken,
                    secret: this.apiSecret,
                    apikey: this.apiKey,
                },
            });

            const { access_token, refresh_token, expires_in } = response.data;

            if (!access_token) {
                throw new Error('No access token received from refresh');
            }

            logger.info('Access token refreshed successfully');

            return {
                accessToken: access_token,
                refreshToken: refresh_token,
                expiresIn: expires_in,
            };
        } catch (error: any) {
            const lrError = error.response?.data;
            logger.error('Failed to refresh access token', {
                error: lrError?.Description || error.message,
                errorCode: lrError?.ErrorCode,
            });
            throw new Error(lrError?.Description || 'Failed to refresh token');
        }
    }

    /**
     * Exchange Access Token (Request Token to Access Token)
     * GET /api/v2/access_token
     */
    async exchangeCode(token: string): Promise<AuthResult> {
        try {
            // Manual URL construction to avoid any Axios param serialization issues
            // and ensure we use the most common parameter names for LoginRadius.
            const url = `https://api.loginradius.com/api/v2/access_token?token=${token}&secret=${this.apiSecret}&apikey=${this.apiKey}`;

            logger.info('Exchanging code via LoginRadius API', { token, url: url.replace(this.apiSecret, '***') });

            const response = await this.client.get(url);

            if (!response.data || !response.data.access_token) {
                logger.error('Unexpected LoginRadius response format', { data: response.data });
                throw new Error('Invalid response from LoginRadius');
            }

            let { access_token, refresh_token, Profile } = response.data;

            // If Profile is not in the response (common for /api/v2/access_token),
            // fetch it using the new access token.
            if (!Profile && access_token) {
                logger.info('Profile missing from exchange response, fetching by token...');
                Profile = await this.getProfileByToken(access_token);
            }

            if (!Profile) {
                throw new Error('Failed to retrieve user profile from LoginRadius');
            }

            // Fetch user roles
            const roles = await this.getRolesByUid(Profile.Uid);

            return {
                accessToken: access_token,
                refreshToken: refresh_token,
                profile: Profile,
                roles,
            };
        } catch (error: any) {
            // Extremely detailed error logging
            const errorDetails = {
                message: error.message,
                code: error.code,
                stack: error.stack,
                config: {
                    url: error.config?.url,
                    method: error.config?.method,
                    headers: error.config?.headers,
                },
                response: error.response ? {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data,
                    headers: error.response.headers
                } : 'NO_RESPONSE'
            };

            console.error('CRITICAL LOGINRADIUS ERROR:', JSON.stringify(errorDetails, null, 2));

            logger.error('LoginRadius code exchange failed', {
                message: error.message,
                lrError: error.response?.data?.Description || 'Unknown error'
            });

            throw new Error(error.response?.data?.Description || 'Authentication handshake failed');
        }
    }
}

export const loginRadiusService = new LoginRadiusService();
export default LoginRadiusService;
