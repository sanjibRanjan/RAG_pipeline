# RAG Pipeline API Documentation

## 🚀 Overview

The RAG Pipeline API is a comprehensive Retrieval-Augmented Generation system that allows you to upload documents, process them, and ask intelligent questions based on the document content. The system combines document processing, vector embeddings, and conversational AI to provide accurate answers with source attribution.

### Key Features

- 📄 **Multi-format Support**: PDF and TXT document processing
- 🧠 **Intelligent QA**: Context-aware question answering
- 💬 **Conversation Memory**: Persistent conversation sessions
- 🔄 **Version Control**: Document versioning and rollback
- 📊 **Analytics**: Comprehensive usage statistics
- 🔍 **Advanced Search**: Full-text and metadata search
- 📝 **Rich Metadata**: Comprehensive document metadata extraction
- 📊 **Performance Monitoring**: Built-in logging and metrics

## 🛠️ Quick Start

### Prerequisites

```bash
Node.js >= 18.0.0
npm or yarn
ChromaDB (Docker)
HuggingFace API token
```

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd rag-pipeline

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start ChromaDB
docker run -d --name chromadb -p 8000:8000 chromadb/chroma:latest

# Start the API server
npm start
```

### Basic Usage

```bash
# 1. Upload a document
curl -X POST -F "document=@sample.pdf" http://localhost:3000/api/documents/upload

# 2. Ingest the document
curl -X POST -H "Content-Type: application/json" \
  -d '{"filePath":"uploads/upload-xxx.pdf","originalName":"sample.pdf"}' \
  http://localhost:3000/api/documents/ingest

# 3. Ask questions
curl -X POST -H "Content-Type: application/json" \
  -d '{"question":"What is this document about?"}' \
  http://localhost:3000/api/qa/ask
```

---

## 📖 API Reference

### Base URL
```
http://localhost:3000/api
```

### Authentication
Currently, the API does not require authentication for basic operations. For production deployments, consider adding API key authentication.

### Response Format
All responses follow this structure:
```json
{
  "success": true|false,
  "data": { ... },
  "message": "string",
  "error": "string" // only on errors
}
```

---

## 📁 Document Management

### Upload Document

Upload a PDF or TXT file to the server.

**Endpoint:** `POST /documents/upload`

**Content-Type:** `multipart/form-data`

**Request:**
```bash
curl -X POST -F "document=@sample.pdf" http://localhost:3000/api/documents/upload
```

**Response:**
```json
{
  "success": true,
  "data": {
    "filename": "upload-1757832190576-578687671.pdf",
    "originalName": "sample.pdf",
    "size": 49672,
    "mimetype": "application/pdf",
    "uploadPath": "/path/to/uploads/upload-xxx.pdf",
    "uploadTime": "2025-01-14T06:32:26.895Z"
  },
  "message": "File uploaded successfully"
}
```

**Error Responses:**
- `400`: No file uploaded
- `400`: Unsupported file type (only PDF/TXT allowed)
- `413`: File too large (max 10MB)
- `500`: Upload failed

---

### Ingest Document

Process an uploaded document and store it in the vector database.

**Endpoint:** `POST /documents/ingest`

**Content-Type:** `application/json`

**Request:**
```json
{
  "filePath": "uploads/upload-xxx.pdf",
  "originalName": "sample.pdf"
}
```

**Curl Example:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"filePath":"uploads/upload-xxx.pdf","originalName":"sample.pdf"}' \
  http://localhost:3000/api/documents/ingest
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentName": "sample.pdf",
    "chunksProcessed": 13,
    "totalEmbeddings": 13,
    "documentId": "doc_1757832197428_sample_pdf_pdf",
    "fileSize": 49672,
    "processingTime": "2025-01-14T06:32:34.684Z"
  },
  "message": "Document ingested successfully"
}
```

**Error Responses:**
- `400`: Missing filePath or originalName
- `400`: File not found
- `500`: Processing failed

---

### Versioned Document Ingestion

Process a document with versioning support.

**Endpoint:** `POST /documents/ingest/versioned`

