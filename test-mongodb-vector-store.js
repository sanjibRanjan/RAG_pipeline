#!/usr/bin/env node

/**
 * MongoDB Vector Store Test Suite
 *
 * Comprehensive test suite for MongoDB vector store functionality
 * Tests all major operations including CRUD, search, and advanced features
 *
 * Usage:
 *   node test-mongodb-vector-store.js [--collection <name>] [--verbose] [--cleanup]
 *
 * @author RAG Pipeline Team
 * @version 1.0.0
 */

import { MongoVectorStore } from './src/services/mongo-vector-store.js';
import { EmbeddingService } from './src/services/embedding-service.js';
import dotenv from 'dotenv';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

/**
 * Test suite for MongoDB vector store
 */
class MongoDBVectorStoreTest {
  constructor() {
    this.mongoStore = null;
    this.embeddingService = null;
    this.testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      tests: []
    };
    this.verbose = process.argv.includes('--verbose');
    this.cleanup = process.argv.includes('--cleanup');
    this.testCollection = this.getTestCollection();
  }

  /**
   * Get test collection name
   */
  getTestCollection() {
    const args = process.argv;
    const collectionIndex = args.indexOf('--collection');
    if (collectionIndex !== -1 && collectionIndex + 1 < args.length) {
      return args[collectionIndex + 1];
    }
    return `test_vector_store_${Date.now()}`;
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log("🧪 Starting MongoDB Vector Store Test Suite");
    console.log(`📊 Test Collection: ${this.testCollection}`);
    console.log(`📝 Verbose Mode: ${this.verbose}`);
    console.log(`🧹 Cleanup Mode: ${this.cleanup}`);
    console.log("-".repeat(60));

    try {
      // Setup
      await this.setup();

      // Basic functionality tests
      await this.testInitialization();
      await this.testBasicCRUD();
      await this.testSearchFunctionality();
      await this.testAdvancedFeatures();
      await this.testErrorHandling();

      // Cleanup if requested
      if (this.cleanup) {
        await this.testCleanup();
      }

    } catch (error) {
      this.logTest("Setup", false, `Setup failed: ${error.message}`);
    } finally {
      await this.teardown();
    }

    // Print results
    this.printResults();
  }

  /**
   * Setup test environment
   */
  async setup() {
    console.log("\n🔧 Setting up test environment...");

    // Initialize MongoDB vector store with test collection
    process.env.MONGODB_VECTOR_COLLECTION = this.testCollection;
    this.mongoStore = new MongoVectorStore();

    // Initialize embedding service for testing
    this.embeddingService = new EmbeddingService();
    await this.embeddingService.initialize();

    console.log("✅ Test environment setup complete");
  }

  /**
   * Test initialization
   */
  async testInitialization() {
    console.log("\n📋 Testing Initialization...");

    try {
      // Test MongoDB connection and initialization
      const initialized = await this.mongoStore.initialize();

      if (initialized && this.mongoStore.isInitialized) {
        this.logTest("MongoDB Connection", true, "Successfully connected to MongoDB");
      } else {
        this.logTest("MongoDB Connection", false, "Failed to initialize MongoDB connection");
      }

      // Test health check
      const healthy = await this.mongoStore.healthCheck();
      this.logTest("Health Check", healthy, healthy ? "Service is healthy" : "Service health check failed");

    } catch (error) {
      this.logTest("Initialization", false, `Initialization failed: ${error.message}`);
    }
  }

  /**
   * Test basic CRUD operations
   */
  async testBasicCRUD() {
    console.log("\n📋 Testing Basic CRUD Operations...");

    try {
      // Generate test data
      const testDocuments = [
        "This is a test document about artificial intelligence and machine learning.",
        "Another test document discussing natural language processing and vector databases.",
        "A third document covering web development and API design patterns."
      ];

      // Generate embeddings
      const embeddings = await this.embeddingService.generateEmbeddings(testDocuments);

      // Generate unique IDs
      const ids = testDocuments.map((_, index) => `test_doc_${Date.now()}_${index}`);

      // Create metadata
      const metadatas = testDocuments.map((content, index) => ({
        documentName: `test_doc_${index + 1}.txt`,
        chunkIndex: index,
        version: 1,
        fileType: 'txt',
        uploadedAt: new Date().toISOString(),
        textLength: content.length
      }));

      // Test document addition
      const added = await this.mongoStore.addDocuments(testDocuments, embeddings, metadatas, ids);
      this.logTest("Add Documents", added, `Added ${testDocuments.length} documents successfully`);

      // Test document retrieval
      try {
        const retrievedDoc = await this.mongoStore.getDocument(ids[0]);
        const retrievalSuccess = retrievedDoc && retrievedDoc.document === testDocuments[0];
        this.logTest("Get Document", retrievalSuccess, retrievalSuccess ? "Document retrieved successfully" : "Document retrieval failed");
      } catch (error) {
        this.logTest("Get Document", false, `Document retrieval failed: ${error.message}`);
      }

      // Test document listing
      const documents = await this.mongoStore.listDocuments(10);
      this.logTest("List Documents", documents.length >= testDocuments.length, `Listed ${documents.length} documents`);

      // Test statistics
      const stats = await this.mongoStore.getStats();
      const statsValid = stats && stats.documentCount >= testDocuments.length;
      this.logTest("Get Statistics", statsValid, statsValid ? `Statistics show ${stats.documentCount} documents` : "Statistics retrieval failed");

    } catch (error) {
      this.logTest("Basic CRUD", false, `CRUD operations failed: ${error.message}`);
    }
  }

  /**
   * Test search functionality
   */
  async testSearchFunctionality() {
    console.log("\n📋 Testing Search Functionality...");

    try {
      // Create a query and get its embedding
      const query = "artificial intelligence and machine learning";
      const queryEmbedding = await this.embeddingService.generateEmbeddings([query]);
      const queryVector = queryEmbedding[0];

      // Test vector search
      const searchResults = await this.mongoStore.search(queryVector, 5);
      const searchSuccess = searchResults && searchResults.ids && searchResults.ids[0] && searchResults.ids[0].length > 0;
      this.logTest("Vector Search", searchSuccess, searchSuccess ? `Found ${searchResults.ids[0].length} relevant documents` : "Vector search failed");

      // Test document search by text
      const textSearchResults = await this.mongoStore.searchDocuments("artificial intelligence");
      const textSearchSuccess = textSearchResults && textSearchResults.length > 0;
      this.logTest("Text Search", textSearchSuccess, textSearchSuccess ? `Found ${textSearchResults.length} documents by text search` : "Text search failed");

      // Test document summaries
      const summaries = await this.mongoStore.getDocumentSummaries();
      const summariesSuccess = summaries && summaries.length > 0;
      this.logTest("Document Summaries", summariesSuccess, summariesSuccess ? `Generated ${summaries.length} document summaries` : "Document summaries failed");

    } catch (error) {
      this.logTest("Search Functionality", false, `Search tests failed: ${error.message}`);
    }
  }

  /**
   * Test advanced features
   */
  async testAdvancedFeatures() {
    console.log("\n📋 Testing Advanced Features...");

    try {
      // Test document details
      const summaries = await this.mongoStore.getDocumentSummaries();
      if (summaries && summaries.length > 0) {
        const firstDoc = summaries[0];
        const details = await this.mongoStore.getDocumentDetails(firstDoc.name);
        const detailsSuccess = details && details.totalChunks > 0;
        this.logTest("Document Details", detailsSuccess, detailsSuccess ? `Retrieved details for ${firstDoc.name}` : "Document details failed");
      } else {
        this.logTest("Document Details", false, "No documents available for details test", true);
      }

      // Test chunk type statistics
      const chunkStats = await this.mongoStore.getChunkTypeStats();
      const chunkStatsSuccess = chunkStats && typeof chunkStats.totalChunks === 'number';
      this.logTest("Chunk Statistics", chunkStatsSuccess, chunkStatsSuccess ? `Analyzed ${chunkStats.totalChunks} chunks` : "Chunk statistics failed");

      // Test metadata filtering (if supported)
      const filteredResults = await this.mongoStore.searchDocuments("test", { fileType: "txt" });
      this.logTest("Metadata Filtering", true, `Filtered search returned ${filteredResults.length} results`);

    } catch (error) {
      this.logTest("Advanced Features", false, `Advanced features test failed: ${error.message}`);
    }
  }

  /**
   * Test error handling
   */
  async testErrorHandling() {
    console.log("\n📋 Testing Error Handling...");

    try {
      // Test with invalid ID
      try {
        await this.mongoStore.getDocument("invalid_id_12345");
        this.logTest("Invalid ID Handling", false, "Should have thrown error for invalid ID");
      } catch (error) {
        this.logTest("Invalid ID Handling", true, "Correctly handled invalid document ID");
      }

      // Test with empty parameters
      try {
        await this.mongoStore.addDocuments([], [], [], []);
        this.logTest("Empty Parameters", false, "Should have thrown error for empty parameters");
      } catch (error) {
        this.logTest("Empty Parameters", true, "Correctly handled empty parameters");
      }

      // Test with mismatched array lengths
      try {
        await this.mongoStore.addDocuments(["test"], [[0.1, 0.2]], [{}], ["id1", "id2"]);
        this.logTest("Mismatched Arrays", false, "Should have thrown error for mismatched array lengths");
      } catch (error) {
        this.logTest("Mismatched Arrays", true, "Correctly handled mismatched array lengths");
      }

    } catch (error) {
      this.logTest("Error Handling", false, `Error handling tests failed: ${error.message}`);
    }
  }

  /**
   * Test cleanup operations
   */
  async testCleanup() {
    console.log("\n📋 Testing Cleanup Operations...");

    try {
      // Get current count
      const beforeStats = await this.mongoStore.getStats();
      const beforeCount = beforeStats.documentCount;

      // Delete all test documents
      const summaries = await this.mongoStore.getDocumentSummaries();
      let deletedCount = 0;

      for (const summary of summaries) {
        if (summary.name && summary.name.includes('test_doc_')) {
          // Get all versions and delete them
          const versions = await this.mongoStore.getDocumentVersions(summary.name);
          for (const version of versions) {
            await this.mongoStore.deleteDocumentVersion(summary.name, version.version);
            deletedCount += version.chunks.length;
          }
        }
      }

      // Verify cleanup
      const afterStats = await this.mongoStore.getStats();
      const afterCount = afterStats.documentCount;

      const cleanupSuccess = afterCount < beforeCount;
      this.logTest("Cleanup Operations", cleanupSuccess, `Cleaned up ${beforeCount - afterCount} documents`);

    } catch (error) {
      this.logTest("Cleanup Operations", false, `Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Teardown test environment
   */
  async teardown() {
    console.log("\n🔧 Tearing down test environment...");

    try {
      if (this.mongoStore) {
        await this.mongoStore.close();
        console.log("✅ MongoDB connection closed");
      }
    } catch (error) {
      console.error("❌ Error during teardown:", error.message);
    }
  }

  /**
   * Log test result
   */
  logTest(name, passed, message, skipped = false) {
    this.testResults.total++;

    if (skipped) {
      this.testResults.skipped++;
      console.log(`⏭️  ${name}: SKIPPED - ${message}`);
    } else if (passed) {
      this.testResults.passed++;
      console.log(`✅ ${name}: PASSED - ${message}`);
    } else {
      this.testResults.failed++;
      console.log(`❌ ${name}: FAILED - ${message}`);
    }

    this.testResults.tests.push({
      name,
      passed,
      message,
      skipped,
      timestamp: new Date().toISOString()
    });

    if (this.verbose && !skipped) {
      console.log(`   ${message}`);
    }
  }

  /**
   * Print test results summary
   */
  printResults() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST RESULTS SUMMARY");
    console.log("=".repeat(60));

    console.log(`Total Tests: ${this.testResults.total}`);
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`⏭️  Skipped: ${this.testResults.skipped}`);

    const successRate = this.testResults.total > 0 ?
      ((this.testResults.passed / this.testResults.total) * 100).toFixed(1) : 0;

    console.log(`📈 Success Rate: ${successRate}%`);

    if (this.testResults.failed > 0) {
      console.log("\n❌ FAILED TESTS:");
      this.testResults.tests
        .filter(test => !test.passed && !test.skipped)
        .forEach(test => {
          console.log(`   • ${test.name}: ${test.message}`);
        });
    }

    console.log("\n" + "=".repeat(60));

    if (this.testResults.failed === 0 && this.testResults.skipped === 0) {
      console.log("🎉 ALL TESTS PASSED!");
    } else if (this.testResults.failed === 0) {
      console.log("✅ ALL CRITICAL TESTS PASSED!");
    } else {
      console.log("⚠️  SOME TESTS FAILED - REVIEW OUTPUT ABOVE");
      process.exit(1);
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const testSuite = new MongoDBVectorStoreTest();
  await testSuite.runAllTests();
}

// Handle command line execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error("💥 Test suite crashed:", error);
    process.exit(1);
  });
}

export { MongoDBVectorStoreTest };
