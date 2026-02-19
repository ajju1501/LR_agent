import { Pool } from 'pg';
import { config } from '../config/env';
import { UserRole } from './loginRadiusService';
import logger from '../utils/logger';

export interface UserRow {
    uid: string;
    email: string;
    roles: UserRole[];
    created_at?: Date;
    updated_at?: Date;
}

class UserService {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: config.database.url,
            max: config.database.poolSize,
            idleTimeoutMillis: config.database.idleTimeout,
        });

        this.pool.on('error', (error: Error) => {
            logger.error('PostgreSQL pool error in UserService', { error: String(error) });
        });
    }

    async initialize(): Promise<void> {
        try {
            await this.createTables();
            logger.info('UserService initialized');
        } catch (error) {
            logger.error('Failed to initialize UserService', { error: String(error) });
            throw error;
        }
    }

    private async createTables(): Promise<void> {
        try {
            // Users table to store roles and profile info locally
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    uid VARCHAR(255) PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    roles JSONB DEFAULT '["user"]',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create index on email
            await this.pool.query(`
                CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            `);

            logger.info('Database users table verified');
        } catch (error) {
            logger.error('Failed to create users table', { error: String(error) });
        }
    }

    /**
     * Upsert user in local database.
     * This ensures user exists and has roles.
     */
    async upsertUser(user: { uid: string; email: string; defaultRoles?: UserRole[] }): Promise<UserRow> {
        try {
            const roles = user.defaultRoles || ['user'];

            // Note: We don't overwrite roles if the user already exists, 
            // unless we specifically want to sync them.
            const result = await this.pool.query(
                `INSERT INTO users (uid, email, roles)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (uid) DO UPDATE
                 SET email = EXCLUDED.email,
                     updated_at = CURRENT_TIMESTAMP
                 RETURNING uid, email, roles, created_at, updated_at`,
                [user.uid, user.email, JSON.stringify(roles)]
            );

            const row = result.rows[0];
            return {
                uid: row.uid,
                email: row.email,
                roles: row.roles,
                created_at: row.created_at,
                updated_at: row.updated_at
            };
        } catch (error) {
            logger.error('Failed to upsert user', { error: String(error), uid: user.uid });
            throw error;
        }
    }

    /**
     * Ensure user exists in local DB. 
     * If not found, create with default roles.
     */
    async ensureUser(uid: string, email: string): Promise<UserRow> {
        try {
            const result = await this.pool.query(
                'SELECT uid, email, roles FROM users WHERE uid = $1',
                [uid]
            );

            if (result.rows.length > 0) {
                const row = result.rows[0];
                return { uid: row.uid, email: row.email, roles: row.roles };
            }

            // Create if missing
            return await this.upsertUser({ uid, email, defaultRoles: ['user'] });
        } catch (error) {
            logger.error('Failed to ensure user', { error: String(error), uid });
            throw error;
        }
    }

    async getUserRoles(uid: string): Promise<UserRole[]> {
        try {
            const result = await this.pool.query(
                'SELECT roles FROM users WHERE uid = $1',
                [uid]
            );

            if (result.rows.length === 0) {
                return ['user']; // Default role if not found
            }

            return result.rows[0].roles || ['user'];
        } catch (error) {
            logger.warn('Failed to fetch user roles from DB, defaulting to ["user"]', { uid, error: String(error) });
            return ['user'];
        }
    }

    async updateUserRoles(uid: string, roles: UserRole[]): Promise<void> {
        try {
            // Only update if roles have actually changed to avoid DB write-spam
            const currentRoles = await this.getUserRoles(uid);
            const isDifferent = roles.length !== currentRoles.length ||
                roles.some(r => !currentRoles.includes(r));

            if (isDifferent) {
                await this.pool.query(
                    'UPDATE users SET roles = $1, updated_at = CURRENT_TIMESTAMP WHERE uid = $2',
                    [JSON.stringify(roles), uid]
                );
                logger.info('User roles updated in DB', { uid, roles });
            }
        } catch (error) {
            logger.error('Failed to update user roles in DB', { uid, error: String(error) });
            throw error;
        }
    }
}

export const userService = new UserService();
export default UserService;