**Request:**
```json
{
  "filePath": "uploads/upload-xxx.pdf",
  "originalName": "sample.pdf",
  "forceNewVersion": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentName": "sample.pdf",
    "version": 2,
    "versionType": "updated",
    "chunksProcessed": 13,
    "totalEmbeddings": 13,
    "documentId": "doc_1757833573080_sample_local_pdf_pdf_v2",
    "fileSize": 49672,
    "fileHash": "40c5b733d0e21c53a9e40fa6eb9df01bb6898b842f5f13bd42db5624c2a97dd0",
    "previousVersions": 1,
    "processingTime": "2025-09-14T07:11:59.633Z"
  },
  "message": "Versioned document ingested successfully"
}
```

---

## 💬 Question Answering

### Ask Question

Ask a question and get an AI-powered answer based on ingested documents.

**Endpoint:** `POST /qa/ask`

**Request:**
```json
{
  "question": "What is machine learning?",
  "sessionId": "optional-session-id"
}
```

**Curl Example:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"question":"What is machine learning?","sessionId":"my-session"}' \
  http://localhost:3000/api/qa/ask
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "my-session",
    "answer": "Machine learning is a subset of artificial intelligence...",
    "sources": [
      {
        "documentName": "ml-guide.pdf",
        "chunkIndex": 5,
        "similarity": 0.85,
        "confidence": 0.85,
        "preview": "Machine learning is a method of data analysis...",
        "metadata": {
          "version": 1,
          "uploadedAt": "2025-01-14T06:32:26.895Z",
          "textLength": 1250
        }
      }
    ],
    "confidence": 0.82,
    "conversationHistory": [
      {
        "type": "question",
        "content": "What is machine learning?",
        "timestamp": "2025-01-14T06:33:45.123Z",
        "id": "msg_1757832825123_xyz"
      },
      {
        "type": "answer",
        "content": "Machine learning is...",
        "timestamp": "2025-01-14T06:33:45.456Z",
        "id": "msg_1757832825456_abc"
      }
    ],
    "metadata": {
      "totalChunksSearched": 5,
      "relevantChunksFound": 1,
      "processingTime": 1757832825456
    }
  },
  "message": "Question answered successfully"
}
```

**Error Responses:**
- `400`: Question is required
- `500`: QA processing failed

---

## 📋 Document Discovery

### List Documents

Get a paginated list of all documents.

**Endpoint:** `GET /documents`

**Query Parameters:**
- `limit` (optional): Number of documents to return (default: 10)
- `offset` (optional): Number of documents to skip (default: 0)
- `search` (optional): Search term for document names
- `fileType` (optional): Filter by file type (pdf, txt)
- `minSize` (optional): Minimum file size in bytes
- `maxSize` (optional): Maximum file size in bytes

**Examples:**
```bash
# Basic listing
curl http://localhost:3000/api/documents

# With pagination
curl "http://localhost:3000/api/documents?limit=5&offset=10"

# With search
curl "http://localhost:3000/api/documents?search=machine"

