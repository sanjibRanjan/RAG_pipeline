# 🎼 RAG Pipeline Integration Test

## Overview

The Integration Test is the "conductor" script for your RAG pipeline orchestra. It performs a comprehensive, end-to-end system check to ensure all services initialize correctly and work together seamlessly.

## What It Tests

### 🎯 Service Initialization
- **DocumentProcessor**: Text chunking and processing
- **EmbeddingService**: Hugging Face embedding generation
- **VectorStore**: ChromaDB connection and operations
- **DocumentStore**: In-memory parent chunk storage
- **LangChainManager**: LLM integration (Gemini API)
- **QAService**: Complete question-answering pipeline

### 📥 Document Ingestion Pipeline
- Document processing and chunking
- Hierarchical chunk generation (parent + child)
- Embedding generation for child chunks
- Vector storage in ChromaDB
- Parent chunk storage in DocumentStore

### ❓ Query Processing Pipeline
- Question analysis and processing
- Semantic search in vector store
- Context retrieval and expansion
- Answer generation with confidence scoring
- Complete end-to-end response

## Prerequisites

### Required Environment Variables
```bash
HF_API_KEY=your_huggingface_api_key
GOOGLE_API_KEY=your_google_gemini_api_key
CHROMA_DB_URL=http://localhost:8000
```

### Optional Environment Variables
```bash
HF_MODEL=sentence-transformers/all-MiniLM-L6-v2
LLM_PROVIDER=google
LLM_MODEL=gemini-1.5-flash
LLM_TEMPERATURE=0.3
LLM_MAX_TOKENS=2000
CHROMA_COLLECTION_NAME=rag_documents
```

### External Services
- **ChromaDB**: Must be running on the configured URL
- **Hugging Face API**: Must be accessible for embeddings
- **Google Gemini API**: Must be accessible for LLM calls

## Running the Test

### Method 1: Using the Test Runner (Recommended)
```bash
node run-integration-test.js
```

### Method 2: Direct Execution
```bash
node src/test_integration.js
```

### Method 3: As a Module
```javascript
import IntegrationTest from './src/test_integration.js';

const test = new IntegrationTest();
await test.run();
```

## Test Output

### Successful Test Example
```
🎼 Starting RAG Pipeline Integration Test
============================================================

🎯 Step 1: Initializing All Services
----------------------------------------
📄 Initializing DocumentProcessor...
✅ DocumentProcessor initialized successfully
🤖 Initializing EmbeddingService...
✅ EmbeddingService initialized successfully
🗄️ Initializing VectorStore...
✅ VectorStore initialized successfully
📦 Initializing DocumentStore...
✅ DocumentStore initialized successfully
🧠 Initializing LangChainManager...
✅ LangChainManager initialized successfully
❓ Initializing QAService...
✅ QAService initialized successfully

🎉 All services initialized successfully!

📥 Step 2: Simulating Document Ingestion
----------------------------------------
📄 Processing test document: integration-test-document.txt
✅ Document processed: 8 child chunks, 2 parent chunks
🤖 Generating embeddings for child chunks...
✅ Generated 8 embeddings
🗄️ Storing child chunks in vector store...
✅ Child chunks stored in vector store
📦 Storing parent chunks in document store...
✅ Parent chunks stored: 2/2 successful

🎉 Document ingestion completed successfully!

❓ Step 3: Simulating Query Processing
----------------------------------------
🔍 Processing question: "What are the key features of the RAG pipeline and how does hierarchical chunking work?"

📋 Query Processing Results:
Answer: The RAG pipeline includes several key features: 1) Document Processing that converts documents into searchable chunks, 2) Embedding Generation using Hugging Face models to create vector representations, 3) Vector Storage in ChromaDB for similarity search, 4) Document Storage for managing parent chunks in memory, 5) Language Model Integration using Gemini API for answer generation, and 6) Question Answering that combines retrieval and generation for comprehensive responses.

The hierarchical chunking approach uses parent chunks (1024 characters) to provide broader context and child chunks (256 characters) for precise retrieval. The vector store contains only child chunks for efficient similarity search, while the document store maintains parent chunks for context expansion.
Confidence: 0.85
Reasoning Strategy: llm_generation
Model Used: google/gemini-1.5-flash
Context Chunks: 5
Total Context Length: 1847

🎉 Query processing completed successfully!

============================================================
📊 INTEGRATION TEST REPORT
============================================================
✅ FULL PIPELINE TEST SUCCESSFUL

🎼 The orchestra is playing in perfect harmony!

📋 Detailed Results:
⏱️  Total Test Time: 3247ms

🎯 Service Initialization:
   ✅ documentProcessor: Success
   ✅ embeddingService: Success
   ✅ vectorStore: Success
   ✅ documentStore: Success
   ✅ langChainManager: Success
   ✅ qaService: Success

📥 Document Ingestion:
   ✅ Child chunks processed: 8
   ✅ Parent chunks processed: 2
   ✅ Embeddings generated: 8
   ✅ Vector store: Success
   ✅ Document store: Success

❓ Query Processing:
   ✅ Answer generated: The RAG pipeline includes several key features: 1) Document Processing that converts documents into searchable chunks, 2) Embedding Generation using Hugging Face models to create vector representations, 3) Vector Storage in ChromaDB for similarity search, 4) Document Storage for managing parent chunks in memory, 5) Language Model Integration using Gemini API for answer generation, and 6) Question Answering that combines retrieval and generation for comprehensive responses...
   ✅ Confidence score: 0.85
   ✅ Reasoning strategy: llm_generation
   ✅ Model used: google/gemini-1.5-flash

============================================================
🎉 INTEGRATION TEST PASSED - ALL SYSTEMS OPERATIONAL
🚀 Your RAG pipeline is ready for production!
============================================================
```

