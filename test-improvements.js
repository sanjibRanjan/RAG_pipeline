#!/usr/bin/env node

/**
 * Test script to validate RAG system improvements
 * This script tests the enhanced QA service with academic content
 */

import { QAService } from './src/services/qa-service.js';
import { EmbeddingService } from './src/services/embedding-service.js';
import { VectorStore } from './src/services/vector-store.js';
import { DocumentProcessor } from './src/services/document-processor.js';

// Test data - Self-disclosure theory content
const testContent = `
Factors Affecting Attraction: Self-Disclosure:

• Self-disclosure refers to the information we choose to reveal about ourselves within a romantic relationship. The aim of self-disclosure is to increase the intimacy, understanding and empathy between two individuals. This is under the condition that the self-disclosure is reciprocal.

• Altman and Taylor have proposed the 'social penetration' theory, which suggests that the process of self-disclosure allows one person to penetrate deeper into the life of their partner, thus increasing intimacy and trust. However, it is important to be selective with what one chooses to disclose.

• The researchers have used an onion analogy to illustrate this. As the relationship progresses, more layers of the onion are removed, representing deeper and more meaningful information being disclosed. This is only likely to occur if the exchange of such information is reciprocal i.e. the other person showing empathy, understanding and revealing personal details about themselves. Such exchanges represents a stage in the relationship which is serious and characterised by trust.

• Revealing intimate details about oneself at the beginning of a relationship may be detrimental effects e.g. revealing 'too much information'. This demonstrates to the other person that at least one person in the relationship does not trust the other.

• Reis and Shaver (1988) suggest that there are two elements of the social penetration theory - depth and breadth. There is a positive correlation between the increasing quality and trust within a relationship, coinciding with increasing depth and breadth of revealed information.

• For example, high levels of breadth result in low levels of depth due to many topics being 'off limits', thus reducing the emotional impact and empathy shown by the other person. This is the kind of information we would disclose to strangers, colleagues etc.

• Therefore, the key to maintaining a developing and intimate relationship is a balance between depth and breadth, through the reciprocal self-disclosure of information from both parties.
`;

const testQuestions = [
  "What is self-disclosure and how does it affect relationships?",
  "Explain the social penetration theory and its onion analogy",
  "What are the two elements of social penetration theory?",
  "How does reciprocal self-disclosure impact intimacy?",
  "What happens when you reveal too much information too early?"
];

async function testImprovements() {
  console.log("🧪 Testing RAG System Improvements\n");

  try {
    // Initialize services
    console.log("🔧 Initializing services...");
    const embeddingService = new EmbeddingService();
    const vectorStore = new VectorStore();
    const documentProcessor = new DocumentProcessor();
    
    await embeddingService.initialize();
    await vectorStore.initialize();
    
    const qaService = new QAService(embeddingService, vectorStore);
    await qaService.initialize();
    
    console.log("✅ Services initialized successfully\n");

    // Process test document
    console.log("📄 Processing test document...");
    const processedDoc = await documentProcessor.processFile(
      '/tmp/test-self-disclosure.txt',
      'test-self-disclosure.txt',
      [],
      {}
    );

    // Create test file
    const fs = await import('fs');
    fs.writeFileSync('/tmp/test-self-disclosure.txt', testContent);

    // Add document to vector store
    console.log("📥 Adding document to vector store...");
    const documents = processedDoc.chunks.map(chunk => chunk.content);
    const embeddings = await embeddingService.generateEmbeddings(documents);
    const metadatas = processedDoc.chunks.map(chunk => ({
      ...chunk.metadata,
      documentName: 'test-self-disclosure.txt',
      uploadedAt: new Date().toISOString()
    }));
    const ids = processedDoc.chunks.map((_, index) => `test_chunk_${index}`);

    await vectorStore.addDocuments(documents, embeddings, metadatas, ids);
    console.log("✅ Document added to vector store\n");

    // Test questions
    console.log("❓ Testing questions...\n");
    
    for (let i = 0; i < testQuestions.length; i++) {
      const question = testQuestions[i];
      console.log(`Question ${i + 1}: ${question}`);
      console.log("─".repeat(80));
      
      try {
        const result = await qaService.answerQuestion(question);
        
        console.log(`Answer: ${result.answer}`);
        console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`Sources: ${result.sources.length}`);
        console.log(`Metadata: ${JSON.stringify(result.metadata, null, 2)}`);
        
      } catch (error) {
        console.error(`❌ Error answering question: ${error.message}`);
      }
      
      console.log("\n" + "=".repeat(80) + "\n");
    }

    // Test academic content detection
    console.log("🔍 Testing academic content detection...");
    const academicTest = qaService.isAcademicContent(testContent.toLowerCase());
    console.log(`Academic content detected: ${academicTest}`);

    // Test conceptual matching
    console.log("🧠 Testing conceptual matching...");
    const conceptualMatches = qaService.findConceptualMatches(
      testContent.toLowerCase(),
      "self-disclosure relationship intimacy"
    );
    console.log(`Conceptual matches found: ${conceptualMatches.join(', ')}`);

    console.log("\n✅ All tests completed successfully!");

  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run tests
testImprovements().catch(console.error);
