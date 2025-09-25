/**
 * Script to clear all documents from the vector store
 * This removes documents without tenant information so the system can start fresh with tenant isolation
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'rag_pipeline';
const MONGODB_VECTOR_COLLECTION = process.env.MONGODB_VECTOR_COLLECTION || 'vector_documents';

async function clearAllDocuments() {
  console.log('🗑️ Clearing all documents from MongoDB vector store...');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(MONGODB_DATABASE);
    const collection = db.collection(MONGODB_VECTOR_COLLECTION);

    // Get count before deletion
    const countBefore = await collection.countDocuments();
    console.log(`📊 Found ${countBefore} documents before deletion`);

    // Delete all documents
    const result = await collection.deleteMany({});

    console.log(`✅ Deleted ${result.deletedCount} documents`);
    console.log('🧹 Database cleared successfully');

    // Verify collection is empty
    const countAfter = await collection.countDocuments();
    console.log(`📊 Documents remaining: ${countAfter}`);

    if (countAfter === 0) {
      console.log('🎉 Vector store is now clean and ready for tenant-isolated documents');
    } else {
      console.warn('⚠️ Some documents may still remain');
    }

  } catch (error) {
    console.error('❌ Failed to clear documents:', error);
    throw error;
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
clearAllDocuments().catch(console.error);
