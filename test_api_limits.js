#!/usr/bin/env node

/**
 * Test script to diagnose and fix API quota issues
 * This script will test the RAG system with optimized settings
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { QAService } from './src/services/qa-service.js';
import { VectorStore } from './src/services/vector-store.js';
import { EmbeddingService } from './src/services/embedding-service.js';
import { LangChainManager } from './src/services/langchain-manager.js';
import { DocumentProcessor } from './src/services/document-processor.js';

async function testAPISystem() {
  console.log('🔧 Testing RAG System with API Optimizations...\n');

  try {
    // Initialize services with optimized settings
    console.log('1. Initializing Embedding Service...');
    const embeddingService = new EmbeddingService();
    const embeddingInitialized = await embeddingService.initialize();
    console.log(`   ✅ Embedding Service: ${embeddingInitialized ? 'Ready' : 'Failed'}`);

    console.log('\n2. Initializing Vector Store...');
    const vectorStore = new VectorStore();
    const vectorInitialized = await vectorStore.initialize();
    console.log(`   ✅ Vector Store: ${vectorInitialized ? 'Ready' : 'Failed'}`);

    console.log('\n3. Initializing LLM Manager (with tiering disabled)...');
    const llmManager = new LangChainManager({
      provider: process.env.LLM_PROVIDER || 'google',
      modelName: process.env.LLM_MODEL || 'gemini-1.5-flash',
      useModelTiering: false, // Explicitly disable tiering
      maxRequestsPerMinute: 5, // Reduce rate limit
      maxRequestsPerDay: 100   // Reduce daily limit
    });
    const llmInitialized = await llmManager.initialize();
    console.log(`   ✅ LLM Manager: ${llmInitialized ? 'Ready' : 'Failed'}`);
    console.log(`   📊 Model Tiering: ${llmManager.useModelTiering ? 'Enabled' : 'Disabled'}`);

    console.log('\n4. Initializing QA Service...');
    const qaService = new QAService(embeddingService, vectorStore, null, {
      langChainManager: llmManager
    });
    const qaInitialized = await qaService.initialize();
    console.log(`   ✅ QA Service: ${qaInitialized ? 'Ready' : 'Failed'}`);

    // Test with a simple question
    console.log('\n5. Testing QA with simple question...');
    const testQuestion = "What is machine learning?";

    try {
      const result = await qaService.answerQuestion(testQuestion);
      console.log(`   ✅ Answer generated successfully!`);
      console.log(`   📊 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   📚 Sources: ${result.sources.length}`);
      console.log(`   💬 Answer preview: "${result.answer.substring(0, 100)}..."`);
    } catch (error) {
      console.log(`   ❌ QA Test failed: ${error.message}`);

      // Provide specific guidance based on error
      if (error.message.includes('429') || error.message.includes('quota')) {
        console.log('\n💡 SOLUTION: API quota exhausted. Consider:');
        console.log('   • Switch to OpenAI or Anthropic API');
        console.log('   • Wait for quota reset (usually daily)');
        console.log('   • Use local models with Ollama');
        console.log('   • Implement caching to reduce API calls');
      } else if (error.message.includes('embedding')) {
        console.log('\n💡 SOLUTION: Embedding service issue. Check:');
        console.log('   • API key validity');
        console.log('   • Network connectivity');
        console.log('   • Fallback to local embeddings');
      }
    }

    console.log('\n📈 System Status Summary:');
    console.log(`   • Embedding Service: ${embeddingService.isInitialized ? '✅' : '❌'}`);
    console.log(`   • Vector Store: ${vectorStore.isInitialized ? '✅' : '❌'}`);
    console.log(`   • LLM Manager: ${llmManager.isInitialized ? '✅' : '❌'}`);
    console.log(`   • QA Service: ${qaService.isInitialized ? '✅' : '❌'}`);
    console.log(`   • Model Tiering: ${llmManager.useModelTiering ? 'Enabled ⚡' : 'Disabled 🛡️'}`);

  } catch (error) {
    console.error('\n❌ System initialization failed:', error.message);
    console.log('\n🔧 Troubleshooting steps:');
    console.log('1. Check API keys in .env file');
    console.log('2. Verify MongoDB connection');
    console.log('3. Check network connectivity');
    console.log('4. Consider switching to local models');
  }
}

// Alternative test using fast mode
async function testFastMode() {
  console.log('\n🚀 Testing with FAST MODE enabled...\n');

  // Set environment variables for fast mode
  process.env.QA_FAST_MODE = 'true';
  process.env.DISABLE_QUERY_REWRITING = 'true';
  process.env.DISABLE_LLM_RERANKING = 'true';
  process.env.DISABLE_NARRATIVE_CONTEXT = 'true';
  process.env.DISABLE_MODEL_TIERING = 'true';

  await testAPISystem();
}

// Run the test
if (process.argv[2] === '--fast') {
  testFastMode();
} else {
  testAPISystem();
}

export { testAPISystem, testFastMode };
