# RAG Pipeline

A comprehensive Retrieval-Augmented Generation system with a modern chat UI for document Q&A.

## ✨ Features

- 📄 **Multi-format Support**: PDF and TXT document processing
- 🧠 **Intelligent QA**: Context-aware question answering with source attribution
- 💬 **Modern Chat UI**: ChatGPT-inspired interface for seamless interaction
- 📤 **Document Upload**: Easy file upload with real-time processing status
- 💾 **Conversation Memory**: Persistent conversation sessions
- 🔄 **Version Control**: Document versioning and rollback capabilities
- 📊 **Analytics**: Comprehensive usage statistics and monitoring
- 🔍 **Advanced Search**: Full-text and metadata search
- 📝 **Rich Metadata**: Automatic document metadata extraction
- 📊 **Performance Monitoring**: Built-in logging and metrics API
- ⚡ **Performance Optimization**: Fast mode for reduced latency (optional)

This RAG (Retrieval-Augmented Generation) pipeline answers questions from PDF documents using vector embeddings and ChromaDB.

## ⚡ Performance Optimization

### Fast Mode
For faster response times, you can enable Fast Mode which disables expensive LLM operations:

```bash
# Quick enable script
./enable-fast-mode.sh

# Or manually set environment variables
export QA_FAST_MODE=true
```

**What Fast Mode disables:**
- Query rewriting (uses original question)
- LLM-based re-ranking (uses semantic similarity)
- Narrative context building (uses direct chunks)

**Performance impact:**
- **Response time**: ~5-10x faster (from 11s to ~1-2s)
- **Accuracy**: Slightly reduced (still very good for most use cases)
- **API costs**: Significantly lower

**When to use Fast Mode:**
- High-traffic applications
- Cost-sensitive deployments
- Real-time chat applications
- When speed is prioritized over maximum accuracy

To disable Fast Mode, restart the server without the environment variables or set `QA_FAST_MODE=false`.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- Docker (for running ChromaDB locally)

### 🔧 Troubleshooting: ChromaDB Reset

If you encounter ChromaConnectionError (status: 422) or data mismatch errors when switching between different embedding models, use the reset script to clear the database:

```bash
# Option 1: Direct script execution
node reset_chromadb.js

# Option 2: Using npm script
npm run reset:chromadb
```

**When to use this script:**
- Switching from Hugging Face models to Google models (or vice versa)
- Getting dimension mismatch errors (e.g., 384 vs 3072 dimensions)
- ChromaDB collections have incompatible embedding configurations
- Starting fresh with a new embedding model

**What it does:**
- Connects to your ChromaDB instance
- Deletes all existing collections and their data
- Allows your application to start fresh with the new embedding model

### 1. Install Dependencies
```bash
npm install
```

### 2. Start ChromaDB Locally
```bash
# Using Docker (recommended)
¸npm run chromadb:start

# Or manually with Docker
docker run -d --name chromadb -p 8000:8000 chromadb/chroma
```

### 3. Verify ChromaDB Connection
```bash
npm run chromadb:status  # Check if running
npm run chromadb:test    # Test connection
```

### 4. Start the API Server
```bash
npm start
```

## 📋 Available Scripts

### ChromaDB Management
- `npm run chromadb:start` - Start ChromaDB container
- `npm run chromadb:stop` - Stop and remove ChromaDB container
- `npm run chromadb:status` - Check ChromaDB status
- `npm run chromadb:logs` - View ChromaDB logs
- `npm run chromadb:test` - Test ChromaDB connection

### Application Scripts
- `npm start` - Start the API server
- `npm run frontend` - Start the React frontend (port 3001)
- `npm run dev` - Start both backend and frontend concurrently
- `npm run dev:backend` - Start only the backend server
- `npm run dev:frontend` - Start only the frontend
- `npm run ingest` - Run document ingestion
- `npm run test-ingest` - Run ingestion tests

## 🔧 Configuration

Create a `.env` file in the root directory:

