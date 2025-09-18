#!/usr/bin/env node

/**
 * Test script to reproduce the web vulnerabilities RAG response truncation issue
 */

import fs from 'fs';
import path from 'path';
import { DocumentProcessor } from './src/services/document-processor.js';
import { EmbeddingService } from './src/services/embedding-service.js';
import { DocumentStore } from './src/services/document-store.js';
import { QAService } from './src/services/qa-service.js';
import { VectorStore } from './src/services/vector-store.js';

const WEB_VULNERABILITIES_CONTENT = `Web vulnerabilities are weaknesses or flaws in a web application's design,
implementation, or configuration that can be exploited by attackers to
compromise the security of the application or the data it processes.
Understanding common web vulnerabilities is crucial for developers to build
secure web applications and protect sensitive data from unauthorized access or
manipulation.
COMMON WEB VULNERABILITIES
Common web vulnerabilities encompass a variety of
threats:
Injection attacks
Cross-Site Scripting (XSS) attacks
Cross-Site Request Forgery (CSRF) attacks
Security misconfigurations
Broken authentication
Insecure deserialization vulnerabilities

INJECTION ATTACKS
Injection attacks occur when an attacker sends malicious data as part of a command or query to exploit vulnerabilities in an application's input validation mechanisms. The most common type is SQL injection, where malicious SQL statements are inserted into a query. This can lead to unauthorized data access, modification, or deletion.

CROSS-SITE SCRIPTING (XSS) ATTACKS
XSS attacks happen when an attacker injects malicious scripts into web pages viewed by other users. These scripts can steal cookies, session tokens, or other sensitive information. XSS attacks are particularly dangerous because they can spread from user to user.

CROSS-SITE REQUEST FORGERY (CSRF) ATTACKS
CSRF attacks trick a user into performing unwanted actions on a web application where they're authenticated. This is done by forging HTTP requests that appear to come from the legitimate user. CSRF attacks can result in account takeovers, data theft, and unauthorized transactions.

SECURITY MISCONFIGURATIONS
Security misconfigurations occur when security settings are not properly implemented or are left at their default values. This can include exposed databases, unnecessary services running, or misconfigured cloud storage permissions. Misconfigurations are among the most common vulnerabilities found in web applications.

BROKEN AUTHENTICATION
Broken authentication vulnerabilities allow attackers to compromise passwords, session tokens, or exploit other authentication flaws. This can lead to unauthorized access to user accounts and sensitive data. Common issues include weak password policies and improper session management.

INSECURE DESERIALIZATION VULNERABILITIES
Insecure deserialization occurs when untrusted data is used to abuse the logic of an application, forge objects, or execute arbitrary code. This vulnerability can lead to remote code execution, privilege escalation, and other serious security issues.

PREVENTION MEASURES
To prevent these vulnerabilities, developers should:
1. Implement proper input validation and sanitization
2. Use parameterized queries for database operations
3. Implement Content Security Policy (CSP) headers
4. Use secure session management practices
5. Regularly update and patch applications
6. Conduct security code reviews and testing`;

async function testWebVulnerabilities() {
  console.log("🔬 Testing Web Vulnerabilities RAG Response Truncation");
  console.log("=" .repeat(60));

  try {
    // Initialize services
    console.log("\n🎯 Step 1: Initializing Services");

    const documentProcessor = new DocumentProcessor();
    console.log("✅ DocumentProcessor initialized");

    const embeddingService = new EmbeddingService();
    await embeddingService.initialize();
    console.log("✅ EmbeddingService initialized");

    const vectorStore = new VectorStore();
    await vectorStore.initialize();
    console.log("✅ VectorStore initialized");

    const documentStore = new DocumentStore();
    console.log("✅ DocumentStore initialized");

    const qaService = new QAService(embeddingService, vectorStore, documentStore);
    await qaService.initialize();
    console.log("✅ QAService initialized");

    // Process the web vulnerabilities content
    console.log("\n📥 Step 2: Processing Web Vulnerabilities Content");

    const tempFile = 'temp_web_vulnerabilities.txt';
    fs.writeFileSync(tempFile, WEB_VULNERABILITIES_CONTENT);

    console.log("📄 Processing content...");
    const processedDoc = await documentProcessor.processFile(tempFile, 'web_vulnerabilities.txt', [], {});

    console.log(`✅ Content processed: ${processedDoc.chunks.length} child chunks, ${processedDoc.parentChunks.length} parent chunks`);

    // Generate embeddings
    console.log("🤖 Generating embeddings...");
    const childChunkTexts = processedDoc.chunks.map(chunk => chunk.content);
    const embeddings = await embeddingService.generateEmbeddings(childChunkTexts);
    console.log(`✅ Generated ${embeddings.length} embeddings`);

    // Store in vector store
    console.log("🗄️ Storing in vector store...");
    const metadatas = processedDoc.chunks.map(chunk => ({
      ...chunk.metadata,
      documentName: 'web_vulnerabilities.txt',
      uploadedAt: new Date().toISOString()
    }));
    const ids = processedDoc.chunks.map(chunk => chunk.id);

    await vectorStore.addDocuments(childChunkTexts, embeddings, metadatas, ids);
    console.log("✅ Documents stored in vector store");

    // Store parent chunks
    console.log("📦 Storing parent chunks...");
    const parentChunkResults = documentStore.storeParentChunksBatch(
      processedDoc.parentChunks.map(chunk => ({
        id: chunk.id,
        chunk: chunk
      }))
    );
    console.log(`✅ Parent chunks stored: ${parentChunkResults.successful}/${parentChunkResults.total} successful`);

    // Clean up temp file
    fs.unlinkSync(tempFile);

    // Test questions that should trigger the truncation issue
    console.log("\n❓ Step 3: Testing Questions That Should Show Truncation");

    const testQuestions = [
      "What are common web vulnerabilities?",
      "Explain injection attacks in detail",
      "What are the different types of web vulnerabilities?",
      "How can developers prevent web vulnerabilities?"
    ];

    for (const question of testQuestions) {
      console.log(`\n🔍 Question: "${question}"`);
      console.log("-".repeat(50));

      const startTime = Date.now();
      const answer = await qaService.answerQuestion(question);
      const endTime = Date.now();

      console.log(`📋 Answer: ${answer.answer}`);
      console.log(`📊 Confidence: ${(answer.confidence * 100).toFixed(1)}%`);
      console.log(`⏱️ Response time: ${endTime - startTime}ms`);
      console.log(`📚 Sources: ${answer.sources.length} chunks`);

      // Check for truncation indicators
      if (answer.answer.includes('...') || answer.answer.length < 200) {
        console.log("⚠️ POTENTIAL TRUNCATION DETECTED!");
        console.log(`   - Answer length: ${answer.answer.length} characters`);
        console.log(`   - Contains ellipsis: ${answer.answer.includes('...')}`);
      }

      if (answer.metadata) {
        console.log("📊 Metadata:");
        console.log(`   - Total context length: ${answer.metadata.totalContextLength || 'N/A'}`);
        console.log(`   - Context chunks used: ${answer.metadata.contextChunks || 'N/A'}`);
        console.log(`   - Retrieval method: ${answer.metadata.retrievalMethod || 'N/A'}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 Web Vulnerabilities Test Completed");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Test failed:", error);
    console.error("Error details:", error.message);
    console.error(error.stack);
  }
}

// Run the test
testWebVulnerabilities();
