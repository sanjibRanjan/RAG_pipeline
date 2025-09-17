#!/usr/bin/env node

/**
 * 🎼 RAG Pipeline Integration Test - The "Conductor" Script
 * 
 * This script performs a full, end-to-end system check of the entire RAG pipeline.
 * It acts as the "conductor" for our symphony orchestra of services, ensuring all
 * components initialize correctly and work together seamlessly.
 * 
 * The test simulates the complete pipeline:
 * 1. Service initialization (DocumentProcessor, EmbeddingService, VectorStore, etc.)
 * 2. Document ingestion (processing, chunking, storing)
 * 3. Query processing (retrieval, generation, answering)
 * 
 * @author RAG Pipeline Team
 * @version 1.0.0
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Import all services
import { DocumentProcessor } from './services/document-processor.js';
import { EmbeddingService } from './services/embedding-service.js';
import { VectorStore } from './services/vector-store.js';
import { DocumentStore } from './services/document-store.js';
import { LangChainManager } from './services/langchain-manager.js';
import { QAService } from './services/qa-service.js';

// Get current directory for file operations
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class IntegrationTest {
  constructor() {
    this.services = {};
    this.testResults = {
      initialization: {},
      ingestion: {},
      query: {},
      overall: {}
    };
    this.startTime = Date.now();
    
    // Sample document content for testing
    this.sampleDocument = {
      name: "integration-test-document.txt",
      content: `# RAG Pipeline Integration Test Document

## Overview
This document serves as a test case for the RAG (Retrieval-Augmented Generation) pipeline integration test. It contains various types of content to validate the system's ability to process, chunk, and retrieve information effectively.

## Key Features
The RAG pipeline includes several critical components:

1. **Document Processing**: Converts documents into searchable chunks
2. **Embedding Generation**: Creates vector representations using Hugging Face models
3. **Vector Storage**: Stores embeddings in ChromaDB for similarity search
4. **Document Storage**: Manages parent chunks in memory for hierarchical retrieval
5. **Language Model Integration**: Uses Gemini API for answer generation
6. **Question Answering**: Combines retrieval and generation for comprehensive responses

## Technical Architecture
The system uses a hierarchical chunking approach where:
- Parent chunks (1024 characters) provide broader context
- Child chunks (256 characters) enable precise retrieval
- Vector store contains only child chunks for efficient similarity search
- Document store maintains parent chunks for context expansion

## Testing Scenarios
This document enables testing of:
- Document ingestion and processing
- Chunk generation and storage
- Vector similarity search
- Context retrieval and expansion
- Answer generation with confidence scoring

## Expected Outcomes
When processing this document, the system should:
- Generate multiple parent and child chunks
- Store embeddings in ChromaDB
- Enable semantic search capabilities
- Provide accurate answers to questions about the content

## Conclusion
This integration test validates the complete RAG pipeline functionality, ensuring all services work together harmoniously to deliver accurate, context-aware responses to user queries.`
    };
    
    // Sample question for testing
    this.sampleQuestion = "What are the key features of the RAG pipeline and how does hierarchical chunking work?";
  }

  /**
   * Run the complete integration test
   */
  async run() {
    console.log("🎼 Starting RAG Pipeline Integration Test");
    console.log("=" .repeat(60));
    
    try {
      // Step 1: Initialize all services
      await this.initializeServices();
      
      // Step 2: Simulate document ingestion
      await this.simulateIngestion();
      
      // Step 3: Simulate query processing
      await this.simulateQuery();
      
      // Step 4: Generate final report
      this.generateReport();
      
    } catch (error) {
      console.error("❌ Integration test failed:", error);
      this.testResults.overall.success = false;
      this.testResults.overall.error = error.message;
      process.exit(1);
    }
  }

  /**
   * Initialize all services in the correct order
   */
  async initializeServices() {
    console.log("\n🎯 Step 1: Initializing All Services");
    console.log("-".repeat(40));
    
    try {
      // 1. DocumentProcessor (no external dependencies)
      console.log("📄 Initializing DocumentProcessor...");
      this.services.documentProcessor = new DocumentProcessor();
      this.testResults.initialization.documentProcessor = { success: true };
      console.log("✅ DocumentProcessor initialized successfully");
      
      // 2. EmbeddingService (requires HF_API_KEY)
      console.log("🤖 Initializing EmbeddingService...");
      this.services.embeddingService = new EmbeddingService();
      await this.services.embeddingService.initialize();
      this.testResults.initialization.embeddingService = { success: true };
      console.log("✅ EmbeddingService initialized successfully");
      
      // 3. VectorStore (requires ChromaDB connection)
      console.log("🗄️ Initializing VectorStore...");
      this.services.vectorStore = new VectorStore();
      await this.services.vectorStore.initialize();
      this.testResults.initialization.vectorStore = { success: true };
      console.log("✅ VectorStore initialized successfully");
      
      // 4. DocumentStore (in-memory, no external dependencies)
      console.log("📦 Initializing DocumentStore...");
      this.services.documentStore = new DocumentStore();
      this.testResults.initialization.documentStore = { success: true };
      console.log("✅ DocumentStore initialized successfully");
      
      // 5. LangChainManager (requires LLM API keys)
      console.log("🧠 Initializing LangChainManager...");
      this.services.langChainManager = new LangChainManager();
      await this.services.langChainManager.initialize();
      this.testResults.initialization.langChainManager = { success: true };
      console.log("✅ LangChainManager initialized successfully");
      
      // 6. QAService (depends on all other services)
      console.log("❓ Initializing QAService...");
      this.services.qaService = new QAService(
        this.services.embeddingService,
        this.services.vectorStore,
        this.services.documentStore
      );
      await this.services.qaService.initialize();
      this.testResults.initialization.qaService = { success: true };
      console.log("✅ QAService initialized successfully");
      
      this.testResults.initialization.overall = { success: true };
      console.log("\n🎉 All services initialized successfully!");
      
    } catch (error) {
      console.error(`❌ Service initialization failed: ${error.message}`);
      this.testResults.initialization.overall = { success: false, error: error.message };
      throw error;
    }
  }

  /**
   * Simulate document ingestion pipeline
   */
  async simulateIngestion() {
    console.log("\n📥 Step 2: Simulating Document Ingestion");
    console.log("-".repeat(40));
    
    try {
      // Create temporary test file
      const tempFilePath = join(__dirname, '..', 'temp-integration-test.txt');
      fs.writeFileSync(tempFilePath, this.sampleDocument.content);
      
      console.log(`📄 Processing test document: ${this.sampleDocument.name}`);
      
      // Process the document
      const processedDoc = await this.services.documentProcessor.processFile(
        tempFilePath,
        this.sampleDocument.name,
        [], // No existing versions
        {}  // No special options
      );
      
      console.log(`✅ Document processed: ${processedDoc.chunks.length} child chunks, ${processedDoc.parentChunks.length} parent chunks`);
      
      // Generate embeddings for child chunks
      console.log("🤖 Generating embeddings for child chunks...");
      const childChunkTexts = processedDoc.chunks.map(chunk => chunk.content);
      const embeddings = await this.services.embeddingService.generateEmbeddings(childChunkTexts);
      console.log(`✅ Generated ${embeddings.length} embeddings`);
      
      // Prepare data for vector store
      const documents = childChunkTexts;
      const metadatas = processedDoc.chunks.map(chunk => ({
        ...chunk.metadata,
        documentName: this.sampleDocument.name,
        uploadedAt: new Date().toISOString(),
        ingestionTime: new Date().toISOString()
      }));
      const ids = processedDoc.chunks.map(chunk => chunk.id);
      
      // Store in vector store
      console.log("🗄️ Storing child chunks in vector store...");
      await this.services.vectorStore.addDocuments(documents, embeddings, metadatas, ids);
      console.log("✅ Child chunks stored in vector store");
      
      // Store parent chunks in document store
      console.log("📦 Storing parent chunks in document store...");
      const parentChunkResults = this.services.documentStore.storeParentChunksBatch(
        processedDoc.parentChunks.map(chunk => ({
          id: chunk.id,
          chunk: chunk
        }))
      );
      console.log(`✅ Parent chunks stored: ${parentChunkResults.successful}/${parentChunkResults.total} successful`);
      
      // Clean up temporary file
      fs.unlinkSync(tempFilePath);
      
      this.testResults.ingestion = {
        success: true,
        childChunks: processedDoc.chunks.length,
        parentChunks: processedDoc.parentChunks.length,
        embeddings: embeddings.length,
        vectorStoreSuccess: true,
        documentStoreSuccess: parentChunkResults.successful > 0
      };
      
      console.log("\n🎉 Document ingestion completed successfully!");
      
    } catch (error) {
      console.error(`❌ Document ingestion failed: ${error.message}`);
      this.testResults.ingestion = { success: false, error: error.message };
      throw error;
    }
  }

  /**
   * Simulate query processing through QAService
   */
  async simulateQuery() {
    console.log("\n❓ Step 3: Simulating Query Processing");
    console.log("-".repeat(40));
    
    try {
      console.log(`🔍 Processing question: "${this.sampleQuestion}"`);
      
      // Use QAService to answer the question
      const answer = await this.services.qaService.answerQuestion(this.sampleQuestion);
      
      console.log("\n📋 Query Processing Results:");
      console.log(`Answer: ${answer.answer}`);
      console.log(`Confidence: ${answer.confidence}`);
      console.log(`Reasoning Strategy: ${answer.reasoningStrategy}`);
      console.log(`Model Used: ${answer.model}`);
      
      if (answer.metadata) {
        console.log(`Context Chunks: ${answer.metadata.contextChunks || 'N/A'}`);
        console.log(`Total Context Length: ${answer.metadata.totalContextLength || 'N/A'}`);
      }
      
      this.testResults.query = {
        success: true,
        answer: answer.answer,
        confidence: answer.confidence,
        reasoningStrategy: answer.reasoningStrategy,
        model: answer.model,
        metadata: answer.metadata
      };
      
      console.log("\n🎉 Query processing completed successfully!");
      
    } catch (error) {
      console.error(`❌ Query processing failed: ${error.message}`);
      this.testResults.query = { success: false, error: error.message };
      throw error;
    }
  }

  /**
   * Generate comprehensive test report
   */
  generateReport() {
    const endTime = Date.now();
    const totalTime = endTime - this.startTime;
    
    console.log("\n" + "=".repeat(60));
    console.log("📊 INTEGRATION TEST REPORT");
    console.log("=".repeat(60));
    
    // Overall success
    const allStepsSuccessful = 
      this.testResults.initialization.overall?.success &&
      this.testResults.ingestion.success &&
      this.testResults.query.success;
    
    if (allStepsSuccessful) {
      console.log("✅ FULL PIPELINE TEST SUCCESSFUL");
      console.log("\n🎼 The orchestra is playing in perfect harmony!");
    } else {
      console.log("❌ PIPELINE TEST FAILED");
      console.log("\n🎼 Some musicians are out of tune!");
    }
    
    // Detailed results
    console.log("\n📋 Detailed Results:");
    console.log(`⏱️  Total Test Time: ${totalTime}ms`);
    
    // Initialization results
    console.log("\n🎯 Service Initialization:");
    Object.entries(this.testResults.initialization).forEach(([service, result]) => {
      if (service !== 'overall') {
        const status = result.success ? "✅" : "❌";
        console.log(`   ${status} ${service}: ${result.success ? 'Success' : result.error}`);
      }
    });
    
    // Ingestion results
    console.log("\n📥 Document Ingestion:");
    if (this.testResults.ingestion.success) {
      console.log(`   ✅ Child chunks processed: ${this.testResults.ingestion.childChunks}`);
      console.log(`   ✅ Parent chunks processed: ${this.testResults.ingestion.parentChunks}`);
      console.log(`   ✅ Embeddings generated: ${this.testResults.ingestion.embeddings}`);
      console.log(`   ✅ Vector store: ${this.testResults.ingestion.vectorStoreSuccess ? 'Success' : 'Failed'}`);
      console.log(`   ✅ Document store: ${this.testResults.ingestion.documentStoreSuccess ? 'Success' : 'Failed'}`);
    } else {
      console.log(`   ❌ Ingestion failed: ${this.testResults.ingestion.error}`);
    }
    
    // Query results
    console.log("\n❓ Query Processing:");
    if (this.testResults.query.success) {
      console.log(`   ✅ Answer generated: ${this.testResults.query.answer.substring(0, 100)}...`);
      console.log(`   ✅ Confidence score: ${this.testResults.query.confidence}`);
      console.log(`   ✅ Reasoning strategy: ${this.testResults.query.reasoningStrategy}`);
      console.log(`   ✅ Model used: ${this.testResults.query.model}`);
    } else {
      console.log(`   ❌ Query failed: ${this.testResults.query.error}`);
    }
    
    // Final verdict
    console.log("\n" + "=".repeat(60));
    if (allStepsSuccessful) {
      console.log("🎉 INTEGRATION TEST PASSED - ALL SYSTEMS OPERATIONAL");
      console.log("🚀 Your RAG pipeline is ready for production!");
    } else {
      console.log("⚠️  INTEGRATION TEST FAILED - ISSUES DETECTED");
      console.log("🔧 Please review the errors above and fix them before deployment.");
    }
    console.log("=".repeat(60));
    
    this.testResults.overall = {
      success: allStepsSuccessful,
      totalTime: totalTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log("\n🧹 Cleaning up resources...");
    
    // Stop cleanup timers if they exist
    if (this.services.documentStore && this.services.documentStore.stopCleanupTimer) {
      this.services.documentStore.stopCleanupTimer();
    }
    
    console.log("✅ Cleanup completed");
  }
}

/**
 * Main execution function
 */
async function main() {
  const test = new IntegrationTest();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted by user');
    test.cleanup();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Test terminated');
    test.cleanup();
    process.exit(0);
  });
  
  try {
    await test.run();
  } finally {
    test.cleanup();
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Integration test crashed:', error);
    process.exit(1);
  });
}

export default IntegrationTest;
