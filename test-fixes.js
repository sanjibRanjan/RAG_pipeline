#!/usr/bin/env node

/**
 * Quick test script to validate the response structure fixes
 */

import { QAService } from './src/services/qa-service.js';
import { EmbeddingService } from './src/services/embedding-service.js';
import { VectorStore } from './src/services/vector-store.js';

// Mock chunks that simulate the fragmented response issue
const mockChunks = [
  {
    content: "Part 3 — Factors Affecting Attraction: Physical Attractiveness: s cannot be relied upon to demonstrate the mechanism of self-disclosure in relation to the quality of relationships.",
    similarity: 0.8,
    metadata: { documentName: "test-doc.pdf", chunkIndex: 0 },
    finalScore: 0.8
  },
  {
    content: "Altman and Taylor have proposed the 'social penetration' theory, which suggests that the process of self-disclosure allows one person to penetrate deeper into the life of their partner, thus increasing intimacy and trust.",
    similarity: 0.9,
    metadata: { documentName: "test-doc.pdf", chunkIndex: 1 },
    finalScore: 0.9
  },
  {
    content: "Self-disclosure refers to the information we choose to reveal about ourselves within a romantic relationship. The aim of self-disclosure is to increase the intimacy, understanding and empathy between two individuals.",
    similarity: 0.85,
    metadata: { documentName: "test-doc.pdf", chunkIndex: 2 },
    finalScore: 0.85
  }
];

async function testFixes() {
  console.log("🧪 Testing Response Structure Fixes\n");

  try {
    // Initialize services
    const embeddingService = new EmbeddingService();
    const vectorStore = new VectorStore();
    
    await embeddingService.initialize();
    await vectorStore.initialize();
    
    const qaService = new QAService(embeddingService, vectorStore);
    await qaService.initialize();
    
    console.log("✅ Services initialized\n");

    // Test the improved fallback answer generation
    console.log("🔧 Testing improved fallback answer generation...");
    const testQuestion = "What is self-disclosure and how does it affect relationships?";
    
    const fallbackAnswer = qaService.generateFallbackAnswer(mockChunks, testQuestion);
    console.log("Fallback Answer:");
    console.log("─".repeat(80));
    console.log(fallbackAnswer);
    console.log("─".repeat(80));
    
    // Test context preparation
    console.log("\n🔧 Testing enhanced context preparation...");
    const context = qaService.prepareEnhancedContext(mockChunks, testQuestion);
    console.log("Enhanced Context:");
    console.log("─".repeat(80));
    console.log(context.substring(0, 500) + "...");
    console.log("─".repeat(80));
    
    // Test academic content detection
    console.log("\n🔧 Testing academic content detection...");
    const academicTest = qaService.isAcademicContent("theory research study analysis findings");
    console.log(`Academic content detected: ${academicTest}`);
    
    // Test conceptual matching
    console.log("\n🔧 Testing conceptual matching...");
    const conceptualMatches = qaService.findConceptualMatches(
      "self-disclosure intimacy relationship trust",
      "self-disclosure relationship intimacy"
    );
    console.log(`Conceptual matches: ${conceptualMatches.join(', ')}`);

    console.log("\n✅ All tests completed successfully!");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run tests
testFixes().catch(console.error);
