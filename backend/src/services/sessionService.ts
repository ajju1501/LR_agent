import { Pool, QueryResult } from 'pg';
import { config } from '../config/env';
import { ChatSession, Message } from '../types';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

class SessionService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: config.database.poolSize,
      idleTimeoutMillis: config.database.idleTimeout,
    });

    this.pool.on('error', (error: Error) => {
      logger.error('PostgreSQL pool error', { error: String(error) });
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      const result = await this.pool.query('SELECT NOW()');
      logger.info('PostgreSQL connection established', { timestamp: result.rows[0].now });

      // Create tables if they don't exist
      await this.createTables();
    } catch (error) {
      logger.error('Failed to initialize SessionService', { error: String(error) });
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    try {
      // Sessions table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255),
          org_id VARCHAR(255),
          title VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          archived BOOLEAN DEFAULT FALSE
        )
      `);

      // Migration: Add org_id column if it doesn't exist
      try {
        await this.pool.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS org_id VARCHAR(255)');
      } catch (err) {
        // Ignore if error because column exists or IF NOT EXISTS not supported
        logger.debug('Note: sessions.org_id column check complete');
      }

      // Messages table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_org_id ON sessions(org_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
      `);

      logger.info('Database tables created/verified');
    } catch (error) {
      logger.error('Failed to create tables', { error: String(error) });
      // Don't throw - tables might already exist
    }
  }

  async createSession(userId?: string, title?: string, orgId?: string): Promise<ChatSession> {
    try {
      const result = await this.pool.query<any>(
        `INSERT INTO sessions (user_id, title, org_id)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, org_id, title, created_at, updated_at, archived`,
        [userId || null, title || 'New Chat', orgId || null]
      );

      const session = result.rows[0];
      logger.info('Session created', { sessionId: session.id, userId, orgId });

      return {
        id: session.id,
        userId: session.user_id,
        orgId: session.org_id,
        title: session.title,
        createdAt: session.created_at,
        archived: session.archived,
      };
    } catch (error) {
      logger.error('Failed to create session', { error: String(error) });
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const result = await this.pool.query<any>(
        `SELECT id, user_id, org_id, title, created_at, updated_at, archived
         FROM sessions WHERE id = $1`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        orgId: row.org_id,
        title: row.title,
        createdAt: row.created_at,
        archived: row.archived,
      };
    } catch (error) {
      logger.error('Failed to get session', { error: String(error), sessionId });
      throw error;
    }
  }

  async getUserSessions(userId: string, orgId?: string): Promise<ChatSession[]> {
    try {
      let query = `SELECT id, user_id, org_id, title, created_at, updated_at, archived
                   FROM sessions WHERE user_id = $1`;
      const params: any[] = [userId];

      if (orgId) {
        query += ` AND org_id = $2`;
        params.push(orgId);
      } else {
        query += ` AND org_id IS NULL`;
      }

      query += ` ORDER BY created_at DESC`;

      const result = await this.pool.query<any>(query, params);

      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        orgId: row.org_id,
        title: row.title,
        createdAt: row.created_at,
        archived: row.archived,
      }));
    } catch (error) {
      logger.error('Failed to get user sessions', { error: String(error), userId, orgId });
      throw error;
    }
  }

  async addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, any>
  ): Promise<Message> {
    try {
      const result = await this.pool.query<any>(
        `INSERT INTO messages (session_id, role, content, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING id, session_id, role, content, metadata, created_at`,
        [sessionId, role, content, metadata ? JSON.stringify(metadata) : null]
      );

      const row = result.rows[0];

      // Update session's updated_at timestamp
      await this.pool.query('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [sessionId]);

      return {
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        timestamp: row.created_at,
        metadata: row.metadata
          ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata)
          : undefined,
      };
    } catch (error) {
      logger.error('Failed to add message', { error: String(error), sessionId });
      throw error;
    }
  }

  async getSessionMessages(sessionId: string, limit: number = 50): Promise<Message[]> {
    try {
      const result = await this.pool.query<any>(
        `SELECT id, session_id, role, content, metadata, created_at
         FROM messages WHERE session_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [sessionId, limit]
      );

      return result.rows.reverse().map(row => ({
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        timestamp: row.created_at,
        metadata: row.metadata
          ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata)
          : undefined,
      }));
    } catch (error) {
      logger.error('Failed to get session messages', { error: String(error), sessionId });
      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      logger.info('Session deleted', { sessionId });
    } catch (error) {
      logger.error('Failed to delete session', { error: String(error), sessionId });
      throw error;
    }
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    try {
      await this.pool.query(
        'UPDATE sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [title, sessionId]
      );
      logger.info('Session title updated', { sessionId, title });
    } catch (error) {
      logger.error('Failed to update session title', { error: String(error), sessionId });
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rowCount === 1;
    } catch (error) {
      logger.warn('SessionService health check failed', { error: String(error) });
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('Database pool closed');
    } catch (error) {
      logger.error('Failed to close database pool', { error: String(error) });
    }
  }
}

export const sessionService = new SessionService();
export default SessionService;
