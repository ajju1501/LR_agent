// Chat Messages
export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Chat Sessions
export interface ChatSession {
  id: string;
  userId?: string;
  createdAt: Date;
  title?: string;
  archived: boolean;
}

// Chat API Types
export interface ChatRequest {
  sessionId: string;
  message: string;
}

export interface SourceDocument {
  docId: string;
  chunkId: string;
  title: string;
  excerpt: string;
  url?: string;
  relevanceScore: number;
}

export interface ChatResponse {
  id: string;
  answer: string;
  sources: SourceDocument[];
  confidence: number;
  timestamp: Date;
  messageId: string;
}

// Document Types
export interface Document {
  id: string;
  title: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// API Error
export interface ApiError {
  status: number;
  message: string;
  details?: Record<string, any>;
}

// ──────────── Auth Types ────────────

export type UserRole = 'administrator' | 'user' | 'observer';

export interface AuthUser {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  profileImage?: string;
  roles: UserRole[];
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RegisterResponse {
  accessToken: string;
  user: AuthUser;
  message: string;
}

// Chat Context
export interface ChatContextType {
  currentSessionId: string | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sessions: ChatSession[];
  createSession: () => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  loadHistory: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  loadSessions: () => Promise<void>;
  clearError: () => void;
}
