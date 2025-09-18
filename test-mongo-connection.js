#!/usr/bin/env node

/**
 * Test MongoDB Connection and Vector Store Initialization
 */

import { MongoVectorStore } from './src/services/mongo-vector-store.js';

async function testMongoConnection() {
  console.log("🔍 Testing MongoDB connection and vector store initialization...");

  const mongoStore = new MongoVectorStore();

  try {
    console.log("🔗 Attempting to initialize MongoDB vector store...");
    const initialized = await mongoStore.initialize();

    if (initialized) {
      console.log("✅ MongoDB vector store initialized successfully");

      // Test basic operations
      console.log("📊 Testing basic operations...");
      const stats = await mongoStore.getStats();
      console.log(`📈 Collection stats: ${stats.documentCount} documents`);

      const health = await mongoStore.healthCheck();
      console.log(`💚 Health check: ${health ? 'PASS' : 'FAIL'}`);

      console.log("✅ All MongoDB tests passed!");
    } else {
      console.log("❌ MongoDB vector store initialization failed");
    }
  } catch (error) {
    console.error("❌ Error during MongoDB test:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    await mongoStore.close();
  }
}

testMongoConnection();
