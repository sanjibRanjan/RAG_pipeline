#!/usr/bin/env node

import { config } from 'dotenv';
import LangChainManager from './src/services/langchain-manager.js';

// Load environment variables
config();

async function testLLMIntegration() {
  console.log('🧪 Testing LLM Integration...\n');

  // Create LangChainManager instance
  const provider = process.env.LLM_PROVIDER || 'openai';
  const llmManager = new LangChainManager({
    provider: provider,
    // Let LangChainManager handle the default model name based on provider
    modelName: process.env.LLM_MODEL,
    temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.3,
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 2000
  });

  try {
    // Initialize LLM
    console.log('1. Initializing LLM...');
    await llmManager.initialize();
    console.log('✅ LLM initialized successfully\n');

    // Test basic answer generation
    console.log('2. Testing answer generation...');
    const testQuestion = "What is machine learning?";
    const mockChunks = [
      {
        content: "Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed.",
        similarity: 0.9,
        finalScore: 0.85,
        metadata: { documentName: "ai_guide.pdf" }
      },
      {
        content: "Machine learning algorithms build mathematical models based on training data to make predictions or decisions.",
        similarity: 0.8,
        finalScore: 0.75,
        metadata: { documentName: "ml_basics.pdf" }
      }
    ];

    const questionAnalysis = {
      type: 'definition',
      complexity: 'basic',
      keywords: ['machine', 'learning']
    };

    const result = await llmManager.generateAnswer(
      testQuestion,
      mockChunks,
      questionAnalysis,
      [],
      { maxRetries: 1, timeout: 15000 }
    );

    console.log('✅ Answer generated successfully!');
    console.log(`📝 Answer: ${result.answer.substring(0, 200)}...`);
    console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`🤖 Model: ${result.model}`);
    console.log(`📊 Metadata:`, result.metadata);
    console.log('');

    // Test stats
    console.log('3. Getting LLM stats...');
    const stats = llmManager.getStats();
    console.log('📊 LLM Stats:', stats);
    console.log('');

    console.log('🎉 All LLM tests passed!');

  } catch (error) {
    console.error('❌ LLM test failed:', error.message);

    if (error.message.includes('API_KEY')) {
      console.log('\n💡 Tip: Make sure you have set the correct API key in your .env file:');
      console.log(`   For OpenAI: OPENAI_API_KEY=your_key_here`);
      console.log(`   For Anthropic: ANTHROPIC_API_KEY=your_key_here`);
    }

    if (error.message.includes('not initialized')) {
      console.log('\n💡 Tip: Check that LLM_PROVIDER is set to "openai" or "anthropic" (not "none")');
    }

    process.exit(1);
  }
}

// Check environment setup
function checkEnvironment() {
  console.log('🔍 Checking environment setup...\n');

  const provider = process.env.LLM_PROVIDER;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  console.log(`LLM Provider: ${provider || 'not set'}`);
  console.log(`OpenAI Key: ${openaiKey ? '✅ set' : '❌ not set'}`);
  console.log(`Anthropic Key: ${anthropicKey ? '✅ set' : '❌ not set'}`);
  console.log(`Google/Gemini Key: ${googleKey ? '✅ set' : '❌ not set'}`);

  if (provider === 'none' || !provider) {
    console.log('\n⚠️  Warning: LLM_PROVIDER is set to "none". LLM features will be disabled.');
    console.log('   To enable LLM, set LLM_PROVIDER to "openai", "anthropic", "google", or "gemini" in your .env file.');
    return false;
  }

  if (provider === 'openai' && !openaiKey) {
    console.log('\n❌ Error: LLM_PROVIDER is "openai" but OPENAI_API_KEY is not set.');
    return false;
  }

  if (provider === 'anthropic' && !anthropicKey) {
    console.log('\n❌ Error: LLM_PROVIDER is "anthropic" but ANTHROPIC_API_KEY is not set.');
    return false;
  }

  if ((provider === 'google' || provider === 'gemini') && !googleKey) {
    console.log('\n❌ Error: LLM_PROVIDER is "google"/"gemini" but GOOGLE_API_KEY or GEMINI_API_KEY is not set.');
    return false;
  }

  console.log('\n✅ Environment setup looks good!\n');
  return true;
}

// Run tests
async function main() {
  console.log('🚀 LLM Integration Test Suite\n');
  console.log('================================\n');

  const envOk = checkEnvironment();
  if (!envOk) {
    console.log('❌ Environment check failed. Please fix the issues above and try again.');
    process.exit(1);
  }

  await testLLMIntegration();
}

main().catch(error => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});
