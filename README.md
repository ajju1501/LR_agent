# LoginRadius Documentation Chatbot

A RAG-based conversational chatbot for LoginRadius documentation, powered by HuggingFace Inference API.

## Features

- 💬 **AI Chat** — Ask questions about LoginRadius docs, get answers with code examples
- 📚 **RAG Pipeline** — Retrieval-Augmented Generation with source citations
- 🔗 **Source References** — Every answer links back to documentation sources
- 🧠 **HuggingFace LLM** — Cloud-based inference via HuggingFace router API
- 🕷️ **Doc Scraper** — Automatically scrapes and indexes LoginRadius documentation
- 💾 **Session Persistence** — Chat history saved in PostgreSQL

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js, React, TailwindCSS |
| **Backend** | Node.js, Express, TypeScript |
| **LLM** | HuggingFace Inference API (Qwen/Qwen3-Coder-Next) |
| **Embeddings** | sentence-transformers/all-MiniLM-L6-v2 |
| **Vector DB** | ChromaDB |
| **Database** | PostgreSQL |

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (for PostgreSQL & ChromaDB)
- HuggingFace API token ([get one here](https://huggingface.co/settings/tokens))

## Quick Start

### 1. Clone & configure

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set your HuggingFace token:
```
HF_TOKEN=hf_your_token_here
```

> **Important:** Your token needs the "Make calls to Inference Providers" permission. Create a **fine-grained** token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).

### 2. Start infrastructure

```bash
docker compose up -d   # PostgreSQL + ChromaDB
```

### 3. Start backend

```bash
cd backend
npm install
npm run dev
```

### 4. Start frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
LR_agent/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts              # Environment config
│   │   │   ├── huggingface.ts      # HuggingFace API client
│   │   │   └── database.ts         # ChromaDB manager
│   │   ├── controllers/
│   │   │   ├── chatController.ts   # Chat API handlers
│   │   │   └── documentController.ts
│   │   ├── routes/
│   │   │   ├── chatRoutes.ts       # /api/chat/*
│   │   │   └── documentRoutes.ts   # /api/documents/*
│   │   ├── services/
│   │   │   ├── llmService.ts       # LLM response generation
│   │   │   ├── embeddingService.ts # Text embeddings
│   │   │   ├── ragPipelineService.ts # RAG orchestration
│   │   │   ├── retrievalService.ts # Vector search
│   │   │   ├── scraperService.ts   # Doc scraper
│   │   │   ├── documentService.ts  # Document processing
│   │   │   └── sessionService.ts   # Chat sessions (PostgreSQL)
│   │   ├── types/
│   │   │   └── index.ts            # TypeScript interfaces
│   │   ├── utils/
│   │   │   ├── promptBuilder.ts    # RAG prompt construction
│   │   │   ├── chunkDocument.ts    # Text chunking
│   │   │   └── logger.ts           # Winston logger
│   │   ├── app.ts                  # Express app setup
│   │   └── server.ts               # Server entry point
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/                    # Next.js pages
│   │   ├── components/             # React components
│   │   ├── context/ChatContext.tsx  # Chat state management
│   │   ├── lib/
│   │   │   ├── api.ts              # Backend API client
│   │   │   └── types.ts            # Frontend types
│   │   └── styles/globals.css
│   └── package.json
├── docker-compose.yml
└── init.sql
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HF_TOKEN` | HuggingFace API token | *(required)* |
| `HF_MODEL` | Chat model | `Qwen/Qwen3-Coder-Next:novita` |
| `HF_EMBEDDING_MODEL` | Embedding model | `sentence-transformers/all-MiniLM-L6-v2` |
| `HF_BASE_URL` | HuggingFace API base | `https://router.huggingface.co/v1` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://chatbot_user:chatbot_pass@localhost:5432/lr_chatbot` |
| `PORT` | Backend port | `5000` |
| `FRONTEND_URL` | Frontend URL (CORS) | `http://localhost:3000` |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/new` | Create a new chat session |
| POST | `/api/chat/send` | Send a message |
| GET | `/api/chat/sessions` | List user sessions |
| GET | `/api/chat/history/:id` | Get chat history |
| DELETE | `/api/chat/:id` | Delete a session |
| POST | `/api/documents/ingest` | Ingest a document |
| POST | `/api/documents/scrape-loginradius` | Scrape LR docs |
| GET | `/api/documents` | List documents |
| GET | `/api/health` | Health check |

## Troubleshooting

### HuggingFace 403 error
Your token doesn't have "Inference Providers" permission. Create a new **fine-grained** token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) with that permission enabled.

### HuggingFace 429 rate limit
The client has built-in retry with exponential backoff. If persistent, wait a few minutes or consider a paid HuggingFace plan.

### Database connection errors
Make sure Docker is running: `docker compose up -d`

## License

MIT
