import axios from 'axios';
import { PDFParse } from 'pdf-parse';
import { documentService } from './documentService';
import logger from '../utils/logger';
import { Pool } from 'pg';
import { config } from '../config/env';

export interface Resource {
    id: string;
    type: 'pdf' | 'github';
    name: string;
    source: string;       // filename or repo URL
    status: 'processing' | 'indexed' | 'failed';
    chunks_count: number;
    error?: string;
    created_at: Date;
    uploaded_by: string;
}

class ResourceService {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: config.database.url,
            max: config.database.poolSize,
            idleTimeoutMillis: config.database.idleTimeout,
        });
    }

    async initialize(): Promise<void> {
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS resources (
                    id VARCHAR(255) PRIMARY KEY,
                    type VARCHAR(20) NOT NULL,
                    name VARCHAR(500) NOT NULL,
                    source TEXT NOT NULL,
                    org_id VARCHAR(255),
                    status VARCHAR(20) DEFAULT 'processing',
                    chunks_count INT DEFAULT 0,
                    error TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    uploaded_by VARCHAR(255)
                )
            `);

            // Migration: Add org_id column if it doesn't exist
            try {
                await this.pool.query('ALTER TABLE resources ADD COLUMN IF NOT EXISTS org_id VARCHAR(255)');
            } catch (err) {
                logger.debug('Note: resources.org_id column check complete');
            }

            await this.pool.query(`
                CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
                CREATE INDEX IF NOT EXISTS idx_resources_org_id ON resources(org_id);
            `);

            logger.info('Resources table verified');
        } catch (error) {
            logger.error('Failed to create resources table', { error: String(error) });
        }
    }

    /**
     * Process a PDF buffer: extract text, chunk it, index into vector DB
     */
    async processPDF(
        buffer: Buffer,
        filename: string,
        uploadedBy: string,
        orgId?: string
    ): Promise<Resource> {
        const { v4: uuidv4 } = await import('uuid');
        const resourceId = uuidv4();

        // Insert record as "processing"
        await this.pool.query(
            `INSERT INTO resources (id, type, name, source, status, uploaded_by, org_id)
             VALUES ($1, 'pdf', $2, $3, 'processing', $4, $5)`,
            [resourceId, filename, filename, uploadedBy, orgId || null]
        );

        try {
            // Extract text from PDF
            const parser = new PDFParse({ data: buffer });
            const textData = await parser.getText();
            const info = await parser.getInfo();
            const text = textData.text;

            if (!text || text.trim().length < 10) {
                throw new Error('PDF contains no extractable text');
            }

            logger.info('PDF text extracted', {
                filename,
                pages: info.total,
                textLength: text.length,
            });

            // Process and index via existing document service
            const doc = await documentService.processDocument(
                filename.replace(/\.pdf$/i, ''),
                text,
                {
                    source: 'pdf-upload',
                    category: 'uploaded-document',
                    url: `upload://${filename}`,
                    orgId: orgId, // Pass orgId to vector DB meta
                }
            );

            // Update record as "indexed"
            await this.pool.query(
                `UPDATE resources SET status = 'indexed', chunks_count = $1 WHERE id = $2`,
                [doc.chunks.length, resourceId]
            );

            logger.info('PDF indexed successfully', {
                resourceId,
                filename,
                chunks: doc.chunks.length,
                orgId
            });

            return this.getResource(resourceId) as Promise<Resource>;
        } catch (error: any) {
            // Update record as "failed"
            await this.pool.query(
                `UPDATE resources SET status = 'failed', error = $1 WHERE id = $2`,
                [error.message, resourceId]
            );
            logger.error('PDF processing failed', { filename, error: error.message });
            throw error;
        }
    }

    /**
     * Process a GitHub repo: fetch README + code files, chunk, index
     */
    async processGitHubRepo(
        repoUrl: string,
        uploadedBy: string,
        orgId?: string
    ): Promise<Resource> {
        const { v4: uuidv4 } = await import('uuid');
        const resourceId = uuidv4();

        // Parse owner/repo from URL
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\s#?]+)/);
        if (!match) {
            throw new Error('Invalid GitHub URL. Use format: https://github.com/owner/repo');
        }
        const [, owner, repo] = match;
        const repoName = `${owner}/${repo.replace(/\.git$/, '')}`;

        // Insert record as "processing"
        await this.pool.query(
            `INSERT INTO resources (id, type, name, source, status, uploaded_by, org_id)
             VALUES ($1, 'github', $2, $3, 'processing', $4, $5)`,
            [resourceId, repoName, repoUrl, uploadedBy, orgId || null]
        );

        try {
            // Fetch repo contents via GitHub API (no auth required for public repos)
            const apiBase = `https://api.github.com/repos/${repoName}`;

            // 1. Fetch README
            let readmeText = '';
            try {
                const readmeRes = await axios.get(`${apiBase}/readme`, {
                    headers: { Accept: 'application/vnd.github.v3.raw' },
                    timeout: 15000,
                });
                readmeText = readmeRes.data;
                logger.info('README fetched', { repo: repoName, length: readmeText.length });
            } catch {
                logger.warn('No README found for repo', { repo: repoName });
            }

            // 2. Fetch file tree (recursive, limited to 1000 files)
            const treeRes = await axios.get(`${apiBase}/git/trees/HEAD?recursive=1`, {
                timeout: 15000,
            });
            const tree = treeRes.data.tree || [];

            // Filter to code/doc files only
            const allowedExtensions = [
                '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs',
                '.md', '.mdx', '.txt', '.yaml', '.yml', '.json', '.toml',
                '.css', '.scss', '.html', '.xml', '.sql', '.sh', '.env.example',
                '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift', '.kt',
            ];

            const codeFiles = tree.filter((f: any) => {
                if (f.type !== 'blob') return false;
                if (f.size > 100000) return false; // skip files > 100KB
                const ext = '.' + f.path.split('.').pop()?.toLowerCase();
                return allowedExtensions.includes(ext);
            });

            // Limit to 50 files max to avoid rate limits
            const filesToFetch = codeFiles.slice(0, 50);

            logger.info('Fetching repo files', {
                repo: repoName,
                totalFiles: codeFiles.length,
                fetching: filesToFetch.length,
            });

            // 3. Fetch each file's content
            let totalChunks = 0;
            const batchSize = 5;

            // Index README first
            if (readmeText.length > 10) {
                const readmeDoc = await documentService.processDocument(
                    `${repoName} - README`,
                    readmeText,
                    {
                        source: 'github',
                        category: 'repository',
                        url: `https://github.com/${repoName}`,
                        orgId: orgId,
                    }
                );
                totalChunks += readmeDoc.chunks.length;
            }

            // Index code files in batches
            for (let i = 0; i < filesToFetch.length; i += batchSize) {
                const batch = filesToFetch.slice(i, i + batchSize);

                const results = await Promise.allSettled(
                    batch.map(async (file: any) => {
                        try {
                            const fileRes = await axios.get(
                                `${apiBase}/contents/${file.path}`,
                                {
                                    headers: { Accept: 'application/vnd.github.v3.raw' },
                                    timeout: 10000,
                                }
                            );

                            const content = typeof fileRes.data === 'string'
                                ? fileRes.data
                                : JSON.stringify(fileRes.data, null, 2);

                            if (content.length < 20) return 0;

                            const doc = await documentService.processDocument(
                                `${repoName}/${file.path}`,
                                `// File: ${file.path}\n\n${content}`,
                                {
                                    source: 'github',
                                    category: 'repository',
                                    url: `https://github.com/${repoName}/blob/HEAD/${file.path}`,
                                    orgId: orgId,
                                }
                            );
                            return doc.chunks.length;
                        } catch {
                            return 0;
                        }
                    })
                );

                for (const r of results) {
                    if (r.status === 'fulfilled') totalChunks += r.value;
                }

                // Small delay to avoid rate limits
                if (i + batchSize < filesToFetch.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // Update record as "indexed"
            await this.pool.query(
                `UPDATE resources SET status = 'indexed', chunks_count = $1 WHERE id = $2`,
                [totalChunks, resourceId]
            );

            logger.info('GitHub repo indexed successfully', {
                resourceId,
                repo: repoName,
                totalChunks,
                filesProcessed: filesToFetch.length,
                orgId
            });

            return this.getResource(resourceId) as Promise<Resource>;
        } catch (error: any) {
            await this.pool.query(
                `UPDATE resources SET status = 'failed', error = $1 WHERE id = $2`,
                [error.message, resourceId]
            );
            logger.error('GitHub repo processing failed', { repoUrl, error: error.message });
            throw error;
        }
    }

    /**
     * Get a single resource by ID
     */
    async getResource(id: string): Promise<Resource | null> {
        const result = await this.pool.query('SELECT * FROM resources WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    /**
     * List resources filtered by organization
     */
    async listResources(orgId?: string): Promise<Resource[]> {
        let query = 'SELECT * FROM resources';
        const params: any[] = [];

        if (orgId) {
            query += ' WHERE org_id = $1';
            params.push(orgId);
        } else {
            query += ' WHERE org_id IS NULL';
        }

        query += ' ORDER BY created_at DESC';

        const result = await this.pool.query(query, params);
        return result.rows;
    }

    /**
     * Delete a resource record
     */
    async deleteResource(id: string): Promise<void> {
        await this.pool.query('DELETE FROM resources WHERE id = $1', [id]);
        logger.info('Resource deleted', { id });
    }
}

export const resourceService = new ResourceService();
export default ResourceService;