# With filters
curl "http://localhost:3000/api/documents?fileType=pdf&minSize=1000"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "doc_1757832197428_sample_pdf_pdf_chunk_0",
        "metadata": {
          "documentName": "sample.pdf",
          "fileSize": 49672,
          "fileType": "pdf",
          "textLength": 9580,
          "chunkIndex": 0,
          "uploadedAt": "2025-01-14T06:32:26.895Z"
        },
        "contentPreview": "Sample PDF Created for testing PDFObject..."
      }
    ],
    "total": 13,
    "limit": 10,
    "offset": 0,
    "filters": null
  },
  "message": "Documents retrieved successfully"
}
```

---

### Document Summaries

Get summarized information about all documents.

**Endpoint:** `GET /documents/summaries`

**Response:**
```json
{
  "success": true,
  "data": {
    "summaries": [
      {
        "name": "sample.pdf",
        "chunks": 13,
        "totalEmbeddings": 13,
        "fileSize": 49672,
        "fileType": "pdf",
        "version": 1,
        "uploadedAt": "2025-01-14T06:32:26.895Z",
        "lastModified": "2025-01-14T06:32:26.895Z",
        "averageChunkSize": 736.3076923076923,
        "chunkRange": {
          "min": 0,
          "max": 12
        }
      }
    ],
    "totalDocuments": 1,
    "totalChunks": 13,
    "totalSize": 49672
  },
  "message": "Document summaries retrieved successfully"
}
```

---

### Document Search

Search documents by name or content.

**Endpoint:** `GET /documents/search`

**Query Parameters:**
- `q` (required): Search query
- `fileType` (optional): Filter by file type
- `minSize` (optional): Minimum file size
- `maxSize` (optional): Maximum file size
- `limit` (optional): Maximum results (default: 20)

**Example:**
```bash
curl "http://localhost:3000/api/documents/search?q=machine%20learning&fileType=pdf"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "machine learning",
    "results": [
      {
        "id": "doc_1757832197428_sample_pdf_pdf_chunk_5",
        "documentName": "ml-guide.pdf",
        "fileType": "pdf",
        "fileSize": 125000,
        "chunkIndex": 5,
        "contentPreview": "Machine learning is a subset of artificial intelligence...",
        "searchMatch": "content"
      }
    ],
    "totalFound": 8,
    "returned": 8,
    "filters": {
      "fileType": "pdf"
    }
  },
  "message": "Document search completed successfully"
}
```

---

### Document Details

Get detailed information about a specific document.

**Endpoint:** `GET /documents/:name`

**Example:**
```bash
curl http://localhost:3000/api/documents/sample.pdf
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "sample.pdf",
    "totalChunks": 13,
    "totalContentLength": 11086,
    "averageChunkSize": 852.7692307692307,
    "firstUploaded": "2025-01-14T06:32:26.895Z",
    "lastUploaded": "2025-01-14T06:32:26.895Z",
    "version": 1,
    "chunks": [
      {
        "id": "doc_1757832197428_sample_local_pdf_pdf_chunk_0",
        "chunkIndex": 0,
        "contentLength": 954,
        "uploadedAt": "2025-01-14T06:32:26.895Z",
        "version": 1
      }
    ]
  },
  "message": "Document details retrieved successfully"
}
```

---

## 🔄 Version Management

### Get Document Versions

**Endpoint:** `GET /documents/:name/versions`

**Example:**
```bash
curl http://localhost:3000/api/documents/sample.pdf/versions
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentName": "sample.pdf",
    "versions": [
      {
        "version": 2,
        "chunks": [...],
        "metadata": {
          "version": 2,
          "fileSize": 49672,
          "uploadedAt": "2025-01-14T07:11:59.001Z",
          "versionType": "forced"
        }
      },
      {
        "version": 1,
        "chunks": [...],
        "metadata": {
          "version": 1,
          "fileSize": 49672,
          "uploadedAt": "2025-01-14T06:32:26.895Z"
        }
      }
    ],
    "totalVersions": 2,
    "currentVersion": 2
  },
  "message": "Document versions retrieved successfully"
}
```

---

### Compare Versions

**Endpoint:** `POST /documents/:name/versions/compare`

**Request:**
```json
{
  "version1": 1,
  "version2": 2
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentName": "sample.pdf",
    "versions": {
      "from": 1,
      "to": 2
    },
    "changes": {
      "hasChanges": true,
      "fileSize": {
        "from": 49672,
        "to": 49672,
        "changed": false
      },
      "textLength": {
        "from": 9580,
        "to": 9580,
        "changed": false
      },
      "fileHash": {
        "from": "abc123...",
        "to": "def456...",
        "changed": true
      }
    },
    "timestamps": {
      "from": "2025-01-14T06:32:15.437Z",
      "to": "2025-01-14T07:11:59.080Z"
    }
  },
  "message": "Version comparison completed successfully"
}
```

---

### Rollback Version

**Endpoint:** `POST /documents/:name/versions/:version/rollback`

**Example:**
```bash
curl -X POST http://localhost:3000/api/documents/sample.pdf/versions/1/rollback
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentName": "sample.pdf",
    "rolledBackTo": 1,
    "deletedVersions": [2],
    "totalChunksDeleted": 13,
    "rollbackTime": "2025-01-14T07:12:30.205Z"
  },
  "message": "Document rolled back to version 1 successfully"
}
```

---

## 📊 Metadata Management

### Get Document Metadata

**Endpoint:** `GET /documents/:name/metadata`

**Example:**
```bash
curl http://localhost:3000/api/documents/sample.pdf/metadata
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentName": "sample.pdf",
    "metadata": {
      "fileName": "sample.pdf",
      "fileSize": 49672,
      "fileType": "pdf",
      "textLength": 9580,
      "wordCount": 1423,
      "sentenceCount": 67,
      "paragraphCount": 8,
      "pages": 2,
      "readingTime": 7,
      "language": "en",
      "complexity": 0.72,
      "title": "Sample PDF Created for testing PDFObject",
      "summary": "Sample PDF Created for testing PDFObject...",
      "tags": [],
      "categories": [],
      "author": "",
      "version": 1
    },
    "version": 1,
    "lastUpdated": "2025-01-14T06:32:15.437Z"
  },
  "message": "Document metadata retrieved successfully"
}
```

---

### Update Document Metadata

**Endpoint:** `PUT /documents/:name/metadata`

**Request:**
```json
{
  "title": "Updated Document Title",
  "author": "John Doe",
  "tags": ["important", "review"],
  "categories": ["technical", "documentation"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentName": "sample.pdf",
    "metadata": {
      "title": "Updated Document Title",
      "author": "John Doe",
      "tags": ["important", "review"],
      "categories": ["technical", "documentation"],
      "lastMetadataUpdate": "2025-01-14T07:13:15.123Z"
    },
    "updatedFields": ["title", "author", "tags", "categories"]
  },
  "message": "Document metadata updated successfully"
}
```

---

### Metadata Schema

**Endpoint:** `GET /documents/metadata/schema`

Returns the complete metadata schema with field descriptions and types.

---

### Metadata Statistics

**Endpoint:** `GET /documents/metadata/stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalDocuments": 1,
    "stats": {
      "fileTypes": {
        "pdf": 1
      },
      "languages": {
        "en": 1
      },
      "complexity": {
        "min": 0.72,
        "max": 0.72,
        "average": 0.72
      },
      "wordCount": {
        "total": 1423,
        "average": 1423
      },
      "readingTime": {
        "total": 7,
        "average": 7
      },
      "tags": {},
      "categories": {},
      "authors": {}
    },
    "generatedAt": "2025-01-14T07:13:30.456Z"
  },
  "message": "Metadata statistics retrieved successfully"
}
```

---

### Metadata Search

**Endpoint:** `POST /documents/metadata/search`

**Request:**
```json
{
  "filters": {
    "fileType": "pdf",
    "language": "en",
    "minComplexity": 0.5,
    "tags": ["important"],
    "author": "John"
  },
  "limit": 10
}
```

---

## 💬 Conversation Management

### Get Conversation History

**Endpoint:** `GET /conversations/:sessionId`

**Query Parameters:**
- `limit` (optional): Number of messages to return

**Example:**
```bash
curl http://localhost:3000/api/conversations/my-session-123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "my-session-123",
    "messages": [
      {
        "type": "question",
        "content": "What is machine learning?",
        "timestamp": "2025-01-14T06:33:45.123Z",
        "id": "msg_1757832825123_xyz"
      },
      {
        "type": "answer",
        "content": "Machine learning is a subset of AI...",
        "timestamp": "2025-01-14T06:33:45.456Z",
        "id": "msg_1757832825456_abc",
        "sources": [...],
        "confidence": 0.82
      }
    ],
    "messageCount": 2
  },
  "message": "Conversation retrieved successfully"
}
```

---

### Clear Conversation

**Endpoint:** `DELETE /conversations/:sessionId`

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/conversations/my-session-123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "my-session-123",
    "cleared": true
  },
  "message": "Conversation cleared successfully"
}
```

