# RAG Pipeline API Test Suite

This directory contains comprehensive tests for the RAG Pipeline API system.

## Test Structure

```
tests/
├── test-suite.js      # Main test suite with all test cases
├── README.md          # This file
└── test-report.json   # Generated detailed test reports (when using --report)
```

## Test Categories

### 🏥 Health Tests
- API health check endpoints
- Service availability
- Basic connectivity

### 📄 Document Tests
- File upload functionality
- Document ingestion process
- Document processing validation

### 💬 QA Tests
- Question answering endpoints
- Session management
- Response formatting

### 🔍 Discovery Tests
- Document listing
- Search functionality
- Filtering capabilities

### 🔄 Version Tests
- Version management
- Version comparison
- Rollback functionality

### 📊 Metadata Tests
- Metadata extraction
- Metadata search
- Schema validation

### ⚠️ Error Handling Tests
- Invalid requests
- Missing parameters
- Edge cases

### ⚡ Performance Tests
- Response time measurements
- Concurrent request handling
- Resource usage monitoring

### 🔥 Load Tests
- High concurrency simulation
- Error rate monitoring
- Scalability testing

## Running Tests

### Prerequisites

1. **Start the RAG Pipeline API server:**
   ```bash
   npm start
   ```

2. **Ensure ChromaDB is running:**
   ```bash
   docker run -d --name chromadb -p 8000:8000 chromadb/chroma:latest
   ```

3. **Set up environment variables (optional):**
   ```bash
   export TEST_BASE_URL=http://localhost:3000/api
   ```

### Basic Test Execution

```bash
# Run all tests
node tests/test-suite.js

# Run with verbose output
node tests/test-suite.js --verbose

# Run specific test types
node tests/test-suite.js --unit          # Unit tests only
node tests/test-suite.js --integration   # Integration tests only
node tests/test-suite.js --performance   # Performance tests only
node tests/test-suite.js --load          # Load tests only

# Generate detailed report
node tests/test-suite.js --report
```

### Using npm Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "test": "node tests/test-suite.js",
    "test:verbose": "node tests/test-suite.js --verbose",
    "test:unit": "node tests/test-suite.js --unit",
    "test:integration": "node tests/test-suite.js --integration",
    "test:performance": "node tests/test-suite.js --performance",
    "test:load": "node tests/test-suite.js --load",
    "test:report": "node tests/test-suite.js --report"
  }
}
```

Then run:
```bash
npm test
npm run test:verbose
npm run test:performance
```

## Test Configuration

### Test Files

The test suite looks for test files in:
- `data/docs/sample-local-pdf.pdf` - Primary test PDF
- `README.md` - Alternative text file for testing

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_BASE_URL` | `http://localhost:3000/api` | Base URL for API testing |
| `LOG_LEVEL` | `info` | Logging level for test output |

### Configuration Options

Edit the `CONFIG` object in `test-suite.js` to customize:

```javascript
const CONFIG = {
  baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000/api',
  timeout: 30000,  // Request timeout in ms
  testFiles: {
    small: path.join(__dirname, '../data/docs/sample-local-pdf.pdf'),
    text: path.join(__dirname, '../README.md')
  },
  performance: {
    concurrentUsers: 5,
    requestsPerUser: 10,
    rampUpTime: 1000
  },
  load: {
    duration: 60000,  // 1 minute
    users: 10
  }
};
```

## Test Results

### Console Output

The test suite provides real-time feedback:

```
🚀 Starting RAG Pipeline API Test Suite...
✅ Server is running and accessible
🏥 Running Health Check Tests...
✅ Health Check: PASSED
📄 Running Document Upload Tests...
✅ File Upload: PASSED
✅ Upload Status: PASSED
✅ Upload Response: PASSED
...
```

### Detailed Reports

When using `--report`, a JSON file `test-report.json` is generated with:

```json
{
  "timestamp": "2025-01-14T07:15:30.123Z",
  "summary": {
    "total": 45,
    "passed": 43,
    "failed": 2,
    "skipped": 0,
    "passRate": 95.6
  },
  "performance": {
    "tests": [...],
    "averageResponseTime": 245.67,
    "minResponseTime": 89.23,
    "maxResponseTime": 1234.56
  },
  "load": {
    "totalRequests": 500,
    "successfulRequests": 498,
    "failedRequests": 2,
    "averageResponseTime": 156.78,
    "errorRate": 0.4
  },
  "errors": [...],
  "configuration": {...}
}
```

