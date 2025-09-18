#!/usr/bin/env node

/**
 * MongoDB Data Import Script
 *
 * Imports data from ChromaDB export JSON into MongoDB for migration
 * This script is part of the gradual migration strategy from ChromaDB to MongoDB
 *
 * Usage:
 *   node import-mongodb-data.js --input <export-file> [--collection <name>] [--batch-size <number>]
 *
 * @author RAG Pipeline Team
 * @version 1.0.0
 */

import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Import data from JSON export into MongoDB
 */
async function importMongoDBData() {
  let client = null;

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const options = parseArguments(args);

    const inputFile = options.input;
    const collectionName = options.collection || process.env.MONGODB_VECTOR_COLLECTION || "vector_documents";
    const batchSize = options.batchSize || 100;
    const dryRun = options.dryRun || false;

    if (!inputFile) {
      console.error("❌ Input file is required. Use --input <file>");
      showHelp();
      process.exit(1);
    }

    console.log("🚀 Starting MongoDB data import...");
    console.log(`📊 Configuration:`);
    console.log(`   - Input file: ${inputFile}`);
    console.log(`   - Collection: ${collectionName}`);
    console.log(`   - Batch size: ${batchSize}`);
    console.log(`   - Dry run: ${dryRun}`);

    // Validate input file exists
    if (!fs.existsSync(inputFile)) {
      throw new Error(`Input file not found: ${inputFile}`);
    }

    // Read and parse export file
    console.log("📖 Reading export file...");
    const exportData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    console.log(`✅ Loaded ${exportData.documents?.length || 0} documents from export file`);
    console.log(`📅 Export created: ${exportData.metadata?.exportTimestamp}`);
    console.log(`🔍 Source: ${exportData.metadata?.source} (${exportData.metadata?.collectionName})`);

    if (!exportData.documents || exportData.documents.length === 0) {
      console.log("⚠️ No documents found in export file. Nothing to import.");
      return;
    }

    // Initialize MongoDB client
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/rag_pipeline";
    const databaseName = process.env.MONGODB_DATABASE || "rag_pipeline";

    console.log(`🔗 Connecting to MongoDB at: ${mongoUri}`);

    client = new MongoClient(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    const db = client.db(databaseName);
    const collection = db.collection(collectionName);

    if (dryRun) {
      console.log("🔍 DRY RUN MODE - No data will be inserted");
    } else {
      // Create indexes for optimal performance
      console.log("📊 Creating MongoDB indexes...");
      await createIndexes(collection);
    }

    // Transform and prepare documents for MongoDB
    console.log("🔄 Transforming documents for MongoDB...");
    const mongoDocuments = transformDocumentsForMongoDB(exportData.documents);

    console.log(`✅ Prepared ${mongoDocuments.length} documents for import`);

    if (dryRun) {
      // In dry run mode, just show statistics
      const stats = generateImportStatistics(mongoDocuments);
      console.log("\n📊 Import Preview (DRY RUN):");
      console.log(`   - Documents to import: ${stats.totalDocuments}`);
      console.log(`   - Total embeddings: ${stats.totalEmbeddings}`);
      console.log(`   - File types: ${Object.entries(stats.fileTypes).map(([type, count]) => `${type}: ${count}`).join(', ')}`);
      console.log(`   - Chunk types: ${Object.entries(stats.chunkTypes).map(([type, count]) => `${type}: ${count}`).join(', ')}`);
      console.log("\n✅ Dry run completed - no data was imported");
      return;
    }

    // Import documents in batches
    console.log(`📥 Importing ${mongoDocuments.length} documents in batches of ${batchSize}...`);

    let totalInserted = 0;
    let totalErrors = 0;
    const errors = [];

    for (let i = 0; i < mongoDocuments.length; i += batchSize) {
      const batch = mongoDocuments.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(mongoDocuments.length / batchSize);

      try {
        const result = await collection.insertMany(batch, { ordered: false });
        totalInserted += result.insertedCount;

        console.log(`📦 Batch ${batchNumber}/${totalBatches}: Inserted ${result.insertedCount}/${batch.length} documents`);

        if (result.insertedCount < batch.length) {
          const failed = batch.length - result.insertedCount;
          totalErrors += failed;
          errors.push(`Batch ${batchNumber}: ${failed} documents failed to insert`);
        }

      } catch (batchError) {
        console.error(`❌ Batch ${batchNumber} failed:`, batchError.message);
        totalErrors += batch.length;
        errors.push(`Batch ${batchNumber}: ${batchError.message}`);
      }
    }

    // Generate final statistics
    const finalStats = await generateFinalStatistics(collection);

    console.log("\n📊 Import Results:");
    console.log(`   - Documents processed: ${mongoDocuments.length}`);
    console.log(`   - Successfully inserted: ${totalInserted}`);
    console.log(`   - Errors: ${totalErrors}`);
    console.log(`   - Final collection count: ${finalStats.totalDocuments}`);
    console.log(`   - Collection size: ${finalStats.collectionSizeMB.toFixed(2)} MB`);

    if (errors.length > 0) {
      console.log("\n⚠️ Import Errors:");
      errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }

    console.log("\n✅ MongoDB data import completed!");
    console.log(`📊 Final collection statistics: ${finalStats.totalDocuments} documents`);

    if (totalErrors === 0) {
      console.log("\n🎉 Migration successful! All data imported without errors.");
    } else {
      console.log(`\n⚠️ Migration completed with ${totalErrors} errors. Review the error messages above.`);
    }

  } catch (error) {
    console.error("❌ Import failed:", error.message);
    console.error("\n🔍 Troubleshooting:");
    console.error("- Make sure MongoDB is running");
    console.error("- Check MONGODB_URI environment variable");
    console.error("- Verify input file exists and is valid JSON");
    console.error("- Check MongoDB connection permissions");
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log("🔌 MongoDB connection closed");
    }
  }
}

