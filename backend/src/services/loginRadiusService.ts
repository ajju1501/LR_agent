import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
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

/**
 * OAuth 2.0 Authorization URL parameters
 */
export interface OAuthAuthorizeParams {
    authorizeUrl: string;
    state: string;
}

export interface LROrganization {
    Id: string;
    Name: string;
    Status?: string;
    CreatedDate?: string;
    ModifiedDate?: string;
    [key: string]: any;
}

export interface LROrgRole {
    Id: string;
    Name: string;
    [key: string]: any;
}

export interface LRUserOrgContext {
    OrgId: string;
    OrgName?: string;
    Roles?: string[];
    EffectiveRole?: UserRole | null; // Parsed role: 'administrator' | 'user' | 'observer'
    [key: string]: any;
}

class LoginRadiusService {
    private client: AxiosInstance;
    private apiKey: string;
    private apiSecret: string;
    // OAuth 2.0 credentials
    private clientId: string;
    private clientSecret: string;
    private oauthAppName: string;
    private redirectUri: string;
    private siteUrl: string;

    constructor() {
        this.apiKey = config.loginRadius.apiKey;
        this.apiSecret = config.loginRadius.apiSecret;
        this.clientId = config.loginRadius.clientId;
        this.clientSecret = config.loginRadius.clientSecret;
        this.oauthAppName = config.loginRadius.oauthAppName;
        this.redirectUri = config.loginRadius.redirectUri;
        this.siteUrl = config.loginRadius.siteUrl;

        this.client = axios.create({
            baseURL: LR_API_BASE,
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // ═══════════════════════════════════════════════════════
    // OpenID Connect (OIDC) Authorization Code Grant Flow
    // ═══════════════════════════════════════════════════════

    /**
     * Step 1: Generate the OIDC Authorization URL
     * The frontend should redirect the user's browser to this URL.
     *
     * GET https://{siteUrl}/service/oidc/{OIDCAppName}/authorize
     *   ?client_id=...
     *   &redirect_uri=...
     *   &response_type=code
     *   &scope=openid profile email
     *   &state=<random>
     */
    getAuthorizeUrl(): OAuthAuthorizeParams {
        const state = crypto.randomBytes(16).toString('hex');
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: 'openid profile email',
            state,
        });

        const authorizeUrl = `${this.siteUrl}/service/oidc/${this.oauthAppName}/authorize?${params.toString()}`;
        logger.info('Generated OIDC authorize URL', { authorizeUrl: authorizeUrl.replace(this.clientId, '***') });

        return { authorizeUrl, state };
    }

    /**
     * Step 2: Exchange the authorization code for an access token.
     * This is a server-to-server call — client_secret stays on the backend.
     *
     * POST https://{siteUrl}/api/oidc/{OIDCAppName}/token
     * Body (application/x-www-form-urlencoded):
     *   grant_type=authorization_code
     *   client_id=...
     *   client_secret=...
     *   redirect_uri=...
     *   code=<authorization_code>
     */
    async exchangeAuthorizationCode(code: string): Promise<AuthResult> {
        try {
            const tokenUrl = `${this.siteUrl}/api/oidc/${this.oauthAppName}/token`;

            logger.info('Exchanging authorization code for access token', {
                tokenUrl,
                redirectUri: this.redirectUri,
            });

            const response = await axios.post(
                tokenUrl,
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    redirect_uri: this.redirectUri,
                    code,
                }).toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 15000,
                }
            );

            const { access_token, refresh_token, expires_in } = response.data;

            if (!access_token) {
                logger.error('No access_token in OAuth token response', { data: response.data });
                throw new Error('No access token received from LoginRadius OAuth');
            }

            logger.info('OAuth token obtained successfully', { expiresIn: expires_in });

            // Fetch user profile using the access token
            const profile = await this.getProfileByToken(access_token);

            if (!profile) {
                throw new Error('Failed to retrieve user profile after OAuth token exchange');
            }

