#!/usr/bin/env node

/**
 * Debug script to investigate retrieval quality issues
 * This will help us understand why the RAG system is returning irrelevant answers
 */

import dotenv from 'dotenv';
dotenv.config();

import { VectorStore } from './src/services/vector-store.js';
import { EmbeddingService } from './src/services/embedding-service.js';

async function debugRetrieval() {
  console.log('🔍 Debugging RAG Retrieval Quality...\n');

  try {
    // Initialize services
    console.log('1. Initializing Embedding Service...');
    const embeddingService = new EmbeddingService();
    await embeddingService.initialize();

    console.log('2. Initializing Vector Store...');
    const vectorStore = new VectorStore();
    await vectorStore.initialize();

    // Check document count and sample
    console.log('\n3. Checking stored documents...');
    const collection = vectorStore.db.collection(vectorStore.collectionName);
    const totalDocs = await collection.countDocuments();
    console.log(`   📊 Total documents in vector store: ${totalDocs}`);

    // Get sample documents
    const sampleDocs = await collection.find({}).limit(3).toArray();
    console.log('\n   📄 Sample documents:');
    sampleDocs.forEach((doc, i) => {
      console.log(`   ${i + 1}. ID: ${doc._id || doc.chunkId}`);
      console.log(`      Content: "${doc.content.substring(0, 100)}..."`);
      console.log(`      Metadata: ${JSON.stringify(doc.metadata, null, 2)}`);
      console.log(`      Has embedding: ${doc.embedding ? '✅' : '❌'}`);
      console.log('');
    });

    // Test embedding generation
    console.log('4. Testing embedding generation...');
    const testText = "What is machine learning?";
    const testEmbedding = await embeddingService.generateSingleEmbedding(testText);
    console.log(`   ✅ Generated embedding with ${testEmbedding.length} dimensions`);

    // Test direct vector search
    console.log('\n5. Testing direct vector search...');
    const searchResults = await vectorStore.search(testEmbedding, 5);
    console.log(`   🔍 Found ${searchResults.documents[0].length} results:`);

    searchResults.documents[0].forEach((doc, i) => {
      const distance = searchResults.distances[0][i];
      const metadata = searchResults.metadatas[0][i];
      console.log(`   ${i + 1}. Distance: ${distance?.toFixed(4) || 'N/A'}`);
      console.log(`      Content: "${doc.substring(0, 150)}..."`);
      console.log(`      Source: ${metadata?.source || 'Unknown'}`);
      console.log(`      File: ${metadata?.documentName || 'Unknown'}`);
      console.log('');
    });

    // Test keyword search
    console.log('6. Testing keyword search...');
    try {
      const keywordResults = await vectorStore.searchDocuments("machine learning");
      console.log(`   🔍 Keyword search found ${keywordResults.length} results`);
      if (keywordResults.length > 0) {
        console.log(`      Sample: "${keywordResults[0].contentPreview}"`);
      }
    } catch (error) {
      console.log(`   ❌ Keyword search failed: ${error.message}`);
    }

    // Analyze document quality
    console.log('\n7. Analyzing document quality...');
    const allDocs = await collection.find({}).limit(10).toArray();

    let totalEmbeddingCount = 0;
    let docsWithEmbeddings = 0;
    let chunkLengths = [];
    let contentTypes = new Set();

    allDocs.forEach(doc => {
      if (doc.embedding) {
        docsWithEmbeddings++;
        totalEmbeddingCount++;
      }
      if (doc.content) {
        chunkLengths.push(doc.content.length);
      }
      if (doc.metadata?.contentType) {
        contentTypes.add(doc.metadata.contentType);
      }
    });

    console.log(`   📊 Documents with embeddings: ${docsWithEmbeddings}/${allDocs.length}`);
    console.log(`   📏 Average chunk length: ${chunkLengths.length > 0 ? Math.round(chunkLengths.reduce((a, b) => a + b, 0) / chunkLengths.length) : 0} chars`);
    console.log(`   📝 Content types: ${Array.from(contentTypes).join(', ') || 'Unknown'}`);
    console.log(`   🔢 Embedding dimensions: ${sampleDocs[0]?.embedding?.length || 'Unknown'}`);

    // Check for common issues
    console.log('\n8. Checking for common issues...');

    if (docsWithEmbeddings === 0) {
      console.log('   ❌ CRITICAL: No documents have embeddings!');
    } else if (docsWithEmbeddings < totalDocs * 0.8) {
      console.log('   ⚠️ WARNING: Many documents missing embeddings');
    }

    if (chunkLengths.length > 0 && Math.max(...chunkLengths) < 100) {
      console.log('   ⚠️ WARNING: Chunks are very short, may lose context');
    }

    if (contentTypes.size === 0) {
      console.log('   ⚠️ WARNING: No content type metadata found');
    }

    console.log('\n✅ Retrieval debugging complete!');

  } catch (error) {
    console.error('\n❌ Debug failed:', error.message);
    console.log('\n🔧 Possible issues:');
    console.log('1. Database connection issues');
    console.log('2. Embedding generation failures');
    console.log('3. Document processing issues');
    console.log('4. Vector indexing problems');
  }
}

// Run the debug
debugRetrieval();