## Test Coverage

### API Endpoints Tested

| Endpoint | Method | Tests |
|----------|--------|--------|
| `/health` | GET | Health check |
| `/documents/upload` | POST | File upload |
| `/documents/ingest` | POST | Document ingestion |
| `/documents/ingest/versioned` | POST | Versioned ingestion |
| `/qa/ask` | POST | Question answering |
| `/documents` | GET | Document listing |
| `/documents/summaries` | GET | Document summaries |
| `/documents/search` | GET | Document search |
| `/documents/:name` | GET | Document details |
| `/documents/:name/versions` | GET | Version listing |
| `/documents/:name/versions/compare` | POST | Version comparison |
| `/documents/:name/versions/:v/rollback` | POST | Version rollback |
| `/documents/:name/metadata` | GET/PUT | Metadata operations |
| `/documents/metadata/schema` | GET | Metadata schema |
| `/documents/metadata/stats` | GET | Metadata statistics |
| `/conversations/:sessionId` | GET | Conversation retrieval |
| `/conversations/stats` | GET | Conversation statistics |

### Test Scenarios

#### ✅ Happy Path Tests
- Normal operation with valid inputs
- Expected response formats
- Successful operations

#### ❌ Error Path Tests
- Invalid inputs
- Missing parameters
- File not found scenarios
- Server errors

#### 🔄 Edge Case Tests
- Empty files
- Large files
- Special characters
- Concurrent operations

#### ⚡ Performance Tests
- Response time validation
- Memory usage monitoring
- Concurrent user simulation

## Debugging Tests

### Verbose Mode

Use `--verbose` to see detailed test execution:

```bash
node tests/test-suite.js --verbose
```

### Individual Test Debugging

Modify the test suite to focus on specific tests:

```javascript
// In test-suite.js, comment out unwanted test suites
const testSuites = [
  // TestSuites.runHealthCheck,
  // TestSuites.runDocumentUploadTests,
  TestSuites.runDocumentIngestionTests,  // Focus on this
];
```

### Log Analysis

Check the generated logs:
- `logs/error.log` - Test errors and failures
- `logs/combined.log` - All test activity
- `logs/requests.log` - HTTP request details

## Continuous Integration

### GitHub Actions Example

```yaml
name: API Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Start ChromaDB
        run: docker run -d -p 8000:8000 chromadb/chroma:latest

      - name: Run tests
        run: npm run test:report

      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-report.json
```

## Troubleshooting

### Common Issues

1. **Server not accessible**
   ```bash
   # Check if server is running
   curl http://localhost:3000/health

   # Check server logs
   tail -f logs/combined.log
   ```

2. **Test file not found**
   ```bash
   # Check test files exist
   ls -la data/docs/

   # Update test file paths in CONFIG
   ```

3. **ChromaDB connection issues**
   ```bash
   # Check ChromaDB status
   docker ps | grep chromadb

   # Restart ChromaDB
   docker restart chromadb
   ```

4. **Timeout errors**
   ```bash
   # Increase timeout in CONFIG
   timeout: 60000  # 60 seconds
   ```

### Getting Help

1. Check the API documentation (`API_DOCUMENTATION.md`)
2. Review server logs in the `logs/` directory
3. Run tests with `--verbose` for detailed output
4. Check the test report for specific failure details

## Contributing

When adding new tests:

1. Follow the existing test structure
2. Add appropriate assertions
3. Include error handling
4. Update this README
5. Test both success and failure scenarios

### Test Best Practices

- ✅ **Descriptive test names** - Make failures easy to understand
- ✅ **Independent tests** - Each test should run in isolation
- ✅ **Proper cleanup** - Clean up test data after execution
- ✅ **Realistic data** - Use realistic test data and scenarios
- ✅ **Performance awareness** - Consider test execution time
- ✅ **Documentation** - Document complex test scenarios
