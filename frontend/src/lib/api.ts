import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  ChatRequest,
  ChatResponse,
  ChatSession,
  Message,
  ApiError,
  LoginResponse,
  RegisterResponse,
  AuthUser,
  Organization,
  UserOrgContext,
} from './types';

class APIClient {
  private client: AxiosInstance;
  private baseURL: string;
  private userId: string;
  private isRefreshing: boolean = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  constructor(baseURL: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000') {
    this.baseURL = baseURL;
    this.userId = this.getUserIdFromStorage();
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token and organization context to every request
    this.client.interceptors.request.use((cfg) => {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('lr_access_token');
        if (token) {
          cfg.headers.Authorization = `Bearer ${token}`;
        }

        const orgId = localStorage.getItem('lr_current_org');
        if (orgId) {
          cfg.headers['x-organization-id'] = orgId;
        }
      }
      return cfg;
    });

    // Add error interceptor with auto-refresh on 401
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // If we get a 401 and haven't already tried refreshing for this request
        if (error.response?.status === 401 && !originalRequest._retry && typeof window !== 'undefined') {
          const path = window.location.pathname;

          // Don't refresh on login/auth pages or refresh-token endpoint itself
          if (path === '/login' || originalRequest.url?.includes('/refresh-token')) {
            return this.handleError(error);
          }

          originalRequest._retry = true;

          // If already refreshing, queue this request
          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.refreshSubscribers.push((newToken: string) => {
                if (!newToken) {
                  reject(error);
                  return;
                }
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                resolve(this.client(originalRequest));
              });
            });
          }

          this.isRefreshing = true;

          try {
            const oldToken = localStorage.getItem('lr_access_token');
            const storedRefreshToken = localStorage.getItem('lr_refresh_token');
            if (!oldToken && !storedRefreshToken) throw new Error('No token to refresh');

            console.log('[Auth] Attempting token refresh...');

            const refreshResponse = await axios.post(
              `${this.baseURL}/api/auth/refresh-token`,
              { accessToken: oldToken, refreshToken: storedRefreshToken },
              { timeout: 10000 } // 10 second timeout
            );

            const { accessToken: newToken, refreshToken: newRefreshToken } = refreshResponse.data.data;

            if (!newToken) throw new Error('No new token received');

            console.log('[Auth] Token refreshed successfully');

            // Store new tokens
            localStorage.setItem('lr_access_token', newToken);
            if (newRefreshToken) {
              localStorage.setItem('lr_refresh_token', newRefreshToken);
            }

            // Retry all queued requests with new token
            this.refreshSubscribers.forEach((cb) => cb(newToken));
            this.refreshSubscribers = [];

            // Retry the original request
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            console.log('[Auth] Token refresh failed, redirecting to login');

            // Reject all queued requests
            this.refreshSubscribers.forEach((cb) => cb(''));
            this.refreshSubscribers = [];

            // Refresh failed — force logout
            localStorage.removeItem('lr_access_token');
            localStorage.removeItem('lr_refresh_token');
            localStorage.removeItem('lr_user');
            window.location.href = '/login';
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        return this.handleError(error);
      }
    );
  }

  private getUserIdFromStorage(): string {
    if (typeof window === 'undefined') return 'server';

    let userId = localStorage.getItem('chatbot_user_id');
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('chatbot_user_id', userId);
    }
    return userId;
  }

  private handleError(error: AxiosError): Promise<never> {
    const apiError: ApiError = {
      status: error.response?.status || 500,
      message: (error.response?.data as any)?.message || error.message || 'An error occurred',
      details: error.response?.data as Record<string, any>,
    };

    return Promise.reject(apiError);
  }

  // ──────────── Auth endpoints ────────────

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.client.post<{ status: string; data: LoginResponse }>(
      '/api/auth/login',
      { email, password }
    );
    return response.data.data;
  }

  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    username: string
  ): Promise<RegisterResponse> {
    const response = await this.client.post<{ status: string; data: RegisterResponse }>(
      '/api/auth/register',
      { email, password, firstName, lastName, username }
    );
    return response.data.data;
  }

  async exchangeCode(token: string): Promise<LoginResponse> {
    const response = await this.client.post<{ status: string; data: LoginResponse }>(
      '/api/auth/exchange-code',
      { token }
    );
    return response.data.data;
  }

  // ──────────── OAuth 2.0 Authorization Code Flow ────────────

  /**
   * Get the OAuth 2.0 authorization URL from the backend.
   * The frontend should redirect the user's browser to this URL.
   */
  async getOAuthAuthorizeUrl(): Promise<{ authorizeUrl: string; state: string }> {
    const response = await this.client.get<{ status: string; data: { authorizeUrl: string; state: string } }>(
      '/api/auth/oauth/authorize'
    );
    return response.data.data;
  }

  /**
   * Exchange OAuth 2.0 authorization code for access token.
   * The code is sent to the backend, which does the server-side exchange
   * with client_id + client_secret (never exposed to browser).
   */
  async oauthCallback(code: string, state: string): Promise<LoginResponse> {
    const response = await this.client.post<{ status: string; data: LoginResponse }>(
      '/api/auth/oauth/callback',
      { code, state }
    );
    return response.data.data;
  }

  async getProfile(): Promise<AuthUser> {
    const response = await this.client.get<{ status: string; data: AuthUser }>('/api/auth/profile');
    return response.data.data;
  }

  async assignRole(uid: string, roles: string[]): Promise<void> {
    await this.client.post('/api/auth/assign-role', { uid, roles });
  }

  async setupRoles(): Promise<void> {
    await this.client.post('/api/auth/setup-roles');
  }

  // ──────────── Dashboard endpoint ────────────

  async getDashboardStats(): Promise<any> {
    const response = await this.client.get<{ status: string; data: any }>('/api/dashboard/stats');
    return response.data.data;
  }

  // ──────────── Chat endpoints ────────────

  async sendMessage(sessionId: string, message: string): Promise<ChatResponse> {
    const response = await this.client.post<{ status: string; data: ChatResponse }>('/api/chat/send', {
      sessionId,
      message,
      userId: this.userId,
    } as ChatRequest);
    return response.data.data;
  }

  async createSession(): Promise<ChatSession> {
    const response = await this.client.post<{ status: string; data: ChatSession }>('/api/chat/new', {
      userId: this.userId,
    });
    return response.data.data;
  }

  async getChatHistory(sessionId: string, limit: number = 50): Promise<Message[]> {
    const response = await this.client.get<{ status: string; data: { messages: Message[]; sessionId: string } }>(
      `/api/chat/history/${sessionId}`,
      { params: { limit } }
    );
    return response.data.data.messages;
  }

  async getSessions(): Promise<ChatSession[]> {
    const response = await this.client.get<{ status: string; data: { sessions: ChatSession[] } }>('/api/chat/sessions', {
      params: { userId: this.userId },
    });
    return response.data.data.sessions;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.delete(`/api/chat/${sessionId}`);
  }

  // ──────────── Document endpoints ────────────

  async listDocuments(search?: string, page: number = 1): Promise<any> {
    const response = await this.client.get<{ status: string; data: any }>('/api/documents', {
      params: { search, page, limit: 20 },
    });
    return response.data.data;
  }

  async scrapeLoginRadiusDocs(maxPages: number = 50): Promise<any> {
    const response = await this.client.post<{ status: string; data: any }>('/api/documents/scrape-loginradius', {
      maxPages,
    });
    return response.data.data;
  }

  async getDocumentStats(): Promise<any> {
    const response = await this.client.get<{ status: string; data: any }>('/api/documents/stats');
    return response.data.data;
  }

  async deleteDocument(docId: string): Promise<void> {
    await this.client.delete(`/api/documents/${docId}`);
  }

  // ──────────── Resource endpoints (PDF + GitHub) ────────────

  async uploadPDF(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('pdf', file);

    const response = await this.client.post<{ status: string; data: any }>(
      '/api/documents/upload-pdf',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 2 min timeout for large files
      }
    );
    return response.data.data;
  }

  async ingestGitHubRepo(repoUrl: string): Promise<any> {
    const response = await this.client.post<{ status: string; data: any }>(
      '/api/documents/ingest-github',
      { repoUrl },
      { timeout: 120000 }
    );
    return response.data.data;
  }

  async listResources(): Promise<any[]> {
    const response = await this.client.get<{ status: string; data: any[] }>('/api/documents/resources');
    return response.data.data;
  }

  async deleteResourceItem(id: string): Promise<void> {
    await this.client.delete(`/api/documents/resources/${id}`);
  }

  // ──────────── Organization endpoints ────────────

  async listOrganizations(): Promise<Organization[]> {
    const response = await this.client.get<{ status: string; data: Organization[] }>('/api/orgs');
    return response.data.data;
  }

  async createOrganization(name: string, metadata?: Record<string, any>): Promise<Organization> {
    const response = await this.client.post<{ status: string; data: Organization }>('/api/orgs', { name, metadata });
    return response.data.data;
  }

  async getOrganization(orgId: string): Promise<Organization> {
    const response = await this.client.get<{ status: string; data: Organization }>(`/api/orgs/${orgId}`);
    return response.data.data;
  }

  async updateOrganization(orgId: string, data: Record<string, any>): Promise<Organization> {
    const response = await this.client.put<{ status: string; data: Organization }>(`/api/orgs/${orgId}`, data);
    return response.data.data;
  }

  async deleteOrganization(orgId: string): Promise<void> {
    await this.client.delete(`/api/orgs/${orgId}`);
  }

  async getMyOrganizations(): Promise<UserOrgContext[]> {
    const response = await this.client.get<{ status: string; data: UserOrgContext[] }>('/api/orgs/my-orgs');
    return response.data.data;
  }

  async getOrgRoles(orgId: string): Promise<any[]> {
    const response = await this.client.get<{ status: string; data: any[] }>(`/api/orgs/${orgId}/roles`);
    return response.data.data;
  }



  async getUserOrgContext(uid: string): Promise<UserOrgContext[]> {
    const response = await this.client.get<{ status: string; data: UserOrgContext[] }>(`/api/orgs/user/${uid}/context`);
    return response.data.data;
  }

  // ──────────── Health ────────────

  async healthCheck(): Promise<any> {
    const response = await this.client.get('/api/health');
    return response.data;
  }
}

// Export singleton instance
export const apiClient = new APIClient();
export default APIClient;