/**
 * Parse command line arguments
 */
function parseArguments(args) {
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--input' && i + 1 < args.length) {
      options.input = args[i + 1];
      i++;
    } else if (arg === '--collection' && i + 1 < args.length) {
      options.collection = args[i + 1];
      i++;
    } else if (arg === '--batch-size' && i + 1 < args.length) {
      options.batchSize = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }

  return options;
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
MongoDB Data Import Script

Usage:
  node import-mongodb-data.js --input <export-file> [options]

Required Options:
  --input <file>        Path to the ChromaDB export JSON file

Optional Options:
  --collection <name>   MongoDB collection name (default: from env or 'vector_documents')
  --batch-size <number> Batch size for bulk inserts (default: 100)
  --dry-run            Preview import without actually inserting data
  --help, -h           Show this help message

Environment Variables:
  MONGODB_URI                MongoDB connection URI (default: mongodb://localhost:27017/rag_pipeline)
  MONGODB_DATABASE          Database name (default: rag_pipeline)
  MONGODB_VECTOR_COLLECTION Collection name (default: vector_documents)

Examples:
  node import-mongodb-data.js --input data/processed/chromadb_export_123456.json
  node import-mongodb-data.js --input export.json --collection my_vectors --batch-size 50
  node import-mongodb-data.js --input export.json --dry-run
`);
}

/**
 * Create necessary indexes for optimal performance
 */
async function createIndexes(collection) {
  try {
    console.log("📊 Creating MongoDB indexes...");

    // Index for document queries by ID
    await collection.createIndex({ documentId: 1 });

    // Index for metadata filtering
    await collection.createIndex({ "metadata.source": 1 });
    await collection.createIndex({ "metadata.fileType": 1 });
    await collection.createIndex({ "metadata.version": 1 });
    await collection.createIndex({ "metadata.documentName": 1 });
    await collection.createIndex({ "metadata.chunkType": 1 });
    await collection.createIndex({ "metadata.chunkIndex": 1 });

    // Compound index for document name and version
    await collection.createIndex({ "metadata.documentName": 1, "metadata.version": 1 });

    // Index for date-based queries
    await collection.createIndex({ "metadata.uploadedAt": 1 });
    await collection.createIndex({ createdAt: 1 });

    console.log("✅ MongoDB indexes created successfully");
  } catch (error) {
    console.warn("⚠️ Some indexes may not have been created:", error.message);
  }
}

/**
 * Transform ChromaDB export documents to MongoDB format
 */
function transformDocumentsForMongoDB(chromaDocuments) {
  return chromaDocuments.map((doc, index) => {
    const metadata = doc.metadata || {};
    const documentName = metadata.documentName || metadata.source || 'unknown';

    return {
      _id: doc.originalId,
      documentId: doc.originalId.split('_chunk_')[0] || doc.originalId,
      chunkId: doc.originalId,
      content: doc.content,
      embedding: doc.embedding,
      metadata: {
        ...metadata,
        // Ensure consistent field names
        source: metadata.source || metadata.documentName || documentName,
        documentName: documentName,
        chunkIndex: metadata.chunkIndex || metadata.chunk_id || index,
        chunkType: metadata.chunkType || metadata.chunk_type || 'basic',
        version: metadata.version || metadata.document_version || 1,
        fileSize: metadata.fileSize || 0,
        fileType: metadata.fileType || 'unknown',
        uploadedAt: metadata.uploadedAt || metadata.ingestionTime || new Date().toISOString(),
        textLength: metadata.textLength || metadata.contentLength || (doc.content ? doc.content.length : 0)
      },
      // Migration metadata
      migrationInfo: {
        migratedAt: new Date().toISOString(),
        source: 'chromadb_export',
        originalId: doc.originalId,
        exportTimestamp: doc.exportInfo?.exportedAt
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });
}

/**
 * Generate statistics from documents to be imported
 */
function generateImportStatistics(documents) {
  const stats = {
    totalDocuments: documents.length,
    totalEmbeddings: 0,
    fileTypes: {},
    chunkTypes: {}
  };

  documents.forEach(doc => {
    // Count embeddings
    if (doc.embedding && Array.isArray(doc.embedding)) {
      stats.totalEmbeddings++;
    }

    // Count file types
    const fileType = doc.metadata.fileType || 'unknown';
    stats.fileTypes[fileType] = (stats.fileTypes[fileType] || 0) + 1;

    // Count chunk types
    const chunkType = doc.metadata.chunkType || 'basic';
    stats.chunkTypes[chunkType] = (stats.chunkTypes[chunkType] || 0) + 1;
  });

  return stats;
}

/**
 * Generate final statistics after import
 */
async function generateFinalStatistics(collection) {
  try {
    const stats = await collection.stats();

    return {
      totalDocuments: await collection.countDocuments(),
      collectionSizeMB: (stats.size || 0) / (1024 * 1024),
      indexesCount: stats.nindexes || 0
    };
  } catch (error) {
    console.warn("⚠️ Could not get final statistics:", error.message);
    return {
      totalDocuments: 0,
      collectionSizeMB: 0,
      indexesCount: 0
    };
  }
}

// Run the import if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  importMongoDBData();
}

export { importMongoDBData };