---

### Conversation Statistics

**Endpoint:** `GET /conversations/stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalConversations": 5,
    "totalMessages": 23,
    "averageMessagesPerConversation": 4.6,
    "oldestConversation": "2025-01-14T06:30:00.000Z",
    "newestConversation": "2025-01-14T07:15:00.000Z"
  },
  "message": "Conversation statistics retrieved successfully"
}
```

---

## 📊 System Monitoring

### Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-14T07:15:30.123Z",
  "service": "RAG Pipeline API"
}
```

---

### Document Overview Statistics

**Endpoint:** `GET /documents/stats/overview`

Returns comprehensive statistics about all documents in the system.

---

## ⚠️ Error Handling

### Common Error Codes

| Status Code | Description |
|-------------|-------------|
| `200` | Success |
| `400` | Bad Request (missing parameters, invalid input) |
| `404` | Not Found (document, version, or endpoint not found) |
| `413` | Payload Too Large (file size limit exceeded) |
| `500` | Internal Server Error (processing failed) |

### Error Response Format

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

### Common Error Scenarios

1. **File Upload Errors:**
   - File too large (>10MB)
   - Unsupported file type
   - No file provided

2. **Document Processing Errors:**
   - File not found
   - Corrupted file
   - Processing timeout

3. **QA Errors:**
   - No documents ingested
   - Question too long/short
   - Service unavailable

---

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*

# ChromaDB Configuration
CHROMA_DB_URL=http://localhost:8000
CHROMA_COLLECTION_NAME=rag_documents

# HuggingFace Configuration
HF_API_KEY=your_huggingface_api_key_here
HF_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Logging Configuration
LOG_LEVEL=info
```

