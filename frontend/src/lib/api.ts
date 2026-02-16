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
} from './types';

class APIClient {
  private client: AxiosInstance;
  private baseURL: string;
  private userId: string;

  constructor(baseURL: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000') {
    this.baseURL = baseURL;
    this.userId = this.getUserIdFromStorage();
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token to every request
    this.client.interceptors.request.use((cfg) => {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('lr_access_token');
        if (token) {
          cfg.headers.Authorization = `Bearer ${token}`;
        }
      }
      return cfg;
    });

    // Add error interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error)
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

    // Auto-logout on 401
    if (apiError.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path !== '/login') {
        localStorage.removeItem('lr_access_token');
        localStorage.removeItem('lr_user');
        window.location.href = '/login';
      }
    }

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

  // ──────────── Health ────────────

  async healthCheck(): Promise<any> {
    const response = await this.client.get('/api/health');
    return response.data;
  }
}

// Export singleton instance
export const apiClient = new APIClient();
export default APIClient;
