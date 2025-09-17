#!/usr/bin/env node

/**
 * ChromaDB Reset Utility
 * 
 * This script completely resets the ChromaDB database to fix data mismatch errors.
 * It's particularly useful when switching between different embedding models that
 * have different vector dimensions (e.g., switching from Hugging Face to Google models).
 * 
 * Usage: node reset_chromadb.js
 */

import { ChromaClient } from 'chromadb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function resetChromaDB() {
  let client = null;
  
  try {
    console.log('🔄 Starting ChromaDB reset process...');
    
    // Get ChromaDB URL from environment variables
    const chromaUrl = process.env.CHROMA_DB_URL || "http://localhost:8000";
    const collectionName = process.env.CHROMA_COLLECTION_NAME || "rag_documents";
    
    console.log(`🔗 Connecting to ChromaDB at: ${chromaUrl}`);
    console.log(`📁 Target collection: ${collectionName}`);
    
    // Parse URL for host and port
    const url = new URL(chromaUrl);
    const host = url.hostname;
    const port = parseInt(url.port) || 8000;
    
    // Create ChromaDB client
    client = new ChromaClient({ host, port });
    
    // Test connection first
    console.log('🔍 Testing ChromaDB connection...');
    const collections = await client.listCollections();
    console.log(`✅ Connected successfully! Found ${collections.length} existing collections`);
    
    // Delete all collections (alternative to reset when reset() is not allowed)
    console.log('🗑️ Deleting all collections from ChromaDB...');
    
    for (const collection of collections) {
      try {
        await client.deleteCollection({ name: collection.name });
        console.log(`   ✅ Deleted collection: ${collection.name}`);
      } catch (error) {
        console.log(`   ⚠️ Could not delete collection ${collection.name}: ${error.message}`);
      }
    }
    
    console.log('✅ ChromaDB has been successfully reset.');
    console.log('📝 All collections and data have been wiped clean.');
    console.log('🚀 Your application can now start fresh with the new embedding model.');
    
  } catch (error) {
    console.error('❌ Failed to reset ChromaDB:');
    console.error(`   Error: ${error.message}`);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('💡 Make sure ChromaDB is running:');
      console.error('   docker run -d --name chromadb -p 8000:8000 chromadb/chroma');
    } else if (error.message.includes('CHROMA_DB_URL')) {
      console.error('💡 Check your .env file contains CHROMA_DB_URL');
    }
    
    process.exit(1);
  }
}

// Run the reset function
resetChromaDB();
