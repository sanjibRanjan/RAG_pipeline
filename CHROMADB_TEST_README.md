# ChromaDB Test Scripts

This directory contains comprehensive test scripts to verify that ChromaDB is working correctly and can retrieve information from PDF documents.

## Prerequisites

Before running the tests, ensure you have:

1. **ChromaDB running**: 
   ```bash
   npm run chromadb:start
   ```

2. **Environment variables set**:
   - `HF_API_KEY`: Your Hugging Face API key for embeddings
   - `CHROMA_DB_URL`: ChromaDB URL (default: http://localhost:8000)

3. **Sample PDF files**: Place PDF files in the `uploads/` directory

## Test Scripts

### 1. Quick Test (`test-chromadb-quick.js`)
**Purpose**: Minimal test to verify basic ChromaDB functionality
**Usage**: 
```bash
npm run test:chromadb
```

**What it tests**:
- Service initialization
- PDF processing
- Embedding generation
- Document storage
- Basic search functionality
- Cleanup

**Duration**: ~30 seconds

### 2. Simple Test (`test-chromadb-simple.js`)
**Purpose**: Comprehensive test with detailed logging and multiple search queries
**Usage**:
```bash
npm run test:chromadb:simple
```

**What it tests**:
- All functionality from quick test
- Multiple search queries
- Document management features
- Detailed progress logging
- Error handling

**Duration**: ~1-2 minutes

### 3. Comprehensive Test (`test-chromadb-comprehensive.js`)
**Purpose**: Full test suite covering all aspects of the system
**Usage**:
```bash
npm run test:chromadb:comprehensive
```

**What it tests**:
- Environment setup validation
- Service initialization
- Document processing (including hierarchical chunking)
- Embedding generation (single, batch, performance)
- Vector storage and retrieval
- Search functionality (semantic, filtered, document search)
- Document management (listing, summaries, chunk stats)
- Performance testing
- Error handling
- Health checks
- Cleanup

**Duration**: ~3-5 minutes

## Expected Output

### Successful Test
```
🚀 Quick ChromaDB Test
========================================
📄 Using test file: upload-1757831546894-278212892.pdf
🔧 Initializing services...
✅ Embedding service ready
✅ Vector store ready
📄 Processing PDF...
✅ Processed: 15 chunks, 2847 characters
🤖 Generating embeddings...
✅ Generated 3 embeddings
💾 Storing in ChromaDB...
✅ Documents stored in ChromaDB
🔍 Testing search...
✅ Search successful: Found 2 results
📝 First result preview: "This document contains information about machine learning algorithms and their applications..."
📊 Collection has 3 documents
🧹 Cleaning up...
✅ Test data cleaned up

🎉 ChromaDB Test PASSED!
ChromaDB is working correctly and can retrieve information from PDFs.
```

### Failed Test
```
❌ ChromaDB Test FAILED!
Error: Connection refused

Please check:
1. ChromaDB is running (docker run -d --name chromadb -p 8000:8000 chromadb/chroma)
2. HF_API_KEY is set in environment
3. PDF files exist in uploads folder
```

## Troubleshooting

### Common Issues

1. **ChromaDB Connection Failed**
   ```bash
   # Check if ChromaDB is running
   npm run chromadb:status
   
   # Start ChromaDB if not running
   npm run chromadb:start
   
   # Check ChromaDB logs
   npm run chromadb:logs
   ```

2. **Missing HF_API_KEY**
   ```bash
   # Set your Hugging Face API key
   export HF_API_KEY="your_api_key_here"
   ```

3. **No PDF Files Found**
   ```bash
   # Ensure PDF files exist in uploads directory
   ls uploads/*.pdf
   ```

4. **Embedding Service Errors**
   - Check your Hugging Face API key is valid
   - Ensure you have sufficient API quota
   - Verify internet connection

### Debug Mode

For detailed debugging, you can run the comprehensive test:
```bash
npm run test:chromadb:comprehensive
```

This will generate a detailed report in `chromadb-test-report.json` with:
- Test results summary
- Individual test outcomes
- Error messages
- Performance metrics
- Timestamps

## Test Results Interpretation

### Success Indicators
- ✅ All services initialize successfully
- ✅ PDF documents are processed and chunked
- ✅ Embeddings are generated with correct dimensions
- ✅ Documents are stored in ChromaDB
- ✅ Search returns relevant results
- ✅ Document management functions work
- ✅ Cleanup removes test data

### Failure Indicators
- ❌ Service initialization fails
- ❌ PDF processing errors
- ❌ Embedding generation fails
- ❌ ChromaDB storage errors
- ❌ Search returns no results
- ❌ Connection timeouts

## Performance Benchmarks

Expected performance metrics:
- **Embedding generation**: < 5 seconds per embedding
- **Document storage**: < 2 seconds per document
- **Search queries**: < 2 seconds per query
- **Batch processing**: < 10 seconds for 3 documents

## Integration with CI/CD

These test scripts can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Test ChromaDB
  run: |
    npm run chromadb:start
    sleep 10  # Wait for ChromaDB to start
    npm run test:chromadb
```

## Support

If tests fail, check:
1. ChromaDB container logs
2. Environment variables
3. Network connectivity
4. API quotas and limits
5. File permissions

For additional debugging, run the comprehensive test and examine the generated report.
