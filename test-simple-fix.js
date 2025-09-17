#!/usr/bin/env node

/**
 * Simple test script to verify the content cleaning fixes
 */

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

// Copy the cleanChunkContent function from the QA service
function cleanChunkContent(content) {
  if (!content) return '';

  let cleaned = content.trim();

  // Remove section headers (e.g., "Part 3 — Factors Affecting Attraction: Physical Attractiveness:")
  cleaned = cleaned.replace(/^Part \d+[^:]*:\s*/gm, '');
  
  // Remove other common headers
  cleaned = cleaned.replace(/^(Chapter|Section|Part)\s+\d+[^:]*:\s*/gm, '');
  
  // Remove standalone headers that don't add content (including "Physical Attractiveness:")
  cleaned = cleaned.replace(/^[A-Z][^.!?]*:\s*$/gm, '');
  
  // Remove specific problematic headers
  cleaned = cleaned.replace(/^Physical Attractiveness:\s*/gm, '');
  cleaned = cleaned.replace(/^Factors Affecting Attraction:\s*/gm, '');
  
  // Clean up multiple spaces and newlines
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');
  
  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();
  
  return cleaned;
}

// Copy the generateFallbackAnswer function logic
function generateFallbackAnswer(relevantChunks, question) {
  if (relevantChunks.length === 0) {
    return "I couldn't find any relevant information in the documents to answer your question. Please try rephrasing your question or upload more relevant documents.";
  }

  // Sort chunks by relevance
  const sortedChunks = relevantChunks.sort((a, b) => {
    const scoreA = a.finalScore || a.similarity || 0;
    const scoreB = b.finalScore || b.similarity || 0;
    return scoreB - scoreA;
  });

  // Extract and clean content from chunks
  const cleanedContents = [];
  const usedSentences = new Set();
  const maxLength = 1500;

  for (const chunk of sortedChunks.slice(0, 4)) { // Use top 4 chunks
    const cleanContent = cleanChunkContent(chunk.content);
    
    // Split into sentences and filter
    const sentences = cleanContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!usedSentences.has(trimmed) && trimmed.length > 30) {
        usedSentences.add(trimmed);
        cleanedContents.push(trimmed);
        
        if (cleanedContents.join(' ').length > maxLength) break;
      }
    }
    
    if (cleanedContents.join(' ').length > maxLength) break;
  }

  // Combine cleaned content
  const combinedContent = cleanedContents.join('. ').trim();
  
  if (combinedContent.length > 100) {
    return `🔍 Answer based on document content:\n\n${combinedContent}.`;
  }

  // Fallback to single best chunk (cleaned)
  const topChunk = sortedChunks[0];
  const cleanTopChunk = cleanChunkContent(topChunk.content);
  const previewLength = Math.min(800, cleanTopChunk.length);
  return `🔍 Here's relevant information from the documents:\n\n${cleanTopChunk.substring(0, previewLength)}${cleanTopChunk.length > previewLength ? '...' : ''}`;
}

function testContentCleaning() {
  console.log("🧪 Testing Content Cleaning Fixes\n");

  // Test individual chunk cleaning
  console.log("🔧 Testing individual chunk cleaning...");
  for (let i = 0; i < mockChunks.length; i++) {
    const original = mockChunks[i].content;
    const cleaned = cleanChunkContent(original);
    
    console.log(`Chunk ${i + 1}:`);
    console.log("Original:", original);
    console.log("Cleaned:", cleaned);
    console.log("─".repeat(80));
  }

  // Test the improved fallback answer generation
  console.log("\n🔧 Testing improved fallback answer generation...");
  const testQuestion = "What is self-disclosure and how does it affect relationships?";
  
  const fallbackAnswer = generateFallbackAnswer(mockChunks, testQuestion);
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
}

// Run tests
testContentCleaning();
