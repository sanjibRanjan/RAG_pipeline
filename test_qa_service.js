import { QAService } from './src/services/qa-service.js';
import { EmbeddingService } from './src/services/embedding-service.js';
import { VectorStore } from './src/services/vector-store.js';
import 'dotenv/config';

async function testQAService() {
  console.log('🔍 Testing QA Service...');

  try {
    // Initialize services
    const embeddingService = new EmbeddingService();
    const vectorStore = new VectorStore();
    const qaService = new QAService(embeddingService, vectorStore);

    console.log('🔧 Initializing services...');
    await embeddingService.initialize();
    await vectorStore.initialize();
    await qaService.initialize();

    console.log('✅ Services initialized');

    // Test multiple questions including acronym
    const questions = [
      "What is machine learning?",
      "what is CA",
      "what is conversation analysis"
    ];

    for (const question of questions) {
      console.log(`\n🤔 Testing question: "${question}"`);

      const result = await qaService.answerQuestion(question);
      console.log('✅ Answer generated successfully');
      console.log('Answer:', result.answer.substring(0, 200) + (result.answer.length > 200 ? '...' : ''));
      console.log('Sources:', result.sources.length);
      console.log('Confidence:', (result.confidence * 100).toFixed(1) + '%');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  }
}

testQAService();
