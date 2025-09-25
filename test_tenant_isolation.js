/**
 * Test script to verify tenant isolation in the RAG system
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'rag_pipeline';
const MONGODB_VECTOR_COLLECTION = process.env.MONGODB_VECTOR_COLLECTION || 'vector_documents';

async function testTenantIsolation() {
  console.log('🔍 Testing tenant isolation in MongoDB...');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(MONGODB_DATABASE);
    const collection = db.collection(MONGODB_VECTOR_COLLECTION);

    // Get sample of documents to check tenant information
    const sampleDocs = await collection.find({}).limit(10).toArray();

    console.log(`📊 Found ${sampleDocs.length} sample documents`);
    console.log('\n🔍 Tenant information in documents:');

    const tenantStats = {};

    sampleDocs.forEach((doc, index) => {
      const tenantId = doc.tenantId || 'NO_TENANT_ID';
      const tenantType = doc.tenantType || 'NO_TENANT_TYPE';

      if (!tenantStats[tenantId]) {
        tenantStats[tenantId] = { count: 0, type: tenantType };
      }
      tenantStats[tenantId].count++;

      console.log(`  Document ${index + 1}:`);
      console.log(`    ID: ${doc._id}`);
      console.log(`    Tenant ID: ${tenantId}`);
      console.log(`    Tenant Type: ${tenantType}`);
      console.log(`    User ID: ${doc.metadata?.userId || 'N/A'}`);
      console.log(`    Email: ${doc.metadata?.email || 'N/A'}`);
      console.log(`    Content preview: ${doc.content?.substring(0, 100)}...`);
      console.log('');
    });

    console.log('📈 Tenant distribution:');
    Object.entries(tenantStats).forEach(([tenantId, stats]) => {
      console.log(`  ${tenantId} (${stats.type}): ${stats.count} documents`);
    });

    // Test tenant-specific queries
    console.log('\n🔍 Testing tenant-specific queries...');

    for (const [tenantId, stats] of Object.entries(tenantStats)) {
      if (tenantId !== 'NO_TENANT_ID') {
        const tenantDocs = await collection.find({ tenantId }).limit(5).toArray();
        console.log(`  Tenant ${tenantId}: Found ${tenantDocs.length} documents`);
      }
    }

    // Check total document count
    const totalDocs = await collection.countDocuments();
    console.log(`\n📊 Total documents in collection: ${totalDocs}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testTenantIsolation().catch(console.error);
