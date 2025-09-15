#!/usr/bin/env node

import { config } from 'dotenv';
import LangChainManager from './src/services/langchain-manager.js';

// Load environment variables
config();

async function demoGemini() {
  console.log('🚀 Gemini AI RAG Pipeline Demo\n');
  console.log('================================\n');

  // Create LangChainManager for Gemini
  const geminiManager = new LangChainManager({
    provider: 'gemini',
    modelName: process.env.LLM_MODEL || 'gemini-1.5-flash',
    temperature: 0.3,
    maxTokens: 1000
  });

  try {
    console.log('🤖 Initializing Gemini AI...');
    await geminiManager.initialize();
    console.log('✅ Gemini initialized successfully!\n');

    // Sample RAG scenario: Retrieved chunks from ChromaDB
    const mockRetrievedChunks = [
      {
        content: "Machine learning is a subset of artificial intelligence that enables computers to learn from data without being explicitly programmed. It uses algorithms to identify patterns in data and make predictions.",
        similarity: 0.92,
        finalScore: 0.88,
        metadata: { documentName: "ai_basics.pdf", chunkIndex: 0 }
      },
      {
        content: "The benefits of machine learning include automation of complex tasks, improved decision-making through data analysis, and the ability to process large amounts of information quickly.",
        similarity: 0.89,
        finalScore: 0.85,
        metadata: { documentName: "ml_advantages.pdf", chunkIndex: 1 }
      },
      {
        content: "Common machine learning applications include image recognition, natural language processing, recommendation systems, and predictive analytics in various industries.",
        similarity: 0.85,
        finalScore: 0.82,
        metadata: { documentName: "ml_use_cases.pdf", chunkIndex: 2 }
      }
    ];

    const question = "What are the main benefits and applications of machine learning?";
    const questionAnalysis = {
      type: 'analysis',
      complexity: 'detailed',
      keywords: ['benefits', 'applications', 'machine', 'learning']
    };

    console.log(`❓ Question: ${question}\n`);
    console.log('📚 Retrieved Context:');
    mockRetrievedChunks.forEach((chunk, i) => {
      console.log(`   [${'⭐'.repeat(Math.floor(chunk.finalScore * 3))}${'●'.repeat(3 - Math.floor(chunk.finalScore * 3))}] Source ${i + 1}: ${chunk.content.substring(0, 80)}...`);
    });
    console.log('');

    console.log('🧠 Generating answer with Gemini AI...');
    const result = await geminiManager.generateAnswer(
      question,
      mockRetrievedChunks,
      questionAnalysis,
      [],
      { timeout: 20000 }
    );

    console.log('\n📝 Generated Answer:');
    console.log('─'.repeat(50));
    console.log(result.answer);
    console.log('─'.repeat(50));

    console.log(`\n📊 Answer Metadata:`);
    console.log(`   🤖 Model: ${result.model}`);
    console.log(`   🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   📚 Sources Used: ${result.metadata.contextChunks}`);
    console.log(`   ⏱️  Processing Time: ${result.metadata.attempt ? 'With retry' : 'Direct'}`);

    console.log('\n🎉 Gemini AI successfully integrated into your RAG pipeline!');
    console.log('💡 Your system now combines vector search precision with Gemini\'s reasoning capabilities.');

  } catch (error) {
    console.error('❌ Gemini demo failed:', error.message);

    if (error.message.includes('API_KEY')) {
      console.log('\n💡 To fix this:');
      console.log('   1. Get a Google AI API key from: https://makersuite.google.com/app/apikey');
      console.log('   2. Add to your .env file: GOOGLE_API_KEY=your_key_here');
      console.log('   3. Set LLM_PROVIDER=gemini in your .env file');
    }

    process.exit(1);
  }
}

console.log('🔥 Gemini AI Demo for RAG Pipeline');
console.log('===================================\n');

if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
  console.log('⚠️  GOOGLE_API_KEY or GEMINI_API_KEY not found in environment.');
  console.log('📝 To run this demo:');
  console.log('   1. Get a Google AI API key from https://makersuite.google.com/app/apikey');
  console.log('   2. Add GOOGLE_API_KEY=your_key to your .env file');
  console.log('   3. Run: node demo-gemini.js\n');
  process.exit(1);
}

demoGemini().catch(error => {
  console.error('💥 Demo failed:', error);
  process.exit(1);
});
