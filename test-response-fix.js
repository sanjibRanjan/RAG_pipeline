#!/usr/bin/env node

/**
 * Test script to verify the response structure fixes
 */

import { QAService } from './src/services/qa-service.js';
import { EmbeddingService } from './src/services/embedding-service.js';
import { VectorStore } from './src/services/vector-store.js';

// Mock chunks that simulate the exact fragmented response issue
const mockChunks = [
  {
    content: "Part 3 — Factors Affecting Attraction: Physical Attractiveness: s cannot be relied upon to demonstrate the mechanism of self-disclosure in relation to the quality of relationships.",
    similarity: 0.8,
    metadata: { documentName: "test-doc.pdf", chunkIndex: 0 },
    finalScore: 0.8
  },
  {
    content: "Part 3 — Factors Affecting Attraction: Physical Attractiveness: Altman and Taylor have proposed the 'social penetration' theory, which suggests that the process of self-disclosure allows one person to penetrate deeper into the life of their partner, thus increasing intimacy and trust.",
    similarity: 0.9,
    metadata: { documentName: "test-doc.pdf", chunkIndex: 1 },
    finalScore: 0.9
  }
];

async function testResponseFix() {
  console.log("🧪 Testing Response Structure Fix\n");

  try {
    // Initialize services
    const embeddingService = new EmbeddingService();
    const vectorStore = new VectorStore();
    
    await embeddingService.initialize();
    await vectorStore.initialize();
    
    const qaService = new QAService(embeddingService, vectorStore);
    await qaService.initialize();
    
    console.log("✅ Services initialized\n");

    // Test the content cleaning function directly
    console.log("🔧 Testing content cleaning...");
    for (let i = 0; i < mockChunks.length; i++) {
      const original = mockChunks[i].content;
      const cleaned = qaService.cleanChunkContent(original);
      
      console.log(`Chunk ${i + 1}:`);
      console.log("Original:", original);
      console.log("Cleaned:", cleaned);
      console.log("─".repeat(80));
    }

    // Test the improved fallback answer generation
    console.log("\n🔧 Testing improved fallback answer generation...");
    const testQuestion = "What is self-disclosure and how does it affect relationships?";
    
    const fallbackAnswer = qaService.generateFallbackAnswer(mockChunks, testQuestion);
    console.log("Fallback Answer:");
    console.log("─".repeat(80));
    console.log(fallbackAnswer);
    console.log("─".repeat(80));
    
    // Test if the answer contains the problematic headers
    const hasProblematicHeaders = fallbackAnswer.includes("Part 3 — Factors Affecting Attraction: Physical Attractiveness:");
    console.log(`\n🔍 Contains problematic headers: ${hasProblematicHeaders}`);
    
    if (!hasProblematicHeaders) {
      console.log("✅ SUCCESS: Headers have been removed!");
    } else {
      console.log("❌ FAILURE: Headers are still present");
    }

    console.log("\n✅ Test completed!");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run tests
testResponseFix().catch(console.error);