```env
# ChromaDB Configuration
CHROMA_DB_URL=http://localhost:8000
CHROMA_COLLECTION_NAME=rag_documents

# HuggingFace API (for embeddings)
HF_API_KEY=your_huggingface_api_key_here
HF_MODEL=sentence-transformers/all-MiniLM-L6-v2

# LLM Configuration (choose one provider)
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
# OPENAI_MODEL=gpt-3.5-turbo  # or gpt-4, gpt-4-turbo

# Anthropic Configuration (alternative to OpenAI)
# ANTHROPIC_API_KEY=your_anthropic_api_key_here
# ANTHROPIC_MODEL=claude-3-haiku-20240307  # or claude-3-sonnet-20240229

# Google Gemini Configuration (alternative to OpenAI/Anthropic)
# GOOGLE_API_KEY=your_google_api_key_here
# GEMINI_MODEL=gemini-1.5-flash  # or gemini-1.5-pro

# LLM Provider Settings
LLM_PROVIDER=openai  # or 'anthropic', 'google', or 'gemini'
LLM_MODEL=gpt-3.5-turbo  # model name (will use defaults if not specified)
LLM_TEMPERATURE=0.3  # creativity level (0.0 = deterministic, 1.0 = creative)
LLM_MAX_TOKENS=2000  # maximum response length

# Server Configuration
PORT=3000
NODE_ENV=development
```

## 📚 API Endpoints

### Document Management
- `POST /api/documents/upload` - Upload PDF/TXT files
- `POST /api/documents/ingest` - Process and store documents
- `GET /api/documents` - List stored documents

### Question Answering
- `POST /api/qa/ask` - Ask questions about uploaded documents

### Health Check
- `GET /api/health` - Check service health

## 💻 Frontend Chat UI

The application includes a modern, ChatGPT-inspired web interface for easy interaction:

### Features
- **Document Upload**: Drag & drop or click to upload PDF/TXT files
- **Real-time Chat**: Ask questions and get instant AI responses
- **Source Attribution**: See which documents and chunks were used for answers
- **Confidence Scores**: View confidence levels for each response
- **Conversation History**: Persistent chat sessions with context
- **Responsive Design**: Works on desktop and mobile devices

### Accessing the UI
1. Start both services: `npm run dev`
2. Open http://localhost:3001 in your browser
3. Upload documents and start asking questions!

### UI Workflow
1. **Upload**: Click "Choose File" to add documents to your knowledge base
2. **Process**: Documents are automatically processed and indexed
3. **Ask**: Type questions in the chat input
4. **Review**: Check sources and confidence scores in responses

## 🛠️ Manual ChromaDB Setup

If you prefer not to use Docker, you can install ChromaDB directly:

### Option 1: Python Installation
```bash
pip install chromadb
chroma run --host 0.0.0.0 --port 8000
```

### Option 2: Direct from Source
```bash
git clone https://github.com/chroma-core/chroma.git
cd chroma
pip install -e .
chroma run --host 0.0.0.0 --port 8000
```

## 📁 Project Structure

```
rag_pip/
├── src/
│   ├── core/
│   │   ├── agent.js
│   │   └── server.js          # Express server
│   ├── processing/
│   │   ├── ingest.js          # Document ingestion
│   │   └── verify_retrieval.js
│   ├── services/
│   │   ├── document-processor.js    # PDF/TXT processing
│   │   ├── embedding-service.js     # HuggingFace embeddings
│   │   ├── langchain-manager.js
│   │   └── vector-store.js          # ChromaDB integration
│   └── utils/
│       └── helpers.js
├── data/
│   ├── docs/                 # Document storage
│   └── processed/            # Processed data
├── chromadb/                 # ChromaDB data (created by Docker)
└── uploads/                  # Uploaded files
```

## 🐳 Docker Alternative Setup

For production or advanced setups, use Docker Compose:

```yaml
# docker-compose.yml
version: '3.8'
services:
  rag-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - CHROMA_DB_URL=http://chromadb:8000
    depends_on:
      - chromadb

  chromadb:
    image: chromadb/chroma
    ports:
      - "8000:8000"
    volumes:
      - chromadb_data:/chroma/chroma

volumes:
  chromadb_data:
```

## 🔍 Troubleshooting

### ChromaDB Connection Issues
```bash
# Check if ChromaDB is running
docker ps | grep chromadb

# View logs
docker logs chromadb

# Restart ChromaDB
npm run chromadb:stop
npm run chromadb:start
```

### Port Conflicts
If port 8000 is already in use, you can run ChromaDB on a different port:
```bash
docker run -d --name chromadb -p 8001:8000 chromadb/chroma
# Then update CHROMA_DB_URL in .env to http://localhost:8001
```

### Memory Issues
For large document collections, ensure Docker has sufficient memory allocated in Docker Desktop settings.

## 📖 Additional Resources

- [ChromaDB Documentation](https://docs.trychroma.com/)
- [LangChain Documentation](https://js.langchain.com/docs/)
- [HuggingFace API Docs](https://huggingface.co/docs/api-inference/index)
