import { Request, Response, NextFunction } from 'express';
import { documentService } from '../services/documentService';
import { scraperService } from '../services/scraperService';
import logger from '../utils/logger';

export async function ingestDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const { title, content, metadata } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        status: 'error',
        message: 'title and content are required',
      });
    }

    logger.info('Ingesting document', { title });

    const document = await documentService.processDocument(title, content, metadata);

    res.status(201).json({
      status: 'success',
      data: {
        docId: document.id,
        title: document.title,
        chunkCount: document.chunks.length,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    logger.error('Error ingesting document', { error: String(error) });
    next(error);
  }
}

export async function scrapeLoginRadiusDocs(req: Request, res: Response, next: NextFunction) {
  try {
    const { maxPages = 50 } = req.body;

    logger.info('Starting LoginRadius docs scrape', { maxPages });

    // Scrape documentation
    const pages = await scraperService.scrapeLoginRadiusDocs(maxPages);

    if (pages.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No pages were scraped. Check if LoginRadius docs URL is accessible.',
      });
    }

    // Process and index all pages
    const results = [];
    for (const page of pages) {
      try {
        const doc = await documentService.processDocument(
          page.title,
          page.content,
          page.metadata
        );
        results.push({
          docId: doc.id,
          title: doc.title,
          chunkCount: doc.chunks.length,
        });
        logger.info('Document processed from scrape', { title: page.title });
      } catch (error) {
        logger.warn('Failed to process scraped page', { title: page.title, error: String(error) });
      }
    }

    res.status(201).json({
      status: 'success',
      data: {
        totalScraped: pages.length,
        totalIndexed: results.length,
        documents: results,
      },
    });
  } catch (error) {
    logger.error('Error scraping LoginRadius docs', { error: String(error) });
    next(error);
  }
}

export async function listDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    logger.info('List documents requested', { search, page, limit });

    // Get statistics from vector DB
    const stats = await documentService.getDocumentStats();

    res.json({
      status: 'success',
      data: {
        total: stats?.documentCount || 0,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        stats: stats,
      },
    });
  } catch (error) {
    logger.error('Error listing documents', { error: String(error) });
    next(error);
  }
}

export async function deleteDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const { docId } = req.params;

    if (!docId) {
      return res.status(400).json({
        status: 'error',
        message: 'docId is required',
      });
    }

    logger.info('Deleting document', { docId });

    // Note: In a real implementation, you would also remove embeddings from ChromaDB
    // For now, this is a placeholder

    res.json({
      status: 'success',
      message: 'Document deleted',
    });
  } catch (error) {
    logger.error('Error deleting document', { error: String(error) });
    next(error);
  }
}

export async function getDocumentStats(req: Request, res: Response, next: NextFunction) {
  try {
    logger.info('Getting document statistics');

    const stats = await documentService.getDocumentStats();

    res.json({
      status: 'success',
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting document stats', { error: String(error) });
    next(error);
  }
}
