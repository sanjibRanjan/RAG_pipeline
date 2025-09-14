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

This RAG (Retrieval-Augmented Generation) pipeline answers questions from PDF documents using vector embeddings and ChromaDB.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- Docker (for running ChromaDB locally)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start ChromaDB Locally
```bash
# Using Docker (recommended)
npm run chromadb:start

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
