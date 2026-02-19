import { Request, Response, NextFunction } from 'express';
import { resourceService } from '../services/resourceService';
import { AuthenticatedRequest } from '../middleware/auth';
import logger from '../utils/logger';

/**
 * POST /api/documents/upload-pdf
 * Upload a PDF file for indexing into the RAG pipeline
 */
export async function uploadPDF(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'No PDF file uploaded. Use form field name "pdf".',
            });
        }

        const file = req.file;

        // Validate file type
        if (file.mimetype !== 'application/pdf') {
            return res.status(400).json({
                status: 'error',
                message: 'Only PDF files are allowed',
            });
        }

        logger.info('PDF upload received', {
            filename: file.originalname,
            size: file.size,
            uploadedBy: req.user?.uid,
        });

        const resource = await resourceService.processPDF(
            file.buffer,
            file.originalname,
            req.user?.uid || 'unknown',
            req.user?.orgId
        );

        res.status(201).json({
            status: 'success',
            data: resource,
        });
    } catch (error: any) {
        logger.error('PDF upload failed', { error: error.message });
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to process PDF',
        });
    }
}

/**
 * POST /api/documents/ingest-github
 * Ingest a public GitHub repo into the RAG pipeline
 */
export async function ingestGitHubRepo(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const { repoUrl } = req.body;

        if (!repoUrl) {
            return res.status(400).json({
                status: 'error',
                message: 'repoUrl is required',
            });
        }

        // Validate URL
        if (!repoUrl.includes('github.com/')) {
            return res.status(400).json({
                status: 'error',
                message: 'Must be a valid GitHub URL (https://github.com/owner/repo)',
            });
        }

        logger.info('GitHub repo ingestion requested', {
            repoUrl,
            requestedBy: req.user?.uid,
            orgId: req.user?.orgId
        });

        const resource = await resourceService.processGitHubRepo(
            repoUrl,
            req.user?.uid || 'unknown',
            req.user?.orgId
        );

        res.status(201).json({
            status: 'success',
            data: resource,
        });
    } catch (error: any) {
        logger.error('GitHub repo ingestion failed', { error: error.message });
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to ingest GitHub repo',
        });
    }
}

/**
 * GET /api/documents/resources
 * List all uploaded resources (PDFs and GitHub repos)
 */
export async function listResources(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const resources = await resourceService.listResources(req.user?.orgId);

        res.json({
            status: 'success',
            data: resources,
        });
    } catch (error: any) {
        logger.error('Error listing resources', { error: error.message });
        next(error);
    }
}

/**
 * DELETE /api/documents/resources/:id
 * Delete a resource record
 */
export async function deleteResource(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;
        await resourceService.deleteResource(id);

        res.json({
            status: 'success',
            message: 'Resource deleted',
        });
    } catch (error: any) {
        logger.error('Error deleting resource', { error: error.message });
        next(error);
    }
}
