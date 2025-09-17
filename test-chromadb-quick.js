#!/usr/bin/env node

/**
 * Quick ChromaDB Test Script
 * 
 * This is a minimal test to verify ChromaDB is working correctly.
 * It processes one PDF file and tests basic functionality.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import VectorStore from './src/services/vector-store.js';
import DocumentProcessor from './src/services/document-processor.js';
import EmbeddingService from './src/services/embedding-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function quickTest() {
  console.log('🚀 Quick ChromaDB Test');
  console.log('='.repeat(40));

  try {
    // Set environment variables
    process.env.CHROMA_DB_URL = 'http://localhost:8000';
    process.env.CHROMA_COLLECTION_NAME = 'test_collection';

    // Check environment
    if (!process.env.HF_API_KEY) {
      console.error('❌ HF_API_KEY environment variable is required');
      process.exit(1);
    }

    // Find a PDF file
    const uploadsDir = path.join(__dirname, 'uploads');
    const files = fs.readdirSync(uploadsDir);
    const pdfFiles = files.filter(file => file.endsWith('.pdf'));
    
    if (pdfFiles.length === 0) {
      console.error('❌ No PDF files found in uploads directory');
      process.exit(1);
    }

    const testFile = pdfFiles[0];
    console.log(`📄 Using test file: ${testFile}`);

    // Initialize services
    console.log('🔧 Initializing services...');
    const embeddingService = new EmbeddingService();
    const vectorStore = new VectorStore();
    const documentProcessor = new DocumentProcessor();

    await embeddingService.initialize();
    console.log('✅ Embedding service ready');

    await vectorStore.initialize();
    console.log('✅ Vector store ready');

    // Process PDF
    console.log('📄 Processing PDF...');
    const filePath = path.join(uploadsDir, testFile);
    const processedDoc = await documentProcessor.processFile(filePath, testFile, [], { forceNewVersion: true });
    
    console.log(`✅ Processed: ${processedDoc.chunks.length} chunks, ${processedDoc.text.length} characters`);

    // Generate embeddings for first 3 chunks
    console.log('🤖 Generating embeddings...');
    const sampleChunks = processedDoc.chunks.slice(0, 3);
    const documents = sampleChunks.map(chunk => chunk.content);
    const embeddings = await embeddingService.generateEmbeddings(documents);
    console.log(`✅ Generated ${embeddings.length} embeddings`);

    // Store in ChromaDB
    console.log('💾 Storing in ChromaDB...');
    const metadatas = sampleChunks.map((chunk, index) => ({
      documentName: testFile,
      chunkIndex: index,
      contentLength: chunk.content.length,
      uploadedAt: new Date().toISOString()
    }));
    const ids = sampleChunks.map((chunk, index) => `test_${Date.now()}_${index}`);
    
    await vectorStore.addDocuments(documents, embeddings, metadatas, ids);
    console.log('✅ Documents stored in ChromaDB');

    // Test search
    console.log('🔍 Testing search...');
    const queryEmbedding = await embeddingService.generateSingleEmbedding("machine learning");
    const searchResults = await vectorStore.search(queryEmbedding, 2);
    
    if (searchResults && searchResults.documents && searchResults.documents[0]) {
      console.log(`✅ Search successful: Found ${searchResults.documents[0].length} results`);
      
      // Show first result
      const firstResult = searchResults.documents[0][0];
      console.log(`📝 First result preview: "${firstResult.substring(0, 100)}..."`);
    } else {
      console.log('⚠️ No search results found');
    }

    // Check collection stats
    const stats = await vectorStore.getStats();
    console.log(`📊 Collection has ${stats.documentCount} documents`);

    // Cleanup
    console.log('🧹 Cleaning up...');
    await vectorStore.deleteDocuments(ids);
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 ChromaDB Test PASSED!');
    console.log('ChromaDB is working correctly and can retrieve information from PDFs.');
    
  } catch (error) {
    console.error('\n❌ ChromaDB Test FAILED!');
    console.error('Error:', error.message);
    console.error('\nPlease check:');
    console.error('1. ChromaDB is running (docker run -d --name chromadb -p 8000:8000 chromadb/chroma)');
    console.error('2. HF_API_KEY is set in environment');
    console.error('3. PDF files exist in uploads folder');
    process.exit(1);
  }
}

quickTest();
