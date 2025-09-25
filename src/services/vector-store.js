/**
 * Vector Store Service (MongoDB Implementation)
 *
 * MongoDB-based vector store implementation with the same interface as the previous ChromaDB version
 * Supports vector similarity search, metadata filtering, and document versioning
 *
 * @author RAG Pipeline Team
 * @version 1.0.0
 */

import { MongoClient } from 'mongodb';
import crypto from 'crypto';

export class VectorStore {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
    this.isInitialized = false;
    this.databaseName = null;
    this.collectionName = null;

    // Phase 1: Hierarchical chunking configuration (same as ChromaDB)
    this.ALLOWED_CHUNK_TYPES = ['child', 'basic'];
    this.REJECTED_CHUNK_TYPES = ['parent'];

    // Multi-tenancy configuration
    this.multiTenancyEnabled = process.env.ENABLE_MULTI_TENANCY === 'true';
    this.tenantIsolationLevel = process.env.TENANT_ISOLATION_LEVEL || 'user';
  }

  /**
   * Initialize the MongoDB vector store connection
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/rag_pipeline";
      this.databaseName = process.env.MONGODB_DATABASE || "rag_pipeline";
      this.collectionName = process.env.MONGODB_VECTOR_COLLECTION || "vector_documents";

      console.log(`🔗 Connecting to MongoDB at: ${mongoUri}`);

      // Create MongoDB client with performance optimizations
      this.client = new MongoClient(mongoUri, {
        maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 10,
        minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE) || 5,
        maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME) || 30000,
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        // Performance optimizations
        retryWrites: true,
        retryReads: true,
        readPreference: 'primaryPreferred',
        writeConcern: { w: 'majority', wtimeoutMS: 5000 }
      });

      // Performance configuration
      this.searchBatchSize = parseInt(process.env.VECTOR_SEARCH_BATCH_SIZE) || 50;
      this.maxDocumentsPerQuery = parseInt(process.env.MAX_DOCUMENTS_PER_QUERY) || 500; // Reduced for better performance
      this.similarityThreshold = parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.7;

      // Connect to MongoDB
      await this.client.connect();
      this.db = this.client.db(this.databaseName);

      // Get or create collection
      this.collection = this.db.collection(this.collectionName);

      // Create indexes for optimal performance
      await this.createIndexes();

      // Test connection
      const count = await this.collection.countDocuments();
      console.log(`✅ MongoDB connected successfully - Collection: ${this.collectionName} (${count} documents)`);

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error("❌ MongoDB connection failed:", error);
      throw new Error(`Failed to initialize vector store: ${error.message}`);
    }
  }

  /**
   * Create necessary indexes for optimal performance
   * @private
   */
  async createIndexes() {
    try {
      console.log("📊 Creating MongoDB indexes...");

      // Index for document queries by ID
      await this.collection.createIndex({ documentId: 1 });

      // Index for metadata filtering
      await this.collection.createIndex({ "metadata.source": 1 });
      await this.collection.createIndex({ "metadata.fileType": 1 });
      await this.collection.createIndex({ "metadata.version": 1 });
      await this.collection.createIndex({ "metadata.documentName": 1 });
      await this.collection.createIndex({ "metadata.chunkType": 1 });
      await this.collection.createIndex({ "metadata.chunkIndex": 1 });

      // Compound index for document name and version
      await this.collection.createIndex({ "metadata.documentName": 1, "metadata.version": 1 });

      // Index for date-based queries
      await this.collection.createIndex({ "metadata.uploadedAt": 1 });
      await this.collection.createIndex({ createdAt: 1 });

      // Vector search index (if using MongoDB Atlas Vector Search)
      // Note: This requires MongoDB Atlas with Vector Search enabled
      try {
        await this.collection.createIndex(
          { embedding: "vectorSearch" },
          {
            name: "vector_index",
            vectorSearch: {
              type: "knnVector",
              dimensions: 3072, // Updated for Gemini embeddings
              similarity: "cosine"
            }
          }
        );
        console.log("✅ Vector search index created");
      } catch (vectorError) {
        console.log("⚠️ Vector search index not available (requires MongoDB Atlas Vector Search)");
        console.log("   Creating regular index for manual search optimization...");

        // Create regular index on embedding field for better performance
        try {
          await this.collection.createIndex(
            { embedding: 1 },
            { name: "embedding_index" }
          );
          console.log("✅ Regular embedding index created for manual search");
        } catch (indexError) {
          console.warn("⚠️ Could not create embedding index:", indexError.message);
        }
      }

      console.log("✅ MongoDB indexes created successfully");
    } catch (error) {
      console.warn("⚠️ Some indexes may not have been created:", error.message);
    }
  }

  /**
   * Phase 1: Validate that only child chunks are being processed
   * @param {Object[]} metadatas - Array of metadata objects
   * @returns {Object} Validation result with filtered data
   */
  validateChunkTypes(metadatas) {
    try {
      const validationResult = {
        validChunks: [],
        rejectedChunks: [],
        totalProcessed: metadatas.length,
        validCount: 0,
        rejectedCount: 0
      };

      metadatas.forEach((metadata, index) => {
        const chunkType = metadata.chunkType || metadata.chunkingStrategy || 'basic';

        // Check if this is a parent chunk (should be rejected)
        if (this.REJECTED_CHUNK_TYPES.includes(chunkType) ||
            metadata.chunkingStrategy === 'parent_hierarchical') {
          validationResult.rejectedChunks.push({
            index,
            chunkType,
            chunkingStrategy: metadata.chunkingStrategy,
            reason: 'Parent chunk detected - parent chunks should not be stored in vector store'
          });
          validationResult.rejectedCount++;
        } else if (this.ALLOWED_CHUNK_TYPES.includes(chunkType) ||
                   !metadata.chunkType) { // Allow chunks without explicit type (backward compatibility)
          validationResult.validChunks.push(index);
          validationResult.validCount++;
        } else {
          validationResult.rejectedChunks.push({
            index,
            chunkType,
            chunkingStrategy: metadata.chunkingStrategy,
            reason: `Unknown chunk type: ${chunkType}`
          });
          validationResult.rejectedCount++;
        }
      });

      if (validationResult.rejectedCount > 0) {
        console.log(`⚠️ Chunk validation: ${validationResult.rejectedCount}/${validationResult.totalProcessed} chunks rejected`);
        validationResult.rejectedChunks.forEach(rejected => {
          console.log(`   - Index ${rejected.index}: ${rejected.reason}`);
        });
      }

      console.log(`✅ Chunk validation: ${validationResult.validCount}/${validationResult.totalProcessed} chunks approved for vector storage`);
      return validationResult;
    } catch (error) {
      console.error('❌ Chunk validation failed:', error.message);
      throw new Error(`Chunk validation failed: ${error.message}`);
    }
  }

  /**
   * Phase 1: Filter arrays to only include valid child chunks
   * @param {string[]} documents - Array of document texts
   * @param {number[][]} embeddings - Array of embeddings
   * @param {Object[]} metadatas - Array of metadata objects
   * @param {string[]} ids - Array of unique IDs
   * @param {Object} validationResult - Result from validateChunkTypes
   * @returns {Object} Filtered arrays
   */
  filterValidChunks(documents, embeddings, metadatas, ids, validationResult) {
    try {
      const filteredData = {
        documents: [],
        embeddings: [],
        metadatas: [],
        ids: []
      };

      validationResult.validChunks.forEach(index => {
        filteredData.documents.push(documents[index]);
        filteredData.embeddings.push(embeddings[index]);
        filteredData.metadatas.push(metadatas[index]);
        filteredData.ids.push(ids[index]);
      });

      console.log(`🔧 Filtered data: ${filteredData.documents.length} valid chunks ready for storage`);
      return filteredData;
    } catch (error) {
      console.error('❌ Chunk filtering failed:', error.message);
      throw new Error(`Chunk filtering failed: ${error.message}`);
    }
  }

  /**
   * Add documents to the MongoDB vector store (Phase 1: Child chunks only)
   * @param {string[]} documents - Array of document texts
   * @param {number[][]} embeddings - Array of embeddings
   * @param {Object[]} metadatas - Array of metadata objects
   * @param {string[]} ids - Array of unique IDs
   * @returns {Promise<boolean>} Success status
   */
  async addDocuments(documents, embeddings, metadatas, ids) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      if (!documents || !embeddings || !metadatas || !ids) {
        throw new Error("All parameters (documents, embeddings, metadatas, ids) are required");
      }

      if (documents.length !== embeddings.length ||
          documents.length !== metadatas.length ||
          documents.length !== ids.length) {
        throw new Error("All arrays must have the same length");
      }

      console.log(`📥 Phase 1: Processing ${documents.length} chunks for MongoDB vector storage (child chunks only)...`);

      // Phase 1: Validate chunk types and filter out parent chunks
      const validationResult = this.validateChunkTypes(metadatas);

      if (validationResult.validCount === 0) {
        throw new Error("No valid child chunks found for vector storage");
      }

      // Filter arrays to only include valid child chunks
      const filteredData = this.filterValidChunks(documents, embeddings, metadatas, ids, validationResult);

      // Prepare documents for MongoDB insertion
      const mongoDocuments = filteredData.ids.map((id, index) => {
        const metadata = filteredData.metadatas[index];
        const documentName = metadata.documentName || metadata.source || 'unknown';

        return {
          _id: id,
          documentId: id.split('_chunk_')[0] || id, // Extract document ID from chunk ID
          chunkId: id,
          content: filteredData.documents[index],
          embedding: filteredData.embeddings[index],
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
            textLength: metadata.textLength || metadata.contentLength || filteredData.documents[index].length
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };
      });

      // Insert documents in batches to avoid MongoDB payload limits
      const batchSize = 100;
      let insertedCount = 0;

      for (let i = 0; i < mongoDocuments.length; i += batchSize) {
        const batch = mongoDocuments.slice(i, i + batchSize);
        const result = await this.collection.insertMany(batch, { ordered: false });
        insertedCount += result.insertedCount;
        console.log(`📦 Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(mongoDocuments.length / batchSize)}: ${result.insertedCount} documents`);
      }

      console.log(`✅ Successfully added ${insertedCount} child chunks to MongoDB vector store`);
      console.log(`📊 Storage summary: ${validationResult.validCount} child chunks stored, ${validationResult.rejectedCount} parent chunks excluded`);
      return true;
    } catch (error) {
      console.error("❌ Error adding documents:", error);
      throw new Error(`Failed to add documents: ${error.message}`);
    }
  }

  /**
   * Search for similar documents using vector similarity
   * @param {number[]} queryEmbedding - Query embedding vector
   * @param {number} nResults - Number of results to return
   * @returns {Promise<Object>} Search results
   */
  async search(queryEmbedding, nResults = 5) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error("Query embedding is required");
      }

      console.log(`🔍 Searching for ${nResults} similar documents in MongoDB...`);

      // Use manual cosine similarity calculation for local MongoDB
      // MongoDB Atlas Vector Search requires special configuration
      const results = await this.manualVectorSearch(queryEmbedding, nResults * 2);
      console.log(`✅ Found ${results.length} relevant documents`);
      return this.formatSearchResults(results.slice(0, nResults));
    } catch (error) {
      console.error("❌ Search error:", error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Manual vector similarity search (fallback when Atlas Vector Search is not available)
   * @private
   */
  async manualVectorSearch(queryEmbedding, limit) {
    try {
      // Use sampling strategy for better performance with large datasets
      const totalDocs = await this.collection.countDocuments();
      const sampleSize = Math.min(this.maxDocumentsPerQuery, totalDocs);

      let documents;
      if (totalDocs <= sampleSize) {
        // If we have fewer documents than our limit, get all
        documents = await this.collection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
      } else {
        // Use aggregation pipeline for more efficient sampling
        documents = await this.collection.aggregate([
          { $sample: { size: sampleSize } },
          { $sort: { createdAt: -1 } }
        ]).toArray();
      }

      console.log(`🔍 Calculating similarity for ${documents.length} documents`);

      // Calculate cosine similarity for each document
      const results = documents.map(doc => {
        const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
        return {
          ...doc,
          score: similarity
        };
      });

      // Sort by similarity and return top results
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      console.error("❌ Manual vector search failed:", error);
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   * @private
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Format search results to match ChromaDB interface
   * @private
   */
  formatSearchResults(results) {
    return {
      ids: [results.map(r => r._id || r.chunkId)],
      documents: [results.map(r => r.content)],
      metadatas: [results.map(r => r.metadata)],
      distances: [results.map(r => r.score ? 1 - r.score : 0)] // Convert similarity to distance
    };
  }

  /**
   * Get document by ID
   * @param {string} id - Document ID
   * @returns {Promise<Object>} Document data
   */
  async getDocument(id) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      console.log(`📄 Getting document: ${id}`);
      const result = await this.collection.findOne({ _id: id });

      if (!result) {
        throw new Error(`Document with ID ${id} not found`);
      }

      return {
        id: result._id,
        document: result.content,
        metadata: result.metadata,
        embedding: result.embedding
      };
    } catch (error) {
      console.error("❌ Error getting document:", error);
      throw new Error(`Failed to get document: ${error.message}`);
    }
  }

  /**
   * Clear all documents from the vector store
   * @returns {Promise<Object>} Clear result
   */
  async clearAllDocuments() {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("Vector store not initialized");
      }

      console.log("🗑️ Clearing all documents from vector store...");

      // Delete all documents
      const result = await this.collection.deleteMany({});

      console.log(`✅ Cleared ${result.deletedCount} documents from vector store`);

      return {
        success: true,
        deletedCount: result.deletedCount,
        message: `Successfully cleared ${result.deletedCount} documents`
      };
    } catch (error) {
      console.error("❌ Failed to clear documents:", error);
      throw new Error(`Failed to clear documents: ${error.message}`);
    }
  }

  /**
   * Delete documents by IDs
   * @param {string[]} ids - Array of document IDs to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteDocuments(ids) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      if (!ids || ids.length === 0) {
        throw new Error("Document IDs are required");
      }

      console.log(`🗑️ Deleting ${ids.length} documents...`);

      const result = await this.collection.deleteMany({
        _id: { $in: ids }
      });

      console.log(`✅ Successfully deleted ${result.deletedCount} documents`);
      return true;
    } catch (error) {
      console.error("❌ Error deleting documents:", error);
      throw new Error(`Failed to delete documents: ${error.message}`);
    }
  }

  /**
   * Get collection statistics
   * @returns {Promise<Object>} Collection stats
   */
  async getStats() {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      const count = await this.collection.countDocuments();
      console.log(`📊 MongoDB collection stats - Documents: ${count}`);

      // Get chunk type statistics
      const chunkStats = await this.getChunkTypeStats();

      return {
        collectionName: this.collectionName,
        documentCount: count,
        lastUpdated: new Date().toISOString(),
        chunkTypeStats: chunkStats,
        phase1Info: {
          description: "Phase 1: Hierarchical chunking - only child chunks stored in vector store",
          allowedChunkTypes: this.ALLOWED_CHUNK_TYPES,
          rejectedChunkTypes: this.REJECTED_CHUNK_TYPES
        },
        database: this.databaseName,
        provider: "mongodb"
      };
    } catch (error) {
      console.error("❌ Error getting stats:", error);
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }

  /**
   * Get chunk type statistics
   * @returns {Promise<Object>} Chunk type statistics
   */
  async getChunkTypeStats() {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      console.log(`📊 Analyzing chunk types in MongoDB collection...`);

      // Get sample of documents for analysis
      const sampleDocs = await this.collection.find({}).limit(10000).toArray();

      if (!sampleDocs || sampleDocs.length === 0) {
        return {
          totalChunks: 0,
          chunkTypes: {},
          hierarchicalChunks: {
            childChunks: 0,
            parentChunks: 0,
            basicChunks: 0
          },
          lastAnalyzed: new Date().toISOString()
        };
      }

      const chunkTypeStats = {
        totalChunks: sampleDocs.length,
        chunkTypes: {},
        hierarchicalChunks: {
          childChunks: 0,
          parentChunks: 0,
          basicChunks: 0
        },
        lastAnalyzed: new Date().toISOString()
      };

      // Analyze each chunk
      sampleDocs.forEach((doc) => {
        const chunkType = doc.metadata.chunkType || 'basic';
        const chunkingStrategy = doc.metadata.chunkingStrategy || 'basic';

        // Count by chunk type
        chunkTypeStats.chunkTypes[chunkType] = (chunkTypeStats.chunkTypes[chunkType] || 0) + 1;

        // Count hierarchical chunks
        if (chunkingStrategy === 'child_hierarchical' || chunkType === 'child') {
          chunkTypeStats.hierarchicalChunks.childChunks++;
        } else if (chunkingStrategy === 'parent_hierarchical' || chunkType === 'parent') {
          chunkTypeStats.hierarchicalChunks.parentChunks++;
        } else {
          chunkTypeStats.hierarchicalChunks.basicChunks++;
        }
      });

      console.log(`✅ Chunk analysis complete: ${chunkTypeStats.totalChunks} total chunks`);
      console.log(`   - Child chunks: ${chunkTypeStats.hierarchicalChunks.childChunks}`);
      console.log(`   - Parent chunks: ${chunkTypeStats.hierarchicalChunks.parentChunks}`);
      console.log(`   - Basic chunks: ${chunkTypeStats.hierarchicalChunks.basicChunks}`);

      return chunkTypeStats;
    } catch (error) {
      console.error("❌ Error getting chunk type stats:", error);
      throw new Error(`Failed to get chunk type stats: ${error.message}`);
    }
  }

  /**
   * Update document metadata
   * @param {string} id - Document ID
   * @param {Object} metadata - New metadata
   * @returns {Promise<boolean>} Success status
   */
  async updateMetadata(id, metadata) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      console.log(`📝 Updating metadata for document: ${id}`);

      const result = await this.collection.updateOne(
        { _id: id },
        {
          $set: {
            metadata: { ...metadata },
            updatedAt: new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        throw new Error(`Document with ID ${id} not found`);
      }

      console.log(`✅ Successfully updated metadata for document: ${id}`);
      return true;
    } catch (error) {
      console.error("❌ Error updating metadata:", error);
      throw new Error(`Failed to update metadata: ${error.message}`);
    }
  }

  /**
   * List all documents with basic info
   * @param {number} limit - Maximum number of documents to return
   * @param {number} offset - Number of documents to skip
   * @returns {Promise<Object[]>} Array of document summaries
   */
  async listDocuments(limit = 100, offset = 0) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      console.log(`📋 Listing documents (limit: ${limit}, offset: ${offset})`);

      const documents = await this.collection
        .find({})
        .skip(offset)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();

      const summaries = documents.map(doc => ({
        id: doc._id,
        metadata: doc.metadata,
        contentPreview: doc.content?.substring(0, 100) + "..." || "",
        createdAt: doc.createdAt
      }));

      console.log(`✅ Listed ${summaries.length} documents`);
      return summaries;
    } catch (error) {
      console.error("❌ Error listing documents:", error);
      throw new Error(`Failed to list documents: ${error.message}`);
    }
  }

  /**
   * Get unique document names and their statistics
   * @returns {Promise<Object[]>} Array of unique documents with stats
   */
  async getDocumentSummaries() {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      console.log(`📊 Getting document summaries...`);

      // Use MongoDB aggregation to get document summaries
      const pipeline = [
        {
          $group: {
            _id: "$metadata.documentName",
            chunks: { $sum: 1 },
            totalEmbeddings: { $sum: 1 },
            fileSize: { $first: "$metadata.fileSize" },
            fileType: { $first: "$metadata.fileType" },
            version: { $first: "$metadata.version" },
            uploadedAt: { $first: "$metadata.uploadedAt" },
            lastModified: { $first: "$metadata.uploadedAt" },
            chunkIndices: { $push: "$metadata.chunkIndex" },
            contentLength: { $sum: { $strLenCP: "$content" } }
          }
        },
        {
          $sort: { lastModified: -1 }
        }
      ];

      const summaries = await this.collection.aggregate(pipeline).toArray();

      const formattedSummaries = summaries.map(doc => ({
        name: doc._id,
        chunks: doc.chunks,
        totalEmbeddings: doc.totalEmbeddings,
        fileSize: doc.fileSize || 0,
        fileType: doc.fileType || 'unknown',
        version: doc.version || 1,
        uploadedAt: doc.uploadedAt,
        lastModified: doc.lastModified,
        chunkIndices: doc.chunkIndices,
        contentLength: doc.contentLength,
        averageChunkSize: doc.contentLength / doc.chunks
      }));

      console.log(`✅ Generated summaries for ${formattedSummaries.length} documents`);
      return formattedSummaries;
    } catch (error) {
      console.error("❌ Error getting document summaries:", error);
      throw new Error(`Failed to get document summaries: ${error.message}`);
    }
  }

  /**
   * Search documents by name or content
   * @param {string} query - Search query
   * @param {Object} filters - Additional filters
   * @returns {Promise<Object[]>} Filtered document results
   */
  async searchDocuments(query, filters = {}) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      console.log(`🔍 Searching documents with query: "${query}"`);

      // Build MongoDB query for text search
      const mongoQuery = {};

      if (query) {
        mongoQuery.$or = [
          { "metadata.documentName": { $regex: query, $options: 'i' } },
          { content: { $regex: query, $options: 'i' } }
        ];
      }

      // Add metadata filters
      if (filters.fileType) {
        mongoQuery["metadata.fileType"] = filters.fileType;
      }

      if (filters.minFileSize || filters.maxFileSize) {
        mongoQuery["metadata.fileSize"] = {};
        if (filters.minFileSize) mongoQuery["metadata.fileSize"].$gte = filters.minFileSize;
        if (filters.maxFileSize) mongoQuery["metadata.fileSize"].$lte = filters.maxFileSize;
      }

      const results = await this.collection.find(mongoQuery).limit(100).toArray();

      const formattedResults = results.map(doc => ({
        id: doc._id,
        documentName: doc.metadata.documentName,
        fileType: doc.metadata.fileType,
        fileSize: doc.metadata.fileSize,
        version: doc.metadata.version,
        uploadedAt: doc.metadata.uploadedAt,
        chunkIndex: doc.metadata.chunkIndex,
        contentLength: doc.metadata.textLength || doc.content.length,
        contentPreview: doc.content ? doc.content.substring(0, 200) + "..." : "",
        searchMatch: query ? (doc.metadata.documentName?.toLowerCase().includes(query.toLowerCase()) ? 'name' : 'content') : null
      }));

      console.log(`✅ Found ${formattedResults.length} documents matching query`);
      return formattedResults;
    } catch (error) {
      console.error("❌ Error searching documents:", error);
      throw new Error(`Failed to search documents: ${error.message}`);
    }
  }

  /**
   * Get detailed information about a specific document
   * @param {string} documentName - Name of the document
   * @returns {Promise<Object>} Detailed document information
   */
  async getDocumentDetails(documentName) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      console.log(`📄 Getting details for document: ${documentName}`);

      // Get all chunks for this document
      const chunks = await this.collection.find({
        "metadata.documentName": documentName
      }).toArray();

      if (chunks.length === 0) {
        throw new Error(`Document "${documentName}" not found`);
      }

      const totalSize = chunks.reduce((sum, chunk) => sum + (chunk.metadata.textLength || chunk.content.length), 0);
      const firstUploaded = chunks.reduce((earliest, chunk) => {
        const uploadTime = chunk.metadata.uploadedAt;
        return (!earliest || uploadTime < earliest) ? uploadTime : earliest;
      }, null);

      const lastUploaded = chunks.reduce((latest, chunk) => {
        const uploadTime = chunk.metadata.uploadedAt;
        return (!latest || uploadTime > latest) ? uploadTime : latest;
      }, null);

      const details = {
        name: documentName,
        totalChunks: chunks.length,
        totalContentLength: totalSize,
        averageChunkSize: totalSize / chunks.length,
        firstUploaded,
        lastUploaded,
        version: chunks[0].metadata.version || 1,
        chunks: chunks
          .sort((a, b) => (a.metadata.chunkIndex || 0) - (b.metadata.chunkIndex || 0))
          .map(chunk => ({
            id: chunk._id,
            chunkIndex: chunk.metadata.chunkIndex || 0,
            contentLength: chunk.metadata.textLength || chunk.content.length,
            uploadedAt: chunk.metadata.uploadedAt,
            version: chunk.metadata.version || 1
          }))
      };

      console.log(`✅ Retrieved details for ${documentName}: ${chunks.length} chunks`);
      return details;
    } catch (error) {
      console.error("❌ Error getting document details:", error);
      throw new Error(`Failed to get document details: ${error.message}`);
    }
  }

  /**
   * Get all versions of a document
   * @param {string} documentName - Name of the document
   * @returns {Promise<Array>} Array of document versions
   */
  async getDocumentVersions(documentName) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      console.log(`📋 Getting versions for document: ${documentName}`);

      // Group by version using aggregation
      const pipeline = [
        {
          $match: { "metadata.documentName": documentName }
        },
        {
          $group: {
            _id: "$metadata.version",
            chunks: {
              $push: {
                id: "$_id",
                chunkIndex: "$metadata.chunkIndex",
                contentLength: { $strLenCP: "$content" }
              }
            },
            metadata: {
              $first: {
                version: "$metadata.version",
                fileSize: "$metadata.fileSize",
                fileType: "$metadata.fileType",
                fileHash: "$metadata.fileHash",
                textLength: "$metadata.textLength",
                chunkCount: "$metadata.chunkCount",
                uploadedAt: "$metadata.uploadedAt",
                processedAt: "$metadata.uploadedAt",
                versionType: "$metadata.versionType"
              }
            }
          }
        },
        {
          $sort: { "_id": -1 } // Latest version first
        }
      ];

      const versions = await this.collection.aggregate(pipeline).toArray();

      const formattedVersions = versions.map(version => ({
        version: version._id || 1,
        chunks: version.chunks,
        metadata: version.metadata
      }));

      console.log(`✅ Found ${formattedVersions.length} versions for ${documentName}`);
      return formattedVersions;
    } catch (error) {
      console.error("❌ Error getting document versions:", error);
      throw new Error(`Failed to get document versions: ${error.message}`);
    }
  }

  /**
   * Delete a specific version of a document
   * @param {string} documentName - Name of the document
   * @param {number} version - Version number to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteDocumentVersion(documentName, version) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      console.log(`🗑️ Deleting version ${version} of document: ${documentName}`);

      const result = await this.collection.deleteMany({
        "metadata.documentName": documentName,
        "metadata.version": version
      });

      if (result.deletedCount === 0) {
        throw new Error(`Version ${version} not found for document ${documentName}`);
      }

      console.log(`✅ Deleted ${result.deletedCount} chunks for ${documentName} version ${version}`);
      return true;
    } catch (error) {
      console.error("❌ Error deleting document version:", error);
      throw new Error(`Failed to delete document version: ${error.message}`);
    }
  }

  /**
   * Search with filters (compatibility method for QA service)
   * @param {number[]} queryEmbedding - Query embedding vector
   * @param {Object} filters - Search filters
   * @returns {Promise<Object>} Search results with documents, distances, metadatas, ids
   */
  async searchWithFilters(queryEmbedding, filters = {}) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("Vector store not initialized");
      }

      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error("Query embedding is required");
      }

      console.log(`🔍 Searching with filters:`, filters);

      // Try MongoDB Atlas Vector Search first
      try {
        // Build MongoDB aggregation pipeline
        const pipeline = [
          // Vector search stage
          {
            $vectorSearch: {
              index: "vector_index",
              path: "embedding",
              queryVector: queryEmbedding,
              numCandidates: 100,
              limit: 20
            }
          },
          // Add score field
          {
            $addFields: {
              score: { $meta: "vectorSearchScore" }
            }
          }
        ];

        // Add metadata filters if provided
        if (Object.keys(filters).length > 0) {
          const matchConditions = {};

          if (filters.fileType) {
            matchConditions["metadata.fileType"] = filters.fileType;
          }

          if (filters.minFileSize || filters.maxFileSize) {
            matchConditions["metadata.fileSize"] = {};
            if (filters.minFileSize) matchConditions["metadata.fileSize"].$gte = filters.minFileSize;
            if (filters.maxFileSize) matchConditions["metadata.fileSize"].$lte = filters.maxFileSize;
          }

          if (filters.language) {
            matchConditions["metadata.language"] = filters.language;
          }

          if (filters.tags && filters.tags.length > 0) {
            matchConditions["metadata.tags"] = { $in: filters.tags };
          }

          if (filters.categories && filters.categories.length > 0) {
            matchConditions["metadata.categories"] = { $in: filters.categories };
          }

          if (filters.author) {
            matchConditions["metadata.author"] = { $regex: filters.author, $options: 'i' };
          }

          if (filters.title) {
            matchConditions["metadata.title"] = { $regex: filters.title, $options: 'i' };
          }

          if (Object.keys(matchConditions).length > 0) {
            pipeline.push({ $match: matchConditions });
          }
        }

        // Execute search
        const results = await this.collection.aggregate(pipeline).toArray();
        console.log(`✅ Found ${results.length} filtered results using Atlas Vector Search`);

        // Format results to match expected format
        return {
          documents: [results.map(r => r.content || "")],
          distances: [results.map(r => 1 - r.score)], // Convert similarity to distance
          metadatas: [results.map(r => r.metadata || {})],
          ids: [results.map(r => r._id.toString())]
        };

      } catch (atlasError) {
        // Fall back to manual vector similarity search
        console.log("⚠️ Atlas Vector Search not available, falling back to manual search");
        return await this.manualVectorSearchWithFilters(queryEmbedding, filters);
      }

    } catch (error) {
      console.error("❌ Filtered search failed:", error);
      // Return empty results on error
      return {
        documents: [[]],
        distances: [[]],
        metadatas: [[]],
        ids: [[]]
      };
    }
  }

  /**
   * Manual vector similarity search with filters (fallback when Atlas Vector Search is not available)
   * @private
   */
  async manualVectorSearchWithFilters(queryEmbedding, filters = {}) {
    try {
      // Build MongoDB query for filters
      const mongoQuery = {};

      // Apply metadata filters
      if (Object.keys(filters).length > 0) {
        if (filters.fileType) {
          mongoQuery["metadata.fileType"] = filters.fileType;
        }

        if (filters.minFileSize || filters.maxFileSize) {
          mongoQuery["metadata.fileSize"] = {};
          if (filters.minFileSize) mongoQuery["metadata.fileSize"].$gte = filters.minFileSize;
          if (filters.maxFileSize) mongoQuery["metadata.fileSize"].$lte = filters.maxFileSize;
        }

        if (filters.language) {
          mongoQuery["metadata.language"] = filters.language;
        }

        if (filters.tags && filters.tags.length > 0) {
          mongoQuery["metadata.tags"] = { $in: filters.tags };
        }

        if (filters.categories && filters.categories.length > 0) {
          mongoQuery["metadata.categories"] = { $in: filters.categories };
        }

        if (filters.author) {
          mongoQuery["metadata.author"] = { $regex: filters.author, $options: 'i' };
        }

        if (filters.title) {
          mongoQuery["metadata.title"] = { $regex: filters.title, $options: 'i' };
        }
      }

      // Get filtered documents with performance limits
      const documents = await this.collection
        .find(mongoQuery)
        .limit(this.maxDocumentsPerQuery || 1000)
        .sort({ createdAt: -1 }) // Prefer newer documents
        .toArray();

      // Calculate cosine similarity for each document
      const results = documents.map(doc => {
        const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
        return {
          ...doc,
          score: similarity
        };
      });

      // Sort by similarity and return top results
      const topResults = results
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      console.log(`✅ Found ${topResults.length} filtered results using manual search`);

      return {
        documents: [topResults.map(r => r.content || "")],
        distances: [topResults.map(r => 1 - r.score)], // Convert similarity to distance
        metadatas: [topResults.map(r => r.metadata || {})],
        ids: [topResults.map(r => r._id.toString())]
      };
    } catch (error) {
      console.error("❌ Manual filtered search failed:", error);
      return {
        documents: [[]],
        distances: [[]],
        metadatas: [[]],
        ids: [[]]
      };
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   * @private
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Check if the MongoDB service is healthy
   * @returns {Promise<boolean>} Health status
   */
  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return false;
      }

      // Quick health check by counting documents
      await this.collection.countDocuments({}, { limit: 1 });
      return true;
    } catch (error) {
      console.error("❌ MongoDB vector store health check failed:", error);
      return false;
    }
  }

  // ============================================
  // MULTI-TENANCY METHODS
  // ============================================

  /**
   * Add documents with tenant isolation
   * @param {Array} texts - Array of text chunks
   * @param {Array} embeddings - Array of embeddings
   * @param {Array} metadatas - Array of metadata objects
   * @param {Array} ids - Array of document IDs
   * @param {Object} tenant - Tenant information
   * @returns {Promise<Object>} Operation result
   */
  async addDocumentsByTenant(texts, embeddings, metadatas, ids, tenant) {
    try {
      if (!this.multiTenancyEnabled || !tenant || tenant.type === 'global') {
        // Fall back to regular method if multi-tenancy is disabled
        return await this.addDocuments(texts, embeddings, metadatas, ids);
      }

      // Validate chunk types
      const validationResult = this.validateChunkTypes(metadatas);
      if (validationResult.rejectedCount > 0) {
        throw new Error(`Rejected ${validationResult.rejectedCount} chunks due to chunk type validation`);
      }

      // Add tenant information to metadata
      const tenantMetadatas = metadatas.map(metadata => ({
        ...metadata,
        tenantId: tenant.id,
        tenantType: tenant.type,
        userId: tenant.userId,
        email: tenant.email
      }));

      // Prepare documents for insertion
      const documents = texts.map((text, index) => ({
        _id: ids[index],
        content: text,
        embedding: embeddings[index],
        metadata: tenantMetadatas[index],
        createdAt: new Date(),
        tenantId: tenant.id,
        tenantType: tenant.type
      }));

      // Insert documents
      const result = await this.collection.insertMany(documents, {
        ordered: false, // Continue on errors
        writeConcern: { w: 'majority', wtimeoutMS: 5000 }
      });

      console.log(`✅ Added ${result.insertedCount} documents for tenant ${tenant.id} (${tenant.type})`);
      return {
        insertedCount: result.insertedCount,
        insertedIds: Object.values(result.insertedIds)
      };
    } catch (error) {
      console.error("❌ Failed to add documents by tenant:", error);
      throw new Error(`Failed to add documents by tenant: ${error.message}`);
    }
  }

  /**
   * Search documents by tenant
   * @param {Array} queryEmbedding - Query embedding vector
   * @param {number} limit - Maximum number of results
   * @param {Object} tenant - Tenant information
   * @param {Object} filters - Additional filters
   * @returns {Promise<Object>} Search results
   */
  async searchByTenant(queryEmbedding, limit = 5, tenant, filters = {}) {
    try {
      if (!this.multiTenancyEnabled || !tenant || tenant.type === 'global') {
        // Fall back to regular search if multi-tenancy is disabled
        return await this.search(queryEmbedding, limit, filters);
      }

      // Build tenant-specific filter
      const tenantFilter = {
        tenantId: tenant.id,
        tenantType: tenant.type,
        ...filters
      };

      // Use MongoDB Vector Search if available, otherwise fallback to manual search
      if (this.collection.indexExists && await this.collection.indexExists('vector_index')) {
        return await this.vectorSearch(queryEmbedding, limit, tenantFilter);
      } else {
        const results = await this.manualVectorSearchWithFilters(queryEmbedding, tenantFilter);
        // Apply limit to results if needed
        if (results.documents && results.documents[0] && results.documents[0].length > limit) {
          results.documents[0] = results.documents[0].slice(0, limit);
          results.distances[0] = results.distances[0].slice(0, limit);
          results.metadatas[0] = results.metadatas[0].slice(0, limit);
          results.ids[0] = results.ids[0].slice(0, limit);
        }
        return results;
      }
    } catch (error) {
      console.error("❌ Failed to search by tenant:", error);
      throw new Error(`Failed to search by tenant: ${error.message}`);
    }
  }

  /**
   * List documents by tenant
   * @param {Object} tenant - Tenant information
   * @param {number} limit - Maximum number of results
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} Documents list
   */
  async listDocumentsByTenant(tenant, limit = 10, offset = 0) {
    try {
      if (!this.multiTenancyEnabled || !tenant || tenant.type === 'global') {
        // Fall back to regular listing if multi-tenancy is disabled
        return await this.listDocuments(limit, offset);
      }

      // Build aggregation pipeline for tenant-specific listing
      const pipeline = [
        // Filter by tenant
        {
          $match: {
            tenantId: tenant.id,
            tenantType: tenant.type
          }
        },
        // Group by document name to get unique documents
        {
          $group: {
            _id: "$metadata.documentName",
            documentName: { $first: "$metadata.documentName" },
            fileType: { $first: "$metadata.fileType" },
            fileSize: { $first: "$metadata.fileSize" },
            chunks: { $sum: 1 },
            totalEmbeddings: { $sum: 1 },
            uploadedAt: { $first: "$metadata.uploadedAt" },
            version: { $first: "$metadata.version" },
            tenantId: { $first: "$tenantId" },
            tenantType: { $first: "$tenantType" }
          }
        },
        // Sort by upload date (newest first)
        {
          $sort: { uploadedAt: -1 }
        },
        // Apply pagination
        {
          $skip: offset
        },
        {
          $limit: limit
        }
      ];

      const documents = await this.collection.aggregate(pipeline).toArray();

      return documents.map(doc => ({
        name: doc.documentName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        chunks: doc.chunks,
        totalEmbeddings: doc.totalEmbeddings,
        uploadedAt: doc.uploadedAt,
        version: doc.version,
        tenantId: doc.tenantId,
        tenantType: doc.tenantType
      }));
    } catch (error) {
      console.error("❌ Failed to list documents by tenant:", error);
      throw new Error(`Failed to list documents by tenant: ${error.message}`);
    }
  }

  /**
   * Get document details by tenant
   * @param {Object} tenant - Tenant information
   * @param {string} documentName - Document name
   * @returns {Promise<Object>} Document details
   */
  async getDocumentByTenant(tenant, documentName) {
    try {
      if (!this.multiTenancyEnabled || !tenant || tenant.type === 'global') {
        // Fall back to regular method if multi-tenancy is disabled
        return await this.getDocumentDetails(documentName);
      }

      // Find documents for this tenant and document name
      const documents = await this.collection.find({
        "metadata.documentName": decodeURIComponent(documentName),
        tenantId: tenant.id,
        tenantType: tenant.type
      }).toArray();

      if (documents.length === 0) {
        throw new Error(`Document "${documentName}" not found for tenant`);
      }

      // Get the latest version
      const latestDoc = documents.reduce((latest, current) => {
        return (!latest || current.metadata.version > latest.metadata.version) ? current : latest;
      });

      return {
        name: latestDoc.metadata.documentName,
        fileType: latestDoc.metadata.fileType,
        fileSize: latestDoc.metadata.fileSize,
        chunks: documents.length,
        totalEmbeddings: documents.length,
        uploadedAt: latestDoc.metadata.uploadedAt,
        version: latestDoc.metadata.version,
        metadata: latestDoc.metadata,
        tenantId: latestDoc.tenantId,
        tenantType: latestDoc.tenantType
      };
    } catch (error) {
      console.error("❌ Failed to get document by tenant:", error);
      throw new Error(`Failed to get document by tenant: ${error.message}`);
    }
  }

  /**
   * Delete document by tenant
   * @param {Object} tenant - Tenant information
   * @param {string} documentId - Document ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteDocumentByTenant(tenant, documentId) {
    try {
      if (!this.multiTenancyEnabled || !tenant || tenant.type === 'global') {
        // Fall back to regular method if multi-tenancy is disabled
        return await this.deleteDocument(documentId);
      }

      // Find and delete all chunks for this document belonging to the tenant
      const result = await this.collection.deleteMany({
        _id: { $regex: `^${documentId}` }, // Match document ID prefix
        tenantId: tenant.id,
        tenantType: tenant.type
      });

      console.log(`🗑️ Deleted ${result.deletedCount} chunks for document ${documentId} by tenant ${tenant.id}`);
      return result.deletedCount > 0;
    } catch (error) {
      console.error("❌ Failed to delete document by tenant:", error);
      throw new Error(`Failed to delete document by tenant: ${error.message}`);
    }
  }

  /**
   * Clear all documents by tenant (for GDPR compliance)
   * @param {Object} tenant - Tenant information
   * @returns {Promise<number>} Number of deleted documents
   */
  async clearDocumentsByTenant(tenant) {
    try {
      if (!this.multiTenancyEnabled || !tenant || tenant.type === 'global') {
        throw new Error("Cannot clear documents for global tenant");
      }

      const result = await this.collection.deleteMany({
        tenantId: tenant.id,
        tenantType: tenant.type
      });

      console.log(`🗑️ Cleared ${result.deletedCount} documents for tenant ${tenant.id}`);
      return result.deletedCount;
    } catch (error) {
      console.error("❌ Failed to clear documents by tenant:", error);
      throw new Error(`Failed to clear documents by tenant: ${error.message}`);
    }
  }

  /**
   * Search documents by tenant with text query
   * @param {string} query - Search query
   * @param {Object} tenant - Tenant information
   * @param {Object} filters - Additional filters
   * @param {number} limit - Maximum results
   * @returns {Promise<Array>} Search results
   */
  async searchDocumentsByTenant(query, tenant, filters = {}, limit = 20) {
    try {
      if (!this.multiTenancyEnabled || !tenant || tenant.type === 'global') {
        // Fall back to regular search if multi-tenancy is disabled
        return await this.searchDocuments(query, filters, limit);
      }

      // Build tenant-specific search pipeline
      const pipeline = [
        // Filter by tenant
        {
          $match: {
            tenantId: tenant.id,
            tenantType: tenant.type,
            ...filters
          }
        },
        // Text search on content
        {
          $match: {
            $or: [
              { content: { $regex: query, $options: 'i' } },
              { "metadata.documentName": { $regex: query, $options: 'i' } },
              { "metadata.title": { $regex: query, $options: 'i' } },
              { "metadata.description": { $regex: query, $options: 'i' } }
            ]
          }
        },
        // Group by document
        {
          $group: {
            _id: "$metadata.documentName",
            documentName: { $first: "$metadata.documentName" },
            fileType: { $first: "$metadata.fileType" },
            fileSize: { $first: "$metadata.fileSize" },
            chunks: { $sum: 1 },
            totalEmbeddings: { $sum: 1 },
            uploadedAt: { $first: "$metadata.uploadedAt" },
            version: { $first: "$metadata.version" },
            metadata: { $first: "$metadata" },
            matchingChunks: { $sum: 1 }
          }
        },
        // Sort by relevance (more matching chunks = higher relevance)
        {
          $sort: { matchingChunks: -1, uploadedAt: -1 }
        },
        // Limit results
        {
          $limit: limit
        }
      ];

      const results = await this.collection.aggregate(pipeline).toArray();

      return results.map(result => ({
        name: result.documentName,
        fileType: result.fileType,
        fileSize: result.fileSize,
        chunks: result.chunks,
        totalEmbeddings: result.totalEmbeddings,
        uploadedAt: result.uploadedAt,
        version: result.version,
        metadata: result.metadata,
        relevance: result.matchingChunks
      }));
    } catch (error) {
      console.error("❌ Failed to search documents by tenant:", error);
      throw new Error(`Failed to search documents by tenant: ${error.message}`);
    }
  }
}

export default VectorStore;