### Service Configuration

The system includes several configurable parameters:

- **Chunk Size**: Default 1000 characters
- **Chunk Overlap**: Default 200 characters
- **Max Results**: Default 5 search results
- **Similarity Threshold**: Default -0.5
- **Conversation History Limit**: Default 20 messages
- **File Size Limit**: Default 10MB

---

## 📈 SDK Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

class RAGClient {
  constructor(baseURL = 'http://localhost:3000/api') {
    this.baseURL = baseURL;
  }

  async uploadDocument(filePath) {
    const FormData = require('form-data');
    const fs = require('fs');

    const form = new FormData();
    form.append('document', fs.createReadStream(filePath));

    const response = await axios.post(`${this.baseURL}/documents/upload`, form, {
      headers: form.getHeaders()
    });

    return response.data;
  }

  async ingestDocument(filePath, originalName) {
    const response = await axios.post(`${this.baseURL}/documents/ingest`, {
      filePath,
      originalName
    });

    return response.data;
  }

  async askQuestion(question, sessionId = null) {
    const response = await axios.post(`${this.baseURL}/qa/ask`, {
      question,
      sessionId
    });

    return response.data;
  }

  async getDocuments(search = '', limit = 10) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    params.append('limit', limit);

    const response = await axios.get(`${this.baseURL}/documents?${params}`);
    return response.data;
  }
}

// Usage
const rag = new RAGClient();