            // Fetch user roles
            const roles = await this.getRolesByUid(profile.Uid);

            return {
                accessToken: access_token,
                refreshToken: refresh_token,
                profile,
                roles,
            };
        } catch (error: any) {
            const errorDetails = {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
            };

            logger.error('OAuth authorization code exchange failed', errorDetails);

            const desc =
                error.response?.data?.error_description ||
                error.response?.data?.Description ||
                error.message;
            throw new Error(desc || 'OAuth authorization code exchange failed');
        }
    }

    /**
     * Refresh access token via OIDC
     *
     * POST https://{siteUrl}/api/oidc/{OIDCAppName}/token
     * Body (application/x-www-form-urlencoded):
     *   grant_type=refresh_token
     *   client_id=...
     *   client_secret=...
     *   refresh_token=...
     */
    async refreshOAuthToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
        try {
            const tokenUrl = `${this.siteUrl}/api/oidc/${this.oauthAppName}/token`;

            logger.info('Refreshing OAuth access token');

            const response = await axios.post(
                tokenUrl,
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    refresh_token: refreshToken,
                }).toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 15000,
                }
            );

            const { access_token, refresh_token, expires_in } = response.data;

            if (!access_token) {
                throw new Error('No access token received from OAuth refresh');
            }

            logger.info('OAuth token refreshed successfully', { expiresIn: expires_in });

            return {
                accessToken: access_token,
                refreshToken: refresh_token,
                expiresIn: expires_in,
            };
        } catch (error: any) {
            const desc =
                error.response?.data?.error_description ||
                error.response?.data?.Description ||
                error.message;
            logger.error('OAuth token refresh failed', { error: desc });
            throw new Error(desc || 'OAuth token refresh failed');
        }
    }

    // ═══════════════════════════════════════════════════════
    // LoginRadius Identity API methods (email/password login, etc.)
    // ═══════════════════════════════════════════════════════

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
                details: lrError,
                validationErrors: lrError?.ValidationErrors || lrError?.Errors,
            });

            // Build a more informative error message
            let errorMsg = lrError?.Description || 'Registration failed';
            if (lrError?.ValidationErrors) {
                const fieldErrors = lrError.ValidationErrors.map(
                    (e: any) => `${e.Field}: ${e.Message}`
                ).join('; ');
                errorMsg = `${errorMsg} (${fieldErrors})`;
            }
            throw new Error(errorMsg);
        }
    }

    // ═══════════════════════════════════════════════════════
    // Token validation & profile retrieval
    // ═══════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════
    // Role management (Management API)
    // ═══════════════════════════════════════════════════════

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
            const roles = rawRoles.map((r: any) => (typeof r === 'string' ? r : r.Name)).filter(Boolean);
            return (roles.length > 0 ? roles : ['user']) as UserRole[];
        } catch (error: any) {
            logger.warn('Failed to get roles for user', { uid, error: error.message });
            return ['user'];
        }
    }

    /**
     * Get ALL raw role name strings for a user (unfiltered).
     * Returns names like ['administrator', 'testlr1_administrator', 'testlr2_user']
     */
    async getRawRolesByUid(uid: string): Promise<string[]> {
        try {
            const response = await this.client.get(`/identity/v2/manage/account/${uid}/role`, {
                params: { apikey: this.apiKey, apisecret: this.apiSecret },
            });

            const rawRoles = response.data?.Roles || [];
            return rawRoles.map((r: any) => (typeof r === 'string' ? r : r.Name)).filter(Boolean);
        } catch (error: any) {
            logger.warn('Failed to get raw roles for user', { uid, error: error.message });
            return [];
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
     * POST /v2/manage/roles
     */
    async createRoles(): Promise<void> {
        // Step 1: Fetch all existing permissions to get their IDs
        let existingPermissions: { Name: string; Id: string }[] = [];
        try {
            const resp = await this.client.get('/v2/manage/permissions', {
                params: { apikey: this.apiKey, apisecret: this.apiSecret }
            });
            // Handle both flat array and { Data: [] } formats
            existingPermissions = Array.isArray(resp.data) ? resp.data : (resp.data?.Data || []);
            logger.info(`Fetched ${existingPermissions.length} existing permissions`);
        } catch (err: any) {
            logger.warn('Failed to fetch existing permissions', { error: err.message });
        }

        const requiredPermissions = [
            { Name: 'chat', Description: 'Ability to use the AI chat' },
            { Name: 'manage-documents', Description: 'Ability to upload and delete documents' },
            { Name: 'view-dashboard', Description: 'Ability to view analytics dashboard' },
            { Name: 'manage-users', Description: 'Ability to assign roles and manage users' },
        ];

        const permNameToId: Record<string, string> = {};
        for (const ep of existingPermissions) {
            permNameToId[ep.Name] = ep.Id || '';
        }

        // Step 2: Create any missing permissions
        for (const perm of requiredPermissions) {
            if (!permNameToId[perm.Name]) {
                try {
                    const resp = await this.client.post(
                        '/v2/manage/permissions',
                        perm,
                        { params: { apikey: this.apiKey, apisecret: this.apiSecret } }
                    );
                    const newId = resp.data?.Id;
                    if (newId) {
                        permNameToId[perm.Name] = newId;
                        logger.info(`Permission "${perm.Name}" created with ID: ${newId}`);
                    }
                } catch (error: any) {
                    const lrError = error.response?.data;
                    const desc = lrError?.Description || error.message || '';
                    if (lrError?.ErrorCode === 964 || desc.toLowerCase().includes('already exists')) {
                        // If it says it exists but we didn't find it, we might need a refresh or just proceed
                        logger.info(`Permission "${perm.Name}" reported as existing by API`);
                    } else {
                        logger.error(`Failed to create permission "${perm.Name}"`, { errorCode: lrError?.ErrorCode, description: desc });
                    }
                }
            }
        }

        // Step 3: Define roles with their required permissions
        const roleDefs = [
            {
                Name: 'administrator',
                Description: 'Full access to all features',
                Permissions: ['chat', 'manage-documents', 'view-dashboard', 'manage-users']
            },
            {
                Name: 'user',
                Description: 'Has access to chat',
                Permissions: ['chat']
            },
            {
                Name: 'observer',
                Description: 'Has access to view dashboard',
                Permissions: ['view-dashboard']
            },
        ];

        // Step 4: Create roles using permission IDs
        for (const role of roleDefs) {
            try {
                // Map permission names to IDs
                const permissionIds = role.Permissions
                    .map(pName => permNameToId[pName])
                    .filter(id => !!id);

                const rolePayload = {
                    ...role,
                    Permissions: permissionIds
                };

                await this.client.post(
                    '/v2/manage/roles',
                    rolePayload,
                    { params: { apikey: this.apiKey, apisecret: this.apiSecret } }
                );
                logger.info(`Role "${role.Name}" created successfully with ${permissionIds.length} permissions`);
            } catch (error: any) {
                const lrError = error.response?.data;
                const desc = lrError?.Description || error.message || '';

                if (lrError?.ErrorCode === 968 || desc.toLowerCase().includes('already exists')) {
                    logger.info(`Role "${role.Name}" already exists in LoginRadius`);
                } else {
                    console.error(`[LR Error] Failed to create role "${role.Name}":`, {
                        status: error.response?.status,
                        data: lrError,
                        message: error.message,
                        sentPayload: JSON.stringify({
                            ...role,
                            Permissions: role.Permissions.map(p => permNameToId[p] || p)
                        })
                    });
                    logger.error(`Failed to create role "${role.Name}"`, {
                        errorCode: lrError?.ErrorCode,
                        description: desc,
                    });
                }
            }
        }
        logger.info('Role and Permission setup process completed successfully');
    }

    // ═══════════════════════════════════════════════════════
    // Organization Management (Management API)
    // ═══════════════════════════════════════════════════════

    /**
     * List all organizations in the tenant
     * GET /v2/manage/organizations
     */
    async listOrganizations(): Promise<LROrganization[]> {
        try {
            const response = await this.client.get('/v2/manage/organizations', {
                params: { apikey: this.apiKey, apisecret: this.apiSecret },
            });

            const orgs = response.data?.Data || response.data || [];
            logger.info(`Fetched ${orgs.length} organizations`);
            return orgs;
        } catch (error: any) {
            const lrError = error.response?.data;
            logger.error('Failed to list organizations', {
                error: lrError?.Description || error.message,
                errorCode: lrError?.ErrorCode,
            });
            throw new Error(lrError?.Description || 'Failed to list organizations');
        }
    }

    /**
     * Create a new organization
     * POST /v2/manage/organizations
     */
    async createOrganization(name: string, metadata?: Record<string, any>): Promise<LROrganization> {
        try {
            const response = await this.client.post(
                '/v2/manage/organizations',
                { Name: name, ...(metadata ? { Metadata: metadata } : {}) },
                { params: { apikey: this.apiKey, apisecret: this.apiSecret } }
            );

            logger.info('Organization created', { name, orgId: response.data?.Id });
            return response.data;
        } catch (error: any) {
            const lrError = error.response?.data;
            logger.error('Failed to create organization', {
                error: lrError?.Description || error.message,
                errorCode: lrError?.ErrorCode,
            });
            throw new Error(lrError?.Description || 'Failed to create organization');
        }
    }

    /**
     * Get organization details by ID
     * GET /v2/manage/organizations/:orgId
     */
    async getOrganization(orgId: string): Promise<LROrganization> {
        try {
            const response = await this.client.get(`/v2/manage/organizations/${orgId}`, {
                params: { apikey: this.apiKey, apisecret: this.apiSecret },
            });

            return response.data;
        } catch (error: any) {
            const lrError = error.response?.data;
            logger.error('Failed to get organization', {
                orgId,
                error: lrError?.Description || error.message,
            });
            throw new Error(lrError?.Description || 'Failed to get organization');
        }
    }

    /**
     * Delete an organization
     * DELETE /v2/manage/organizations/:orgId
     */
    async deleteOrganization(orgId: string): Promise<void> {
        try {
            await this.client.delete(`/v2/manage/organizations/${orgId}`, {
                params: { apikey: this.apiKey, apisecret: this.apiSecret },
            });

            logger.info('Organization deleted', { orgId });
        } catch (error: any) {
            const lrError = error.response?.data;
            logger.error('Failed to delete organization', {
                orgId,
                error: lrError?.Description || error.message,
            });
            throw new Error(lrError?.Description || 'Failed to delete organization');
        }
    }

    /**
     * Update organization details
     * PUT /v2/manage/organizations/:orgId
     */
    async updateOrganization(orgId: string, data: { Name?: string;[key: string]: any }): Promise<LROrganization> {
        try {
            const response = await this.client.put(
                `/v2/manage/organizations/${orgId}`,
                data,
                { params: { apikey: this.apiKey, apisecret: this.apiSecret } }
            );

            logger.info('Organization updated', { orgId });
            return response.data;
        } catch (error: any) {
            const lrError = error.response?.data;
            logger.error('Failed to update organization', {
                orgId,
                error: lrError?.Description || error.message,
            });
            throw new Error(lrError?.Description || 'Failed to update organization');
        }
    }

    /**
     * List roles for an organization
     * GET /v2/manage/organizations/:orgId/roles
     */
    async getOrgRoles(orgId: string): Promise<LROrgRole[]> {
        try {
            const response = await this.client.get(`/v2/manage/organizations/${orgId}/roles`, {
                params: { apikey: this.apiKey, apisecret: this.apiSecret },
            });

            return response.data?.Data || response.data || [];
        } catch (error: any) {
            const lrError = error.response?.data;
            logger.warn('Failed to get org roles', { orgId, error: lrError?.Description || error.message });
            return [];
        }
    }

    /**
     * Resolve the user's effective role for a specific organization.
     * Convention: roles are named {orgName}_{roleSuffix}
     * e.g., "testlr1_administrator", "testlr1_user", "testlr1_observer"
     *
     * Returns: 'administrator' | 'user' | 'observer' | null
     */
    getEffectiveOrgRole(orgRoles: string[], orgName: string): UserRole | null {
        if (!orgRoles || orgRoles.length === 0 || !orgName) return null;

        const normalizedOrgName = orgName.toLowerCase().replace(/\s+/g, '');
        const roleSuffixes: UserRole[] = ['administrator', 'user', 'observer'];

        // Priority match: look for exact {orgName}_{suffix} pattern
        for (const suffix of roleSuffixes) {
            const expectedRole = `${normalizedOrgName}_${suffix}`;
            if (orgRoles.some(r => r.toLowerCase() === expectedRole)) {
                logger.debug(`Matched org role: ${expectedRole} -> ${suffix}`);
                return suffix;
            }
        }

        // Fallback: check if any role ends with a known suffix
        for (const suffix of roleSuffixes) {
            if (orgRoles.some(r => r.toLowerCase().endsWith(`_${suffix}`))) {
                return suffix;
            }
        }

        // Last fallback: check if any role contains the suffix directly
        for (const suffix of roleSuffixes) {
            if (orgRoles.some(r => r.toLowerCase().includes(suffix))) {
                return suffix;
            }
        }

        return null;
    }


    /**
     * Cache for role ID → role name lookups (avoids redundant API calls)
     */
    private roleCache = new Map<string, string>();

    /**
     * Get a role's details by its ID.
     * GET /v2/manage/roles/:id
     */
    async getRoleById(roleId: string): Promise<string | null> {
        // Check cache first
        if (this.roleCache.has(roleId)) {
            return this.roleCache.get(roleId)!;
        }

        try {
            const response = await this.client.get(`/v2/manage/roles/${roleId}`, {
                params: { apikey: this.apiKey, apisecret: this.apiSecret },
            });

            const data = response.data?.Data || response.data;
            const roleName = data?.Name || data?.name || null;

            if (roleName) {
                this.roleCache.set(roleId, roleName);
            }

            logger.debug(`getRoleById: ${roleId} → ${roleName}`, { rawData: data });
            return roleName;
        } catch (error: any) {
            logger.warn(`Failed to get role by ID ${roleId}`, {
                error: error.response?.data?.Description || error.message,
                status: error.response?.status,
            });
            return null;
        }
    }

    /**
     * Get a user's roles within a SPECIFIC organization.
     *
     * Step 1: GET /v2/manage/account/:uid/orgcontext/:orgId
     *   → returns array of { RoleId, OrgId, Uid, ... }
     *
     * Step 2: GET /v2/manage/roles/:roleId (for each RoleId)
     *   → returns the role name (e.g. "testlr1_administrator")
     *
     * @see https://www.loginradius.com/docs/api/openapi/get-org-context-by-uid-and-org-id/
     */
    async getUserOrgRoles(uid: string, orgId: string): Promise<string[]> {
        try {
            const response = await this.client.get(
                `/v2/manage/account/${uid}/orgcontext/${orgId}`,
                { params: { apikey: this.apiKey, apisecret: this.apiSecret } }
            );

            const data = response.data?.Data || response.data;
            logger.debug(`getUserOrgRoles raw response: uid=${uid}, orgId=${orgId}`, { data });

            if (!Array.isArray(data) || data.length === 0) {
                return [];
            }

            // Extract unique RoleIds from the response
            const roleIds = [...new Set(
                data.map((entry: any) => entry.RoleId).filter(Boolean)
            )] as string[];

            if (roleIds.length === 0) {
                return [];
            }

            // Resolve each RoleId to a role name
            const roleNames = await Promise.all(
                roleIds.map(id => this.getRoleById(id))
            );

            const resolvedRoles = roleNames.filter(Boolean) as string[];
            logger.debug(`getUserOrgRoles resolved: uid=${uid}, orgId=${orgId}`, {
                roleIds,
                resolvedRoles,
            });

            return resolvedRoles;
        } catch (error: any) {
            logger.warn(`Failed to get user roles for org ${orgId}`, {
                uid,
                error: error.response?.data?.Description || error.message,
                status: error.response?.status,
            });
            return [];
        }
    }

    /**
     * Get user's organization context (all orgs + roles for a user)
     *
     * Step 1: GET /v2/manage/account/:uid/orgcontext → list of org memberships
     *         (may contain duplicates — one entry per role assignment)
     * Step 2: Deduplicate by OrgId
     * Step 3: GET /v2/manage/account/:uid/orgcontext/:orgId → roles per unique org
     */
    async getUserOrgContext(uid: string): Promise<LRUserOrgContext[]> {
        try {
            // Step 1: Fetch org memberships
            const orgResponse = await this.client.get(`/v2/manage/account/${uid}/orgcontext`, {
                params: { apikey: this.apiKey, apisecret: this.apiSecret },
            });

            let contexts: any[] = orgResponse.data?.Data || orgResponse.data || [];
            if (!Array.isArray(contexts)) contexts = [];

            logger.debug('User org context raw', { uid, orgCount: contexts.length });

            // Step 2: Deduplicate by OrgId (API returns one entry per role assignment)
            const uniqueOrgs = new Map<string, { OrgId: string; OrgName: string | null }>();
            for (const ctx of contexts) {
                if (ctx.OrgId && !uniqueOrgs.has(ctx.OrgId)) {
                    uniqueOrgs.set(ctx.OrgId, {
                        OrgId: ctx.OrgId,
                        OrgName: ctx.OrgName || ctx.Name || null,
                    });
                }
            }

            logger.debug(`Deduplicated orgs: ${contexts.length} entries → ${uniqueOrgs.size} unique orgs`);

            // Step 3: For each unique org, fetch the user's roles
            const normalizedContexts = await Promise.all(
                Array.from(uniqueOrgs.values()).map(async (org) => {
                    const normalized: LRUserOrgContext = {
                        OrgId: org.OrgId,
                        OrgName: org.OrgName || undefined,
                        Roles: [],
                        EffectiveRole: null,
                    };

                    // Get org name if missing
                    if (!normalized.OrgName && normalized.OrgId) {
                        try {
                            const orgDetail = await this.getOrganization(normalized.OrgId);
                            normalized.OrgName = orgDetail.Name;
                        } catch (e) {
                            logger.warn(`Could not fetch name for org ${normalized.OrgId}`);
                            normalized.OrgName = `Org ${normalized.OrgId.substring(0, 8)}`;
                        }
                    }

                    // Fetch org-specific roles using the dedicated endpoint
                    const orgRoles = await this.getUserOrgRoles(uid, normalized.OrgId);
                    normalized.Roles = orgRoles;

                    // Resolve effective role (picks the highest-privilege role)
                    if (orgRoles.length > 0) {
                        normalized.EffectiveRole = this.getEffectiveOrgRole(
                            orgRoles,
                            normalized.OrgName || ''
                        );
                    }

                    logger.debug(`Org "${normalized.OrgName}" (${normalized.OrgId}): roles=${JSON.stringify(orgRoles)}, effective=${normalized.EffectiveRole}`);
                    return normalized;
                })
            );

            return normalizedContexts;
        } catch (error: any) {
            const lrError = error.response?.data;
            logger.warn('Failed to get user org context', {
                uid,
                error: lrError?.Description || error.message,
            });
            return [];
        }
    }


    /**
     * Refresh an access token before it expires (legacy LR API)
     * GET /api/v2/access_token/refresh
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
}

export const loginRadiusService = new LoginRadiusService();
export default LoginRadiusService;
