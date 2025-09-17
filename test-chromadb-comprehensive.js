#!/usr/bin/env node

/**
 * Comprehensive ChromaDB Test Script
 * 
 * This script tests all aspects of the ChromaDB integration:
 * 1. Connection and initialization
 * 2. Document processing and ingestion
 * 3. Vector storage and retrieval
 * 4. Search functionality
 * 5. Performance metrics
 * 6. Error handling
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Import our services
import VectorStore from './src/services/vector-store.js';
import DocumentProcessor from './src/services/document-processor.js';
import EmbeddingService from './src/services/embedding-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ChromaDBTester {
  constructor() {
    this.vectorStore = new VectorStore();
    this.documentProcessor = new DocumentProcessor();
    this.embeddingService = new EmbeddingService();
    this.testResults = {
      passed: 0,
      failed: 0,
      tests: []
    };
    this.sampleFiles = [];
  }

  /**
   * Log test results
   */
  logTest(testName, passed, message = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${testName}: ${message}`);
    
    this.testResults.tests.push({
      name: testName,
      passed,
      message,
      timestamp: new Date().toISOString()
    });
    
    if (passed) {
      this.testResults.passed++;
    } else {
      this.testResults.failed++;
    }
  }

  /**
   * Test 1: Environment Setup
   */
  async testEnvironmentSetup() {
    console.log('\n🔧 Testing Environment Setup...');
    
    try {
      // Check required environment variables
      const requiredVars = ['HF_API_KEY', 'CHROMA_DB_URL'];
      const missingVars = requiredVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        this.logTest('Environment Variables', false, `Missing: ${missingVars.join(', ')}`);
        return false;
      }
      
      this.logTest('Environment Variables', true, 'All required variables present');
      
      // Check uploads directory
      const uploadsDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        this.logTest('Uploads Directory', false, 'Directory does not exist');
        return false;
      }
      
      const files = fs.readdirSync(uploadsDir);
      const pdfFiles = files.filter(file => file.endsWith('.pdf'));
      
      if (pdfFiles.length === 0) {
        this.logTest('Sample Files', false, 'No PDF files found in uploads directory');
        return false;
      }
      
      this.sampleFiles = pdfFiles.slice(0, 3); // Use first 3 PDFs for testing
      this.logTest('Sample Files', true, `Found ${pdfFiles.length} PDF files, using ${this.sampleFiles.length} for testing`);
      
      return true;
    } catch (error) {
      this.logTest('Environment Setup', false, error.message);
      return false;
    }
  }

  /**
   * Test 2: Service Initialization
   */
  async testServiceInitialization() {
    console.log('\n🚀 Testing Service Initialization...');
    
    try {
      // Test Embedding Service
      console.log('  Initializing Embedding Service...');
      await this.embeddingService.initialize();
      this.logTest('Embedding Service Init', true, 'Service initialized successfully');
      
      // Test Vector Store
      console.log('  Initializing Vector Store...');
      await this.vectorStore.initialize();
      this.logTest('Vector Store Init', true, 'Vector store initialized successfully');
      
      // Test Document Processor
      console.log('  Testing Document Processor...');
      const testText = "This is a test document for processing.";
      const chunks = await this.documentProcessor.basicChunking(testText);
      this.logTest('Document Processor', chunks.length > 0, `Generated ${chunks.length} chunks`);
      
      return true;
    } catch (error) {
      this.logTest('Service Initialization', false, error.message);
      return false;
    }
  }

  /**
   * Test 3: Document Processing
   */
  async testDocumentProcessing() {
    console.log('\n📄 Testing Document Processing...');
    
    try {
      const uploadsDir = path.join(__dirname, 'uploads');
      const testFile = path.join(uploadsDir, this.sampleFiles[0]);
      
      console.log(`  Processing file: ${this.sampleFiles[0]}`);
      
      // Process the document
      const processedDoc = await this.documentProcessor.processFile(
        testFile, 
        this.sampleFiles[0], 
        [], 
        { forceNewVersion: true }
      );
      
      // Validate processing results
      const hasChunks = processedDoc.chunks && processedDoc.chunks.length > 0;
      const hasMetadata = processedDoc.metadata && Object.keys(processedDoc.metadata).length > 0;
      const hasText = processedDoc.text && processedDoc.text.length > 0;
      
      this.logTest('Document Processing', hasChunks && hasMetadata && hasText, 
        `Generated ${processedDoc.chunks.length} chunks, ${processedDoc.text.length} characters`);
      
      // Test hierarchical chunking
      const hasParentChunks = processedDoc.parentChunks && processedDoc.parentChunks.length > 0;
      this.logTest('Hierarchical Chunking', hasParentChunks, 
        `Generated ${processedDoc.parentChunks?.length || 0} parent chunks`);
      
      return processedDoc;
    } catch (error) {
      this.logTest('Document Processing', false, error.message);
      return null;
    }
  }

  /**
   * Test 4: Embedding Generation
   */
  async testEmbeddingGeneration(processedDoc) {
    console.log('\n🤖 Testing Embedding Generation...');
    
    try {
      if (!processedDoc || !processedDoc.chunks) {
        this.logTest('Embedding Generation', false, 'No processed document available');
        return null;
      }
      
      // Test single embedding
      console.log('  Testing single embedding...');
      const singleEmbedding = await this.embeddingService.generateSingleEmbedding("test query");
      const hasValidEmbedding = singleEmbedding && Array.isArray(singleEmbedding) && singleEmbedding.length > 0;
      this.logTest('Single Embedding', hasValidEmbedding, `Generated ${singleEmbedding?.length || 0} dimensions`);
      
      // Test batch embeddings
      console.log('  Testing batch embeddings...');
      const sampleChunks = processedDoc.chunks.slice(0, 3).map(chunk => chunk.content);
      const batchEmbeddings = await this.embeddingService.generateEmbeddings(sampleChunks);
      const hasValidBatch = batchEmbeddings && batchEmbeddings.length === sampleChunks.length;
      this.logTest('Batch Embeddings', hasValidBatch, `Generated ${batchEmbeddings?.length || 0} embeddings`);
      
      return batchEmbeddings;
    } catch (error) {
      this.logTest('Embedding Generation', false, error.message);
      return null;
    }
  }

  /**
   * Test 5: Vector Storage
   */
  async testVectorStorage(processedDoc, embeddings) {
    console.log('\n💾 Testing Vector Storage...');
    
    try {
      if (!processedDoc || !embeddings) {
        this.logTest('Vector Storage', false, 'No processed document or embeddings available');
        return false;
      }
      
      // Prepare data for storage
      const sampleChunks = processedDoc.chunks.slice(0, 3);
      const documents = sampleChunks.map(chunk => chunk.content);
      const metadatas = sampleChunks.map(chunk => ({
        ...chunk.metadata,
        documentName: this.sampleFiles[0],
        uploadedAt: new Date().toISOString(),
        testRun: true
      }));
      const ids = sampleChunks.map((chunk, index) => `test_${Date.now()}_${index}`);
      
      // Store documents
      console.log('  Storing documents in vector store...');
      await this.vectorStore.addDocuments(documents, embeddings, metadatas, ids);
      this.logTest('Document Storage', true, `Stored ${documents.length} documents`);
      
      // Test collection stats
      console.log('  Checking collection statistics...');
      const stats = await this.vectorStore.getStats();
      const hasValidStats = stats && stats.documentCount > 0;
      this.logTest('Collection Stats', hasValidStats, `${stats?.documentCount || 0} documents in collection`);
      
      return { documents, embeddings, metadatas, ids };
    } catch (error) {
      this.logTest('Vector Storage', false, error.message);
      return false;
    }
  }

  /**
   * Test 6: Search Functionality
   */
  async testSearchFunctionality() {
    console.log('\n🔍 Testing Search Functionality...');
    
    try {
      // Test basic search
      console.log('  Testing basic semantic search...');
      const queryEmbedding = await this.embeddingService.generateSingleEmbedding("machine learning");
      const searchResults = await this.vectorStore.search(queryEmbedding, 3);
      
      const hasResults = searchResults && searchResults.documents && searchResults.documents[0] && searchResults.documents[0].length > 0;
      this.logTest('Semantic Search', hasResults, `Found ${searchResults?.documents?.[0]?.length || 0} results`);
      
      // Test search with filters
      console.log('  Testing filtered search...');
      const filteredResults = await this.vectorStore.searchWithFilters(queryEmbedding, {
        fileType: 'pdf'
      });
      this.logTest('Filtered Search', Array.isArray(filteredResults), `Found ${filteredResults?.length || 0} filtered results`);
      
      // Test document search
      console.log('  Testing document search...');
      const docSearchResults = await this.vectorStore.searchDocuments("test");
      this.logTest('Document Search', Array.isArray(docSearchResults), `Found ${docSearchResults?.length || 0} documents`);
      
      return searchResults;
    } catch (error) {
      this.logTest('Search Functionality', false, error.message);
      return null;
    }
  }

  /**
   * Test 7: Document Management
   */
  async testDocumentManagement() {
    console.log('\n📋 Testing Document Management...');
    
    try {
      // Test document listing
      console.log('  Testing document listing...');
      const documents = await this.vectorStore.listDocuments(10);
      this.logTest('Document Listing', Array.isArray(documents), `Listed ${documents?.length || 0} documents`);
      
      // Test document summaries
      console.log('  Testing document summaries...');
      const summaries = await this.vectorStore.getDocumentSummaries();
      this.logTest('Document Summaries', Array.isArray(summaries), `Generated ${summaries?.length || 0} summaries`);
      
      // Test chunk type stats
      console.log('  Testing chunk type statistics...');
      const chunkStats = await this.vectorStore.getChunkTypeStats();
      this.logTest('Chunk Type Stats', chunkStats && chunkStats.totalChunks >= 0, 
        `${chunkStats?.totalChunks || 0} total chunks analyzed`);
      
      return true;
    } catch (error) {
      this.logTest('Document Management', false, error.message);
      return false;
    }
  }

  /**
   * Test 8: Performance Testing
   */
  async testPerformance() {
    console.log('\n⚡ Testing Performance...');
    
    try {
      const startTime = Date.now();
      
      // Test embedding generation performance
      console.log('  Testing embedding generation performance...');
      const embeddingStart = Date.now();
      const testEmbedding = await this.embeddingService.generateSingleEmbedding("performance test query");
      const embeddingTime = Date.now() - embeddingStart;
      
      this.logTest('Embedding Performance', embeddingTime < 5000, 
        `Generated embedding in ${embeddingTime}ms`);
      
      // Test search performance
      console.log('  Testing search performance...');
      const searchStart = Date.now();
      const searchResults = await this.vectorStore.search(testEmbedding, 5);
      const searchTime = Date.now() - searchStart;
      
      this.logTest('Search Performance', searchTime < 2000, 
        `Search completed in ${searchTime}ms`);
      
      // Test batch processing performance
      console.log('  Testing batch processing performance...');
      const batchStart = Date.now();
      const batchEmbeddings = await this.embeddingService.generateEmbeddingsBatch([
        "test document 1", "test document 2", "test document 3"
      ], 3);
      const batchTime = Date.now() - batchStart;
      
      this.logTest('Batch Processing Performance', batchTime < 10000, 
        `Processed batch in ${batchTime}ms`);
      
      const totalTime = Date.now() - startTime;
      this.logTest('Overall Performance', totalTime < 30000, 
        `Total test time: ${totalTime}ms`);
      
      return true;
    } catch (error) {
      this.logTest('Performance Testing', false, error.message);
      return false;
    }
  }

  /**
   * Test 9: Error Handling
   */
  async testErrorHandling() {
    console.log('\n🛡️ Testing Error Handling...');
    
    try {
      // Test invalid embedding service calls
      console.log('  Testing invalid embedding calls...');
      try {
        await this.embeddingService.generateSingleEmbedding("");
        this.logTest('Empty Text Handling', false, 'Should have thrown error for empty text');
      } catch (error) {
        this.logTest('Empty Text Handling', true, 'Correctly handled empty text error');
      }
      
      // Test invalid vector store calls
      console.log('  Testing invalid vector store calls...');
      try {
        await this.vectorStore.search([], 5);
        this.logTest('Invalid Embedding Handling', false, 'Should have thrown error for invalid embedding');
      } catch (error) {
        this.logTest('Invalid Embedding Handling', true, 'Correctly handled invalid embedding error');
      }
      
      // Test document not found
      console.log('  Testing document not found...');
      try {
        await this.vectorStore.getDocument("nonexistent_id");
        this.logTest('Document Not Found Handling', false, 'Should have thrown error for nonexistent document');
      } catch (error) {
        this.logTest('Document Not Found Handling', true, 'Correctly handled nonexistent document error');
      }
      
      return true;
    } catch (error) {
      this.logTest('Error Handling', false, error.message);
      return false;
    }
  }

  /**
   * Test 10: Health Checks
   */
  async testHealthChecks() {
    console.log('\n🏥 Testing Health Checks...');
    
    try {
      // Test embedding service health
      console.log('  Testing embedding service health...');
      const embeddingHealth = await this.embeddingService.healthCheck();
      this.logTest('Embedding Service Health', embeddingHealth, 'Embedding service is healthy');
      
      // Test vector store health
      console.log('  Testing vector store health...');
      const vectorHealth = await this.vectorStore.healthCheck();
      this.logTest('Vector Store Health', vectorHealth, 'Vector store is healthy');
      
      return true;
    } catch (error) {
      this.logTest('Health Checks', false, error.message);
      return false;
    }
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    console.log('\n🧹 Cleaning up test data...');
    
    try {
      // Get all test documents
      const documents = await this.vectorStore.listDocuments(100);
      const testDocs = documents.filter(doc => 
        doc.metadata.testRun === true || 
        doc.id.startsWith('test_')
      );
      
      if (testDocs.length > 0) {
        const testIds = testDocs.map(doc => doc.id);
        await this.vectorStore.deleteDocuments(testIds);
        this.logTest('Cleanup', true, `Deleted ${testIds.length} test documents`);
      } else {
        this.logTest('Cleanup', true, 'No test documents to clean up');
      }
    } catch (error) {
      this.logTest('Cleanup', false, error.message);
    }
  }

  /**
   * Generate test report
   */
  generateReport() {
    console.log('\n📊 Test Report');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${this.testResults.passed + this.testResults.failed}`);
    console.log(`Passed: ${this.testResults.passed}`);
    console.log(`Failed: ${this.testResults.failed}`);
    console.log(`Success Rate: ${((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100).toFixed(1)}%`);
    
    console.log('\nDetailed Results:');
    this.testResults.tests.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`  ${status} ${test.name}: ${test.message}`);
    });
    
    // Save report to file
    const reportPath = path.join(__dirname, 'chromadb-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      summary: {
        total: this.testResults.passed + this.testResults.failed,
        passed: this.testResults.passed,
        failed: this.testResults.failed,
        successRate: (this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100
      },
      tests: this.testResults.tests,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Starting Comprehensive ChromaDB Test Suite');
    console.log('='.repeat(60));
    
    const startTime = Date.now();
    
    try {
      // Run all test phases
      await this.testEnvironmentSetup();
      await this.testServiceInitialization();
      
      const processedDoc = await this.testDocumentProcessing();
      const embeddings = await this.testEmbeddingGeneration(processedDoc);
      await this.testVectorStorage(processedDoc, embeddings);
      await this.testSearchFunctionality();
      await this.testDocumentManagement();
      await this.testPerformance();
      await this.testErrorHandling();
      await this.testHealthChecks();
      
      // Cleanup
      await this.cleanup();
      
      const totalTime = Date.now() - startTime;
      console.log(`\n⏱️ Total test execution time: ${totalTime}ms`);
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      this.logTest('Test Suite Execution', false, error.message);
    } finally {
      this.generateReport();
    }
  }
}

// Run the tests
async function main() {
  const tester = new ChromaDBTester();
  await tester.runAllTests();
  
  // Exit with appropriate code
  process.exit(tester.testResults.failed > 0 ? 1 : 0);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default ChromaDBTester;
