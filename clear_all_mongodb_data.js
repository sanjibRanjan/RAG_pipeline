/**
 * Script to clear ALL data from MongoDB database
 * This completely wipes the database clean for a fresh start
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'rag_pipeline';

async function clearAllMongoDBData() {
  console.log('🗑️ Clearing ALL data from MongoDB database...');
  console.log(`📍 Database: ${MONGODB_DATABASE}`);
  console.log(`🔗 Connection: ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`);

  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable not found');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(MONGODB_DATABASE);

    // Get all collections
    const collections = await db.collections();
    console.log(`📊 Found ${collections.length} collections:`);

    let totalDocumentsDeleted = 0;

    // Clear each collection
    for (const collection of collections) {
      const collectionName = collection.collectionName;
      const countBefore = await collection.countDocuments();

      console.log(`  📁 ${collectionName}: ${countBefore} documents`);

      if (countBefore > 0) {
        const result = await collection.deleteMany({});
        console.log(`    ✅ Deleted ${result.deletedCount} documents from ${collectionName}`);
        totalDocumentsDeleted += result.deletedCount;
      } else {
        console.log(`    ℹ️ Collection ${collectionName} is already empty`);
      }
    }

    console.log(`\n🎯 Total documents deleted: ${totalDocumentsDeleted}`);

    // Final verification - check all collections are empty
    console.log('\n🔍 Verification - checking all collections:');
    const collectionsAfter = await db.collections();
    let allEmpty = true;

    for (const collection of collectionsAfter) {
      const countAfter = await collection.countDocuments();
      console.log(`  📁 ${collection.collectionName}: ${countAfter} documents`);

      if (countAfter > 0) {
        allEmpty = false;
        console.warn(`⚠️  WARNING: ${collection.collectionName} still has ${countAfter} documents!`);
      }
    }

    if (allEmpty) {
      console.log('\n🎉 SUCCESS: All collections are now empty!');
      console.log('🚀 Database is ready for fresh data');
    } else {
      console.log('\n⚠️  WARNING: Some collections may still contain data');
    }

  } catch (error) {
    console.error('❌ Failed to clear MongoDB data:', error);
    throw error;
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
clearAllMongoDBData().catch(console.error);
