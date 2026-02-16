import dotenv from 'dotenv';

dotenv.config();

export const config = {
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '5000', 10),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
  },
  huggingface: {
    baseURL: process.env.HF_BASE_URL || 'https://router.huggingface.co/v1',
    token: process.env.HF_TOKEN || '',
    model: process.env.HF_MODEL || 'Qwen/Qwen3-Coder-Next:novita',
    embeddingModel: process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
  },
  chromadb: {
    collection: process.env.CHROMADB_COLLECTION || 'loginradius_docs',
    persistDirectory: process.env.CHROMADB_PERSIST_DIRECTORY || './chroma_data'
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://chatbot_user:chatbot_pass@localhost:5432/lr_chatbot',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10)
  },
  scraper: {
    loginradiusDocsUrl: process.env.LOGINRADIUS_DOCS_URL || 'https://www.loginradius.com/docs/',
    timeout: parseInt(process.env.SCRAPER_TIMEOUT || '30000', 10),
    maxDepth: parseInt(process.env.SCRAPER_MAX_DEPTH || '5', 10),
    rateLimit: parseInt(process.env.SCRAPER_RATE_LIMIT || '1000', 10)
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log'
  },
  rag: {
    chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '512', 10),
    chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '50', 10),
    retrievalTopK: parseInt(process.env.RAG_RETRIEVAL_TOP_K || '5', 10),
    confidenceThreshold: parseFloat(process.env.RAG_CONFIDENCE_THRESHOLD || '0.5')
  },
  loginRadius: {
    apiKey: process.env.LR_API_KEY || '',
    apiSecret: process.env.LR_API_SECRET || '',
    appName: process.env.LR_APP_NAME || '',
  }
};

export default config;