## Troubleshooting

### Common Issues

#### 1. ChromaDB Connection Failed
```
❌ ChromaDB connection failed: connect ECONNREFUSED 127.0.0.1:8000
```
**Solution**: Ensure ChromaDB is running on the configured URL.

#### 2. Missing API Keys
```
❌ HF_API_KEY environment variable is required
```
**Solution**: Set the required environment variables in your `.env` file.

#### 3. LLM API Errors
```
❌ LLM connection test failed: API key invalid
```
**Solution**: Verify your Google API key is valid and has Gemini API access.

#### 4. Embedding Service Issues
```
❌ Embedding service initialization failed: Rate limit exceeded
```
**Solution**: Check your Hugging Face API quota and rate limits.

### Debug Mode

To enable detailed logging, set:
```bash
NODE_ENV=development
TEST_CONNECTION=true
```

## Test Architecture

The integration test follows a systematic approach:

1. **Service Initialization**: Tests each service individually
2. **Dependency Validation**: Ensures services can communicate
3. **End-to-End Pipeline**: Simulates real-world usage
4. **Comprehensive Reporting**: Provides detailed success/failure analysis

## Customization

### Modifying Test Content
Edit the `sampleDocument` and `sampleQuestion` properties in the `IntegrationTest` class:

```javascript
this.sampleDocument = {
  name: "your-test-document.txt",
  content: "Your test content here..."
};

this.sampleQuestion = "Your test question here?";
```

### Adding Custom Tests
Extend the `IntegrationTest` class to add additional test scenarios:

```javascript
class CustomIntegrationTest extends IntegrationTest {
  async runCustomTests() {
    // Your custom test logic here
  }
}
```

## Performance Expectations

- **Total Test Time**: 3-10 seconds (depending on API response times)
- **Service Initialization**: 1-3 seconds
- **Document Ingestion**: 1-4 seconds
- **Query Processing**: 1-3 seconds

## Continuous Integration

This test is designed to be run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Integration Test
  run: node run-integration-test.js
  env:
    HF_API_KEY: ${{ secrets.HF_API_KEY }}
    GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
    CHROMA_DB_URL: ${{ secrets.CHROMA_DB_URL }}
```

## Success Criteria

The test passes when:
- ✅ All services initialize without errors
- ✅ Document ingestion completes successfully
- ✅ Query processing generates a valid answer
- ✅ Confidence score is above 0.5
- ✅ All external API calls succeed

## Next Steps

After a successful integration test:
1. Deploy your RAG pipeline to production
2. Set up monitoring and alerting
3. Configure automated testing in CI/CD
4. Document your deployment process

---

**Remember**: This integration test validates that your RAG pipeline orchestra is playing in perfect harmony! 🎼
