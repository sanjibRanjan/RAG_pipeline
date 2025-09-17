# RAG Pipeline - Detailed Project Architecture & Pipeline Documentation

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Core Components](#core-components)
4. [Data Flow Pipeline](#data-flow-pipeline)
5. [Service Interactions](#service-interactions)
6. [File Structure](#file-structure)
7. [API Endpoints](#api-endpoints)
8. [Configuration](#configuration)
9. [Deployment](#deployment)

## 🎯 Project Overview

This is a comprehensive **Retrieval-Augmented Generation (RAG)** pipeline that enables intelligent question-answering over document collections. The system processes PDF and TXT documents, creates vector embeddings, stores them in ChromaDB, and provides contextual answers using Large Language Models (LLMs).

### Key Features
- **Multi-format Document Processing**: PDF and TXT support with advanced chunking strategies
- **Vector-based Retrieval**: Semantic search using HuggingFace embeddings
- **LLM Integration**: Support for OpenAI, Anthropic Claude, and Google Gemini
- **Conversation Management**: Persistent chat sessions with context
- **Document Versioning**: Version control and rollback capabilities
- **Advanced Analytics**: Comprehensive logging and performance monitoring
- **RESTful API**: Complete REST API for all operations
- **Modern Frontend**: React-based chat interface

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        RAG PIPELINE ARCHITECTURE                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend UI   │    │   REST API      │    │   External APIs  │
│   (React)       │◄──►│   (Express)     │◄──►│   (LLM Services) │
│   Port: 3001    │    │   Port: 3000    │    │   (HuggingFace)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CORE SERVICES LAYER                          │
├─────────────────┬─────────────────┬─────────────────┬───────────┤
│ Document        │ Embedding       │ Vector Store    │ QA        │
│ Processor       │ Service         │ (ChromaDB)      │ Service   │
│                 │                 │                 │           │
│ • PDF/TXT       │ • HuggingFace   │ • Vector DB    │ • LLM     │
│   Processing    │   API           │ • Similarity   │   Manager │
│ • Chunking      │ • Batch         │   Search       │ • Answer  │
│ • Metadata      │   Processing    │ • Filtering    │   Gen.    │
│   Extraction    │ • Dimensions    │ • Versioning   │ • Context │
└─────────────────┴─────────────────┴─────────────────┴───────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA STORAGE LAYER                           │
├─────────────────┬─────────────────┬─────────────────┬───────────┤
│ File System     │ Vector Database │ Conversation    │ Logs      │
│                 │                 │ Memory          │           │
│ • uploads/      │ • ChromaDB      │ • Session Mgmt  │ • Winston │
│ • data/docs/    │ • Collections   │ • History       │ • Files   │
│ • processed/    │ • Embeddings    │ • Context       │ • Console │
└─────────────────┴─────────────────┴─────────────────┴───────────┘
```

## 🔧 Core Components

### 1. **Server Core** (`src/core/`)
- **`server.js`**: Main Express server with comprehensive API endpoints
- **`agent.js`**: (Currently empty - potential for future agent logic)

### 2. **Document Processing** (`src/services/document-processor.js`)
**Purpose**: Converts documents into structured, searchable chunks

**Key Features**:
- **Multi-format Support**: PDF (via pdf-parse) and TXT files
- **Advanced Chunking**: 
  - Semantic chunking (preserves document structure)
  - Sliding window chunking (adaptive sizing)
  - Basic LangChain chunking (fallback)
- **Metadata Extraction**: 
  - File statistics, content analysis
  - Language detection, complexity scoring
  - Topic extraction, entity recognition
  - Version control with file hashing
- **Content Analysis**:
  - Reading time estimation
  - Readability scoring
  - Technical level assessment
  - Keyword and phrase extraction

**Chunking Strategy**:
```javascript
// Advanced chunking configuration
const ADVANCED_CHUNK_CONFIG = {
  small: { size: 512, overlap: 128 },      // Code, definitions
  medium: { size: 1024, overlap: 256 },    // Normal paragraphs
  large: { size: 2048, overlap: 512 },     // Complex topics, tables
}
```

### 3. **Embedding Service** (`src/services/embedding-service.js`)
**Purpose**: Converts text into vector representations for semantic search

**Key Features**:
- **HuggingFace Integration**: Uses sentence-transformers models
- **Batch Processing**: Efficient handling of multiple texts
- **Model Flexibility**: Configurable embedding models
- **Error Handling**: Robust error management and retries

**Default Model**: `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions)

### 4. **Vector Store** (`src/services/vector-store.js`)
**Purpose**: Manages vector database operations and document storage

**Key Features**:
- **ChromaDB Integration**: Full CRUD operations
- **Advanced Search**: 
  - Semantic similarity search
  - Metadata filtering
  - Document versioning
- **Document Management**:
  - Version control and rollback
  - Document comparison
  - Statistics and analytics
- **Collection Management**: Automatic collection creation and management

### 5. **QA Service** (`src/services/qa-service.js`)
**Purpose**: Orchestrates question-answering with advanced reasoning

**Key Features**:
- **Mixed Retrieval**: Combines semantic, keyword, and metadata search
- **Advanced Re-ranking**: Multi-dimensional scoring system
- **LLM Integration**: Support for multiple LLM providers
- **Query Rewriting**: Intelligent query expansion for better retrieval
- **Confidence Scoring**: Sophisticated confidence calculation
- **Fallback Mechanisms**: Robust error handling and fallbacks

**Retrieval Strategy**:
```javascript
// Mixed retrieval combining multiple strategies
const retrievalPromises = [
  semanticSearch(weight: 0.5),    // Primary semantic search
  keywordSearch(weight: 0.3),     // Keyword matching
  metadataSearch(weight: 0.2)     // Metadata filtering
];
```

### 6. **LLM Manager** (`src/services/langchain-manager.js`)
**Purpose**: Abstracts LLM interactions across multiple providers

**Supported Providers**:
- **OpenAI**: GPT-3.5, GPT-4 models
- **Anthropic**: Claude models
- **Google**: Gemini models

**Key Features**:
- **Provider Abstraction**: Unified interface for all LLMs
- **Context Management**: Intelligent context preparation
- **Prompt Engineering**: Sophisticated prompt construction
- **Error Handling**: Retry logic and fallback mechanisms
- **Performance Optimization**: Token management and timeout handling

### 7. **Conversation Manager** (`src/services/conversation-manager.js`)
**Purpose**: Manages chat sessions and conversation history

**Key Features**:
- **Session Management**: Unique session IDs and persistence
- **Message History**: Structured conversation storage
- **Context Extraction**: Relevant context for follow-up questions
- **Cleanup**: Automatic cleanup of old conversations
- **Export/Import**: Data portability for debugging

### 8. **Logging System** (`src/utils/logger.js`)
**Purpose**: Comprehensive logging and monitoring

**Key Features**:
- **Winston Integration**: Professional logging framework
- **Multiple Transports**: File, console, and specialized loggers
- **Performance Monitoring**: Operation timing and metrics
- **Request Tracking**: Complete request/response logging
- **Health Monitoring**: Service health status tracking
- **Security Logging**: Authentication and access logging

## 🔄 Data Flow Pipeline

### Phase 1: Document Ingestion
```
1. File Upload (POST /api/documents/upload)
   ↓
2. File Validation (PDF/TXT, size limits)
   ↓
3. Document Processing (DocumentProcessor)
   ├── Text Extraction (PDF: pdf-parse, TXT: fs.readFile)
   ├── Advanced Chunking (semantic → sliding → basic)
   ├── Metadata Extraction (comprehensive analysis)
   └── Version Control (file hashing, version detection)
   ↓
4. Embedding Generation (EmbeddingService)
   ├── Batch Processing (efficient API calls)
   ├── Model Selection (configurable HuggingFace models)
   └── Error Handling (retries, fallbacks)
   ↓
5. Vector Storage (VectorStore)
   ├── ChromaDB Integration (collection management)
   ├── Metadata Cleansing (type validation)
   └── ID Generation (unique document/chunk IDs)
```

### Phase 2: Question Answering
```
1. Question Input (POST /api/qa/ask)
   ↓
2. Query Processing (QAService)
   ├── Query Rewriting (LLM-based expansion)
   ├── Embedding Generation (question vectorization)
   └── Session Management (conversation context)
   ↓
3. Mixed Retrieval (QAService)
   ├── Semantic Search (vector similarity)
   ├── Keyword Search (text matching)
   ├── Metadata Search (filtered retrieval)
   └── Reciprocal Rank Fusion (result combination)
   ↓
4. Advanced Re-ranking (QAService)
   ├── Multi-dimensional Scoring
   │   ├── Semantic Similarity (0.35 weight)
   │   ├── Keyword Matching (0.25 weight)
   │   ├── Recency Score (0.15 weight)
   │   ├── Authority Score (0.10 weight)
   │   ├── Diversity Score (0.10 weight)
   │   └── Position Score (0.05 weight)
   └── Composite Score Calculation
   ↓
5. Answer Generation (LangChainManager)
   ├── Context Preparation (intelligent chunk selection)
   ├── Prompt Engineering (question-type specific)
   ├── LLM Generation (provider-specific calls)
   └── Response Processing (validation, cleaning)
   ↓
6. Response Assembly (QAService)
   ├── Source Attribution (document references)
   ├── Confidence Calculation (multi-factor scoring)
   ├── Conversation Update (session management)
   └── Response Formatting (structured output)
```

## 🔗 Service Interactions

### Service Dependency Graph
```
Server (Express)
├── DocumentProcessor (standalone)
├── EmbeddingService (standalone)
├── VectorStore (standalone)
├── ConversationManager (standalone)
├── QAService
│   ├── EmbeddingService (dependency)
│   ├── VectorStore (dependency)
│   └── LangChainManager (dependency)
└── LangChainManager (standalone)
```

### Initialization Sequence
```javascript
// Server startup sequence
1. Environment validation
2. Service instantiation
3. Service initialization (parallel)
   ├── EmbeddingService.initialize()
   ├── VectorStore.initialize()
   └── QAService.initialize()
     └── LangChainManager.initialize()
4. Health checks
5. Server startup
```

## 📁 File Structure

```
rag_pip/
├── 📁 src/
│   ├── 📁 core/                    # Core server components
│   │   ├── server.js              # Main Express server (1584 lines)
│   │   └── agent.js               # Agent logic (empty)
│   ├── 📁 processing/             # Document processing
│   │   ├── ingest.js              # Batch ingestion script
│   │   └── verify_retrieval.js    # Retrieval verification
│   ├── 📁 services/               # Core business logic
│   │   ├── document-processor.js  # Document processing (1197 lines)
│   │   ├── embedding-service.js   # HuggingFace embeddings (182 lines)
│   │   ├── vector-store.js        # ChromaDB operations (897 lines)
│   │   ├── qa-service.js          # Question answering (2311 lines)
│   │   ├── conversation-manager.js # Chat sessions (253 lines)
│   │   └── langchain-manager.js   # LLM abstraction (746 lines)
│   └── 📁 utils/                  # Utilities
│       ├── logger.js              # Winston logging (294 lines)
│       └── helpers.js             # Helper functions
├── 📁 data/                       # Data storage
│   ├── 📁 docs/                   # Source documents
│   ├── 📁 logs/                   # Log files
│   └── 📁 processed/             # Processed data
│       ├── 📁 chromadb/           # ChromaDB data
│       └── 📁 chromadb_test/      # Test ChromaDB data
├── 📁 uploads/                    # Uploaded files
├── 📁 logs/                       # Application logs
├── 📁 chromadb/                   # ChromaDB persistent storage
├── 📄 package.json                # Dependencies and scripts
├── 📄 .env.template               # Environment configuration
├── 📄 README.md                   # Basic documentation
├── 📄 DEPLOYMENT.md               # Deployment guide
├── 📄 API_DOCUMENTATION.md        # API reference
├── 📄 GEMINI_SETUP.md            # Gemini configuration
├── 📄 Ingestion.md                # Ingestion guide
└── 📄 railway.json               # Railway deployment config
```

## 🌐 API Endpoints

### Document Management
- **`POST /api/documents/upload`** - Upload PDF/TXT files
- **`POST /api/documents/ingest`** - Process uploaded documents
- **`POST /api/documents/ingest/versioned`** - Version-aware ingestion
- **`GET /api/documents`** - List documents with pagination
- **`GET /api/documents/search`** - Search documents
- **`GET /api/documents/summaries`** - Document summaries
- **`GET /api/documents/:name`** - Document details
- **`GET /api/documents/:name/versions`** - Document versions
- **`GET /api/documents/:name/metadata`** - Document metadata
- **`PUT /api/documents/:name/metadata`** - Update metadata
- **`DELETE /api/documents/:name/versions/:version`** - Delete version
- **`POST /api/documents/:name/versions/:version/rollback`** - Rollback version

### Question Answering
- **`POST /api/qa/ask`** - Ask questions about documents

### Conversation Management
- **`GET /api/conversations/:sessionId`** - Get conversation history
- **`DELETE /api/conversations/:sessionId`** - Clear conversation
- **`GET /api/conversations/stats`** - Conversation statistics

### System & Health
- **`GET /`** - Basic status check
- **`GET /health`** - Comprehensive health check

### Analytics & Metadata
- **`GET /api/documents/stats/overview`** - System overview
- **`GET /api/documents/metadata/schema`** - Metadata schema
- **`GET /api/documents/metadata/stats`** - Metadata statistics
- **`POST /api/documents/metadata/search`** - Metadata-based search

## ⚙️ Configuration

### Environment Variables
```bash
# ChromaDB Configuration
CHROMA_DB_URL=http://localhost:8000
CHROMA_COLLECTION_NAME=rag_documents

# HuggingFace API (Required)
HF_API_KEY=your_huggingface_api_key
HF_MODEL=sentence-transformers/all-MiniLM-L6-v2

# LLM Configuration (Choose one)
LLM_PROVIDER=openai|anthropic|google|gemini
LLM_MODEL=gpt-3.5-turbo|claude-3-haiku|gemini-1.5-flash
LLM_TEMPERATURE=0.3
LLM_MAX_TOKENS=2000

# Provider-specific API Keys
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key

# Server Configuration
PORT=3000
NODE_ENV=development
HOST=0.0.0.0

# Optional Features
DISABLE_QUERY_REWRITING=false
TEST_CONNECTION=false
LOG_LEVEL=info
```

### Service Configuration
```javascript
// Document Processor Configuration
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

// QA Service Configuration
const MAX_RESULTS = 5;
const SIMILARITY_THRESHOLD = -0.5;
const MAX_CONTEXT_LENGTH = 2000;

// Conversation Manager Configuration
const MAX_MESSAGES_PER_CONVERSATION = 20;
const MAX_CONVERSATIONS = 1000;
const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
```

## 🚀 Deployment

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Start ChromaDB
npm run chromadb:start

# 3. Configure environment
cp .env.template .env
# Edit .env with your API keys

# 4. Start server
npm start

# 5. Start frontend (optional)
npm run frontend
```

### Production Deployment (Railway)
```bash
# 1. Configure Railway
railway login
railway init

# 2. Set environment variables
railway variables set HF_API_KEY=your_key
railway variables set LLM_PROVIDER=openai
railway variables set OPENAI_API_KEY=your_key

# 3. Deploy
railway up
```

### Docker Deployment
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
      - HF_API_KEY=${HF_API_KEY}
      - LLM_PROVIDER=${LLM_PROVIDER}
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

## 📊 Performance Characteristics

### Processing Capabilities
- **Document Size**: Up to 10MB per file
- **Chunk Size**: 512-2048 characters (adaptive)
- **Embedding Dimensions**: 384 (default model)
- **Concurrent Requests**: Limited by Node.js event loop
- **Memory Usage**: ~100MB base + document size

### Scalability Considerations
- **ChromaDB**: Handles millions of vectors efficiently
- **Embedding Service**: Rate-limited by HuggingFace API
- **LLM Services**: Provider-specific rate limits
- **File Storage**: Local filesystem (consider cloud storage for production)

### Optimization Strategies
- **Batch Processing**: Embeddings generated in batches
- **Caching**: Query rewrite caching
- **Connection Pooling**: Reused HTTP connections
- **Lazy Loading**: Services initialized on demand
- **Cleanup**: Automatic cleanup of old conversations

## 🔍 Monitoring & Observability

### Logging Levels
- **Error**: System errors and failures
- **Warn**: Warning conditions
- **Info**: General information
- **HTTP**: Request/response logging
- **Debug**: Detailed debugging information

### Performance Metrics
- **Request Duration**: API response times
- **Service Health**: Component health status
- **Memory Usage**: Process memory consumption
- **Error Rates**: Failure frequency
- **Throughput**: Requests per second

### Health Checks
- **Service Status**: Individual service health
- **Dependencies**: External service connectivity
- **Resource Usage**: Memory and CPU utilization
- **Database**: ChromaDB connection status

This comprehensive architecture provides a robust, scalable, and maintainable RAG pipeline that can handle complex document processing and intelligent question-answering tasks.
