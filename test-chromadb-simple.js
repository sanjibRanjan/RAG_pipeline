#!/usr/bin/env node

/**
 * Simple ChromaDB Test Script
 * 
 * This script tests ChromaDB functionality with sample PDF files:
 * 1. Processes a sample PDF from uploads folder
 * 2. Stores it in ChromaDB
 * 3. Tests retrieval and search functionality
 * 4. Provides clear feedback on what's working
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

class SimpleChromaDBTester {
  constructor() {
    this.vectorStore = new VectorStore();
    this.documentProcessor = new DocumentProcessor();
    this.embeddingService = new EmbeddingService();
    this.testResults = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  async testChromaDBWithSamplePDF() {
    try {
      this.log('🚀 Starting ChromaDB Test with Sample PDF', 'info');
      console.log('='.repeat(60));

      // Step 1: Check environment and files
      this.log('Step 1: Checking environment and sample files...', 'info');
      
      if (!process.env.HF_API_KEY) {
        this.log('HF_API_KEY environment variable is required', 'error');
        return false;
      }

      const uploadsDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        this.log('Uploads directory does not exist', 'error');
        return false;
      }

      const files = fs.readdirSync(uploadsDir);
      const pdfFiles = files.filter(file => file.endsWith('.pdf'));
      
      if (pdfFiles.length === 0) {
        this.log('No PDF files found in uploads directory', 'error');
        return false;
      }

      const testFile = pdfFiles[0];
      this.log(`Found ${pdfFiles.length} PDF files, using: ${testFile}`, 'success');

      // Step 2: Initialize services
      this.log('Step 2: Initializing services...', 'info');
      
      await this.embeddingService.initialize();
      this.log('Embedding service initialized', 'success');
      
      await this.vectorStore.initialize();
      this.log('Vector store initialized', 'success');

      // Step 3: Process PDF document
      this.log('Step 3: Processing PDF document...', 'info');
      
      const filePath = path.join(uploadsDir, testFile);
      const processedDoc = await this.documentProcessor.processFile(
        filePath, 
        testFile, 
        [], 
        { forceNewVersion: true }
      );

      this.log(`Document processed successfully:`, 'success');
      this.log(`  - Text length: ${processedDoc.text.length} characters`, 'info');
      this.log(`  - Child chunks: ${processedDoc.chunks.length}`, 'info');
      this.log(`  - Parent chunks: ${processedDoc.parentChunks?.length || 0}`, 'info');

      // Step 4: Generate embeddings
      this.log('Step 4: Generating embeddings...', 'info');
      
      const sampleChunks = processedDoc.chunks.slice(0, 5); // Use first 5 chunks for testing
      const documents = sampleChunks.map(chunk => chunk.content);
      const embeddings = await this.embeddingService.generateEmbeddings(documents);
      
      this.log(`Generated ${embeddings.length} embeddings (${embeddings[0]?.length || 0} dimensions each)`, 'success');

      // Step 5: Store in ChromaDB
      this.log('Step 5: Storing documents in ChromaDB...', 'info');
      
      const metadatas = sampleChunks.map(chunk => ({
        ...chunk.metadata,
        documentName: testFile,
        uploadedAt: new Date().toISOString(),
        testRun: true
      }));
      
      const ids = sampleChunks.map((chunk, index) => `test_${Date.now()}_${index}`);
      
      await this.vectorStore.addDocuments(documents, embeddings, metadatas, ids);
      this.log(`Stored ${documents.length} documents in ChromaDB`, 'success');

      // Step 6: Test retrieval
      this.log('Step 6: Testing document retrieval...', 'info');
      
      const stats = await this.vectorStore.getStats();
      this.log(`Collection stats: ${stats.documentCount} documents`, 'success');
      
      const listedDocs = await this.vectorStore.listDocuments(10);
      this.log(`Listed ${listedDocs.length} documents`, 'success');

      // Step 7: Test search functionality
      this.log('Step 7: Testing search functionality...', 'info');
      
      const testQueries = [
        "machine learning",
        "artificial intelligence", 
        "data analysis",
        "technology",
        "programming"
      ];

      for (const query of testQueries) {
        this.log(`  Testing query: "${query}"`, 'info');
        
        const queryEmbedding = await this.embeddingService.generateSingleEmbedding(query);
        const searchResults = await this.vectorStore.search(queryEmbedding, 3);
        
        if (searchResults && searchResults.documents && searchResults.documents[0]) {
          const resultCount = searchResults.documents[0].length;
          this.log(`    Found ${resultCount} results`, 'success');
          
          // Show first result preview
          if (resultCount > 0) {
            const firstResult = searchResults.documents[0][0];
            const preview = firstResult.substring(0, 100) + '...';
            this.log(`    First result preview: "${preview}"`, 'info');
          }
        } else {
          this.log(`    No results found`, 'warning');
        }
      }

      // Step 8: Test document management
      this.log('Step 8: Testing document management...', 'info');
      
      const summaries = await this.vectorStore.getDocumentSummaries();
      this.log(`Document summaries: ${summaries.length} documents`, 'success');
      
      if (summaries.length > 0) {
        const summary = summaries[0];
        this.log(`  Sample document: ${summary.name} (${summary.chunks} chunks)`, 'info');
      }

      // Step 9: Cleanup
      this.log('Step 9: Cleaning up test data...', 'info');
      
      await this.vectorStore.deleteDocuments(ids);
      this.log(`Deleted ${ids.length} test documents`, 'success');

      // Final summary
      this.log('🎉 ChromaDB Test Completed Successfully!', 'success');
      this.log('All core functionality is working correctly:', 'success');
      this.log('  ✅ Document processing', 'success');
      this.log('  ✅ Embedding generation', 'success');
      this.log('  ✅ Vector storage', 'success');
      this.log('  ✅ Document retrieval', 'success');
      this.log('  ✅ Search functionality', 'success');
      this.log('  ✅ Document management', 'success');

      return true;

    } catch (error) {
      this.log(`Test failed: ${error.message}`, 'error');
      console.error('Full error:', error);
      return false;
    }
  }

  async runTest() {
    const success = await this.testChromaDBWithSamplePDF();
    
    if (success) {
      this.log('ChromaDB is working correctly and can retrieve information from PDFs!', 'success');
      process.exit(0);
    } else {
      this.log('ChromaDB test failed. Please check the error messages above.', 'error');
      process.exit(1);
    }
  }
}

// Run the test
async function main() {
  const tester = new SimpleChromaDBTester();
  await tester.runTest();
}

// Handle errors
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

export default SimpleChromaDBTester;
