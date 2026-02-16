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
  updatedAt?: Date;
  title?: string;
  archived: boolean;
}

// Documents
export interface Document {
  id: string;
  title: string;
  content: string;
  metadata: DocumentMetadata;
  chunks: DocumentChunk[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentMetadata {
  source?: string;
  category?: string;
  version?: string;
  url?: string;
  lastUpdated?: Date;
  author?: string;
}

export interface DocumentChunk {
  id: string;
  docId: string;
  text: string;
  embedding?: number[];
  metadata: {
    chunkIndex: number;
    startPos: number;
    endPos: number;
    heading?: string;
    url?: string;
    category?: string;
  };
}

// Chat API Requests/Responses
export interface ChatRequest {
  sessionId: string;
  message: string;
  userId?: string;
}

export interface ChatResponse {
  id: string;
  answer: string;
  sources: SourceDocument[];
  confidence: number;
  timestamp: Date;
  messageId: string;
}

export interface SourceDocument {
  docId: string;
  chunkId: string;
  title: string;
  excerpt: string;
  url?: string;
  relevanceScore: number;
}

// Scraper
export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  headings: string[];
  links: string[];
  metadata: DocumentMetadata;
}

// Error Handling
export interface AppError extends Error {
  status: number;
  code: string;
  details?: Record<string, any>;
}

// Health Check
export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: Date;
  services: {
    api: boolean;
    huggingface: boolean;
    chromadb: boolean;
    database: boolean;
  };
  details?: Record<string, any>;
}
