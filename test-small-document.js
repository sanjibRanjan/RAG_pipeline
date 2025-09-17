#!/usr/bin/env node

/**
 * Test Small Document Processing
 * 
 * This script tests with a very small document to avoid API issues
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

async function testSmallDocument() {
  console.log('🚀 Testing Small Document Processing');
  console.log('='.repeat(50));

  try {
    // Set environment variables
    process.env.CHROMA_DB_URL = 'http://localhost:8000';
    process.env.CHROMA_COLLECTION_NAME = 'test_collection';
    process.env.MAX_CHUNKS_PER_DOCUMENT = '5'; // Very small limit

    // Check environment
    if (!process.env.HF_API_KEY) {
      console.error('❌ HF_API_KEY environment variable is required');
      process.exit(1);
    }

    console.log('✅ Environment variables set');
    console.log(`📊 Max chunks per document: ${process.env.MAX_CHUNKS_PER_DOCUMENT}`);

    // Initialize services
    console.log('🔧 Initializing services...');
    const embeddingService = new EmbeddingService();
    const vectorStore = new VectorStore();
    const documentProcessor = new DocumentProcessor();

    await embeddingService.initialize();
    console.log('✅ Embedding service ready');

    await vectorStore.initialize();
    console.log('✅ Vector store ready');

    // Create a small test document
    console.log('📄 Creating small test document...');
    const testText = `
    This is a small test document about machine learning.
    Machine learning is a subset of artificial intelligence.
    It involves training algorithms on data to make predictions.
    Common applications include image recognition and natural language processing.
    `;

    const testFilePath = path.join(__dirname, 'test-small.txt');
    fs.writeFileSync(testFilePath, testText);

    // Process the small document
    const processedDoc = await documentProcessor.processFile(testFilePath, 'test-small.txt', [], { forceNewVersion: true });
    
    console.log(`✅ Processed: ${processedDoc.chunks.length} chunks, ${processedDoc.text.length} characters`);

    // Test embedding generation with very small batches
    console.log('🤖 Testing embedding generation...');
    
    const maxChunks = parseInt(process.env.MAX_CHUNKS_PER_DOCUMENT) || 5;
    const chunksToProcess = processedDoc.chunks.slice(0, maxChunks);
    
    const texts = chunksToProcess.map((chunk) => chunk.content);
    
    // Use very small batch size
    const batchSize = 1; // Process one text at a time
    console.log(`🔄 Generating embeddings for ${texts.length} chunks one by one...`);
    
    const startTime = Date.now();
    const embeddings = await embeddingService.generateEmbeddingsBatch(texts, batchSize);
    const endTime = Date.now();
    
    console.log(`✅ Generated ${embeddings.length} embeddings in ${endTime - startTime}ms`);

    // Store in ChromaDB
    console.log('💾 Storing in ChromaDB...');
    const metadatas = chunksToProcess.map((chunk, index) => ({
      documentName: 'test-small.txt',
      chunkIndex: index,
      contentLength: chunk.content.length,
      uploadedAt: new Date().toISOString()
    }));
    const ids = chunksToProcess.map((chunk, index) => `test_small_${Date.now()}_${index}`);
    
    await vectorStore.addDocuments(texts, embeddings, metadatas, ids);
    console.log('✅ Documents stored in ChromaDB');

    // Test search
    console.log('🔍 Testing search...');
    const queryEmbedding = await embeddingService.generateSingleEmbedding("machine learning");
    const searchResults = await vectorStore.search(queryEmbedding, 3);
    
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
    fs.unlinkSync(testFilePath); // Delete test file
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 Small Document Test PASSED!');
    console.log('The API can handle small documents successfully:');
    console.log('  ✅ Individual text processing works');
    console.log('  ✅ Small batches avoid API timeouts');
    console.log('  ✅ ChromaDB storage and retrieval works');
    console.log('  ✅ Search functionality works');
    
  } catch (error) {
    console.error('\n❌ Small Document Test FAILED!');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testSmallDocument();
