#!/usr/bin/env node

/**
 * Test script to check LLM status and generation
 */

import { QAService } from './src/services/qa-service.js';
import { EmbeddingService } from './src/services/embedding-service.js';
import { VectorStore } from './src/services/vector-store.js';

async function testLLMStatus() {
  console.log("🧪 Testing LLM Status and Generation\n");

  try {
    // Initialize services
    const embeddingService = new EmbeddingService();
    const vectorStore = new VectorStore();
    
    await embeddingService.initialize();
    await vectorStore.initialize();
    
    const qaService = new QAService(embeddingService, vectorStore);
    await qaService.initialize();
    
    console.log("✅ Services initialized\n");

    // Check LLM status
    console.log("🔧 Checking LLM status...");
    console.log(`LLM Provider: ${qaService.llmProvider}`);
    console.log(`LLM Manager Available: ${qaService.langChainManager ? 'YES' : 'NO'}`);
    
    if (qaService.langChainManager) {
      console.log(`LLM Stats:`, qaService.langChainManager.getStats());
    }

    // Test with a simple question
    console.log("\n🔧 Testing with a simple question...");
    const testQuestion = "What is self-disclosure?";
    
    try {
      const result = await qaService.answerQuestion(testQuestion);
      console.log("Answer:", result.answer);
      console.log("Confidence:", result.confidence);
      console.log("Metadata:", result.metadata);
    } catch (error) {
      console.error("Error:", error.message);
    }

    console.log("\n✅ Test completed!");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run tests
testLLMStatus().catch(console.error);