async function example() {
  try {
    // Upload document
    const upload = await rag.uploadDocument('./sample.pdf');
    console.log('Uploaded:', upload.data.filename);

    // Ingest document
    const ingest = await rag.ingestDocument(upload.data.uploadPath, upload.data.originalName);
    console.log('Ingested:', ingest.data.chunksProcessed, 'chunks');

    // Ask questions
    const answer = await rag.askQuestion('What is this document about?');
    console.log('Answer:', answer.data.answer);
    console.log('Confidence:', answer.data.confidence);
    console.log('Sources:', answer.data.sources.length);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}
```

### Python

```python
import requests

class RAGClient:
    def __init__(self, base_url='http://localhost:3000/api'):
        self.base_url = base_url

    def upload_document(self, file_path):
        with open(file_path, 'rb') as f:
            files = {'document': f}
            response = requests.post(f'{self.base_url}/documents/upload', files=files)
            return response.json()

    def ingest_document(self, file_path, original_name):
        data = {
            'filePath': file_path,
            'originalName': original_name
        }
        response = requests.post(f'{self.base_url}/documents/ingest', json=data)
        return response.json()

    def ask_question(self, question, session_id=None):
        data = {'question': question}
        if session_id:
            data['sessionId'] = session_id

        response = requests.post(f'{self.base_url}/qa/ask', json=data)
        return response.json()

    def get_documents(self, search='', limit=10):
        params = {'limit': limit}
        if search:
            params['search'] = search

        response = requests.get(f'{self.base_url}/documents', params=params)
        return response.json()

# Usage
rag = RAGClient()

# Upload and process document
upload = rag.upload_document('./sample.pdf')
print(f"Uploaded: {upload['data']['filename']}")

ingest = rag.ingest_document(upload['data']['uploadPath'], upload['data']['originalName'])
print(f"Ingested: {ingest['data']['chunksProcessed']} chunks")

# Ask questions
answer = rag.ask_question('What is this document about?')
print(f"Answer: {answer['data']['answer']}")
print(f"Confidence: {answer['data']['confidence']}")
```

---

## 🚀 Production Deployment

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN mkdir -p uploads logs

EXPOSE 3000
CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  rag-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - CHROMA_DB_URL=http://chromadb:8000
    depends_on:
      - chromadb
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs

  chromadb:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
    volumes:
      - chromadb_data:/chroma/chroma

volumes:
  chromadb_data:
```

### Environment Setup

```bash
# Production environment variables
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn
CORS_ORIGIN=https://yourdomain.com

# Use production ChromaDB instance
CHROMA_DB_URL=http://chromadb:8000

# Use production HuggingFace model
HF_MODEL=sentence-transformers/all-mpnet-base-v2
```

---

## 📊 Monitoring & Logging

The API includes comprehensive logging:

- **Request Logging**: All API calls with timing and metadata
- **Error Logging**: Detailed error information with stack traces
- **Performance Logging**: Operation timing and resource usage
- **Service Health Logging**: Component status monitoring
- **Security Logging**: Access and authentication events

### Log Files

- `logs/error.log` - Error messages and stack traces
- `logs/combined.log` - All log messages
- `logs/requests.log` - HTTP request logs

### Log Levels

- `error`: Errors and exceptions
- `warn`: Warnings and potential issues
- `info`: General information
- `http`: HTTP request/response logs
- `debug`: Detailed debugging information

---

## 🔒 Security Considerations

### File Upload Security

- File type validation (PDF/TXT only)
- File size limits (10MB max)
- Secure file storage with unique names
- Input sanitization

### API Security

- Request rate limiting (consider implementing)
- Input validation and sanitization
- Error message sanitization
- Request logging for audit trails

### Data Protection

- Secure storage of API keys
- Environment variable protection
- File access controls
- Data encryption at rest (consider implementing)

---

## 🐛 Troubleshooting

### Common Issues

1. **"ChromaDB connection failed"**
   - Ensure ChromaDB is running: `docker ps | grep chromadb`
   - Check connection URL in `.env`
   - Verify network connectivity

2. **"Document ingestion failed"**
   - Check file exists and is readable
   - Verify file format (PDF/TXT only)
   - Check file size limits

3. **"No relevant documents found"**
   - Ensure documents are ingested
   - Check search query relevance
   - Verify vector store contains data

4. **"Embedding service failed"**
   - Check HuggingFace API key
   - Verify internet connectivity
   - Check API rate limits

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm start
```

### Health Checks

Monitor system health:
```bash
# API health
curl http://localhost:3000/health

# ChromaDB health
curl http://localhost:8000/api/v1/heartbeat
```

---

## 📞 Support

For issues and questions:

1. Check the logs in the `logs/` directory
2. Review the troubleshooting section
3. Ensure all prerequisites are met
4. Check the API documentation for correct usage

---

## 📝 Changelog

### Version 1.0.0
- Initial release
- Complete RAG pipeline implementation
- Multi-document support
- Version control system
- Comprehensive API
- Production-ready logging
- Full documentation

---

*This documentation covers the complete RAG Pipeline API. For the latest updates and examples, check the project repository.*
