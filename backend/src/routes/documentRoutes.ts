import { Router } from 'express';
import multer from 'multer';
import * as documentController from '../controllers/documentController';
import * as resourceController from '../controllers/resourceController';

const router = Router();

// Configure multer for PDF uploads (in-memory storage, 20MB limit)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
});

// ──────── Document routes ────────

// POST /api/documents/ingest - Ingest a new document
router.post('/ingest', documentController.ingestDocument);

// POST /api/documents/scrape-loginradius - Scrape LoginRadius docs
router.post('/scrape-loginradius', documentController.scrapeLoginRadiusDocs);

// GET /api/documents - List all documents
router.get('/', documentController.listDocuments);

// GET /api/documents/stats - Get document statistics
router.get('/stats', documentController.getDocumentStats);

// DELETE /api/documents/:docId - Delete a document
router.delete('/:docId', documentController.deleteDocument);

// ──────── Resource routes (PDF + GitHub) ────────

// POST /api/documents/upload-pdf - Upload a PDF
router.post('/upload-pdf', upload.single('pdf'), resourceController.uploadPDF);

// POST /api/documents/ingest-github - Ingest a GitHub repo
router.post('/ingest-github', resourceController.ingestGitHubRepo);

// GET /api/documents/resources - List all resources
router.get('/resources', resourceController.listResources);

// DELETE /api/documents/resources/:id - Delete a resource
router.delete('/resources/:id', resourceController.deleteResource);

export default router;
