/**
 * Comprehensive test for tenant isolation in the RAG system
 * Tests the full workflow: document upload, storage, and retrieval with tenant isolation
 */

import { MongoClient } from 'mongodb';
import { VectorStore } from './src/services/vector-store.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'rag_pipeline';
const MONGODB_VECTOR_COLLECTION = process.env.MONGODB_VECTOR_COLLECTION || 'vector_documents';

// Mock tenant data
const tenantA = {
  id: 'user_123456789',
  type: 'user',
  userId: 'user_123456789',
  email: 'userA@example.com',
  name: 'User A'
};

const tenantB = {
  id: 'user_987654321',
  type: 'user',
  userId: 'user_987654321',
  email: 'userB@example.com',
  name: 'User B'
};

async function testTenantIsolation() {
  console.log('🧪 Starting comprehensive tenant isolation test...');

  const client = new MongoClient(MONGODB_URI);
  let vectorStore;

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    // Initialize vector store
    vectorStore = new VectorStore();
    await vectorStore.initialize();
    console.log('✅ Vector store initialized');

    // Test data for tenant A
    const textsA = [
      'This is a document about artificial intelligence and machine learning.',
      'Machine learning algorithms can be supervised or unsupervised.',
      'Deep learning uses neural networks with multiple layers.'
    ];

    // Test data for tenant B
    const textsB = [
      'This document discusses web development and JavaScript frameworks.',
      'React is a popular library for building user interfaces.',
      'Node.js allows JavaScript to run on the server side.'
    ];

    const embeddings = Array.from({ length: textsA.length }, () =>
      Array.from({ length: 384 }, () => Math.random())
    );

    const metadatasA = textsA.map((_, index) => ({
      documentName: `test_doc_A_${index + 1}.txt`,
      chunkIndex: index,
      totalChunks: textsA.length
    }));

    const metadatasB = textsB.map((_, index) => ({
      documentName: `test_doc_B_${index + 1}.txt`,
      chunkIndex: index,
      totalChunks: textsB.length
    }));

    const idsA = textsA.map((_, index) => `test_A_${Date.now()}_${index}`);
    const idsB = textsB.map((_, index) => `test_B_${Date.now()}_${index}`);

    console.log('\n📤 Adding documents for Tenant A...');
    await vectorStore.addDocumentsByTenant(textsA, embeddings, metadatasA, idsA, tenantA);

    console.log('📤 Adding documents for Tenant B...');
    await vectorStore.addDocumentsByTenant(textsB, embeddings, metadatasB, idsB, tenantB);

    // Verify documents were stored with correct tenant information
    const db = client.db(MONGODB_DATABASE);
    const collection = db.collection(MONGODB_VECTOR_COLLECTION);

    console.log('\n🔍 Verifying tenant information in stored documents...');

    const docsA = await collection.find({ tenantId: tenantA.id }).toArray();
    const docsB = await collection.find({ tenantId: tenantB.id }).toArray();

    console.log(`📊 Tenant A documents: ${docsA.length} (expected: ${textsA.length})`);
    console.log(`📊 Tenant B documents: ${docsB.length} (expected: ${textsB.length})`);

    if (docsA.length !== textsA.length || docsB.length !== textsB.length) {
      throw new Error('Document storage verification failed');
    }

    // Test tenant-specific search
    console.log('\n🔍 Testing tenant-specific search...');

    const testEmbedding = Array.from({ length: 384 }, () => Math.random());

    const resultsA = await vectorStore.searchByTenant(testEmbedding, 10, tenantA);
    const resultsB = await vectorStore.searchByTenant(testEmbedding, 10, tenantB);

    console.log(`🔍 Tenant A search results: ${resultsA.documents[0]?.length || 0} documents`);
    console.log(`🔍 Tenant B search results: ${resultsB.documents[0]?.length || 0} documents`);

    // Verify that each tenant only sees their own documents
    const tenantAContent = resultsA.documents[0]?.join(' ') || '';
    const tenantBContent = resultsB.documents[0]?.join(' ') || '';

    const hasTenantAContent = tenantAContent.includes('artificial intelligence') ||
                             tenantAContent.includes('machine learning') ||
                             tenantAContent.includes('neural networks');

    const hasTenantBContent = tenantBContent.includes('web development') ||
                             tenantBContent.includes('JavaScript') ||
                             tenantBContent.includes('React');

    console.log(`✅ Tenant A sees their content: ${hasTenantAContent}`);
    console.log(`✅ Tenant B sees their content: ${hasTenantBContent}`);

    // Check for cross-contamination (tenant A should not see tenant B's content and vice versa)
    const crossContaminationA = tenantAContent.includes('web development') ||
                               tenantAContent.includes('JavaScript') ||
                               tenantAContent.includes('React');

    const crossContaminationB = tenantBContent.includes('artificial intelligence') ||
                               tenantBContent.includes('machine learning') ||
                               tenantBContent.includes('neural networks');

    console.log(`❌ Tenant A sees Tenant B's content: ${crossContaminationA}`);
    console.log(`❌ Tenant B sees Tenant A's content: ${crossContaminationB}`);

    if (crossContaminationA || crossContaminationB) {
      throw new Error('Cross-contamination detected - tenant isolation is not working');
    }

    console.log('\n🎉 Tenant isolation test PASSED!');

    // Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    await collection.deleteMany({ tenantId: { $in: [tenantA.id, tenantB.id] } });
    console.log('✅ Test data cleaned up');

  } catch (error) {
    console.error('❌ Tenant isolation test FAILED:', error);
    throw error;
  } finally {
    if (vectorStore) {
      await vectorStore.close();
    }
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testTenantIsolation().catch(console.error);
