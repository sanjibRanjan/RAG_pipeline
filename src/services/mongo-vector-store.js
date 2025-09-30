/**
 * MongoDB Vector Store Service
 *
 * MongoDB-based vector store implementation with the same interface as VectorStore
 * Supports vector similarity search, metadata filtering, and document versioning
 *
 * @author RAG Pipeline Team
 * @version 1.0.0
 */

import { MongoClient } from 'mongodb';
import crypto from 'crypto';

export class MongoVectorStore {
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
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        // Performance optimizations
        retryWrites: true,
        retryReads: true,
        readPreference: 'primaryPreferred',
        writeConcern: { w: 'majority', wtimeoutMS: 5000 }
      });

      // Performance configuration
      this.searchBatchSize = parseInt(process.env.VECTOR_SEARCH_BATCH_SIZE) || 50;
      this.maxDocumentsPerQuery = parseInt(process.env.MAX_DOCUMENTS_PER_QUERY) || 1000;
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
      throw new Error(`Failed to initialize MongoDB vector store: ${error.message}`);
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

      // CRITICAL: Create tenant-specific indexes for proper isolation
      await this.collection.createIndex({ tenantId: 1 });
      await this.collection.createIndex({ tenantType: 1 });
      await this.collection.createIndex({ tenantId: 1, tenantType: 1 });
      await this.collection.createIndex({ tenantId: 1, createdAt: -1 });

      // Vector search index (if using MongoDB Atlas Vector Search)
      // Note: This requires MongoDB Atlas with Vector Search enabled
      try {
        await this.collection.createIndex(
          { embedding: "vectorSearch" },
          {
            name: "vector_index",
            vectorSearch: {
              type: "knnVector",
              dimensions: 384, // Adjust based on your embedding model
              similarity: "cosine"
            }
          }
        );
        console.log("✅ Vector search index created");
      } catch (vectorError) {
        console.log("⚠️ Vector search index not available (requires MongoDB Atlas Vector Search)");
        console.log("   Falling back to manual vector similarity calculation");
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
   * @param {Object} tenant - Tenant information for isolation
   * @returns {Promise<boolean>} Success status
   */
  async addDocuments(documents, embeddings, metadatas, ids, tenant = null) {
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

      // Prepare documents for MongoDB insertion with tenant isolation
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
          // CRITICAL: Add tenant isolation fields
          tenantId: tenant?.id || null,
          tenantType: tenant?.type || null,
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
   * @param {Object} tenant - Tenant information for isolation
   * @param {Object} filters - Optional metadata filters
   * @returns {Promise<Object>} Search results
   */
  async search(queryEmbedding, nResults = 5, tenant = null, filters = {}) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("MongoDB vector store not initialized");
      }

      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error("Query embedding is required");
      }

      console.log(`🔍 Searching for ${nResults} similar documents in MongoDB...`);

      // CRITICAL: Apply tenant filtering
      const tenantFilters = { ...filters };
      if (tenant && tenant.id && tenant.id !== 'global' && tenant.id !== 'anonymous') {
        tenantFilters.tenantId = tenant.id;
        tenantFilters.tenantType = tenant.type;
        console.log(`🔒 Using tenant-specific search for tenant: ${tenant.id}`);
      }

      // Use manual cosine similarity calculation for local MongoDB
      // MongoDB Atlas Vector Search requires special configuration
      const results = await this.manualVectorSearch(queryEmbedding, nResults * 2, tenantFilters);
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
  async manualVectorSearch(queryEmbedding, limit, filters = {}) {
    try {
      // Build MongoDB query for filters
      const mongoQuery = {};

      // Apply metadata filters
      if (Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          // Handle tenant filters at root level, metadata filters at metadata level
          if (key === 'tenantId' || key === 'tenantType') {
            mongoQuery[key] = value;
          } else {
            mongoQuery[`metadata.${key}`] = value;
          }
        });
      }

      // Get filtered documents with performance limits
      const documents = await this.collection
        .find(mongoQuery)
        .limit(this.maxDocumentsPerQuery)
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
   * Search documents by tenant with proper isolation
   * @param {number[]} queryEmbedding - Query embedding vector
   * @param {number} limit - Maximum number of results
   * @param {Object} tenant - Tenant information
   * @param {Object} filters - Additional filters
   * @returns {Promise<Object>} Search results
   */
  async searchByTenant(queryEmbedding, limit = 5, tenant, filters = {}) {
    try {
      if (!tenant || tenant.id === 'global' || tenant.id === 'anonymous') {
        // Fall back to regular search if no valid tenant
        return await this.search(queryEmbedding, limit, null, filters);
      }

      // Build tenant-specific filter
      const tenantFilter = {
        tenantId: tenant.id,
        tenantType: tenant.type,
        ...filters
      };

      console.log(`🔒 Searching for tenant: ${tenant.id} (type: ${tenant.type})`);
      const results = await this.manualVectorSearch(queryEmbedding, limit, tenantFilter);
      console.log(`✅ Found ${results.length} filtered results using manual search`);
      
      return this.formatSearchResults(results.slice(0, limit));
    } catch (error) {
      console.error("❌ Failed to search by tenant:", error);
      throw new Error(`Failed to search by tenant: ${error.message}`);
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

  /**
   * Get performance metrics for the MongoDB vector store
   * @returns {Promise<Object>} Performance metrics
   */
  async getPerformanceMetrics() {
    try {
      if (!this.isInitialized) {
        return { error: "Vector store not initialized" };
      }

      // Get basic collection statistics
      const documentCount = await this.collection.countDocuments();
      const sampleDoc = await this.collection.findOne({});
      const indexes = await this.collection.listIndexes().toArray();

      // Estimate collection size (rough approximation)
      const estimatedSize = documentCount * (sampleDoc ? JSON.stringify(sampleDoc).length : 1024);

      return {
        collection: this.collectionName,
        documentCount: documentCount,
        estimatedSize: estimatedSize,
        estimatedSizeMB: (estimatedSize / (1024 * 1024)).toFixed(2),
        indexes: indexes.length,
        avgDocumentSize: sampleDoc ? JSON.stringify(sampleDoc).length : 0,
        performanceConfig: {
          maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 10,
          searchBatchSize: this.searchBatchSize,
          maxDocumentsPerQuery: this.maxDocumentsPerQuery,
          similarityThreshold: this.similarityThreshold
        },
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error("❌ Failed to get performance metrics:", error);
      return { error: error.message };
    }
  }

  /**
   * Optimize collection for better performance
   * @returns {Promise<Object>} Optimization results
   */
  async optimizeCollection() {
    try {
      if (!this.isInitialized) {
        throw new Error("Vector store not initialized");
      }

      console.log("🔧 Optimizing MongoDB collection for performance...");

      // Analyze collection statistics before optimization
      const beforeCount = await this.collection.countDocuments();
      const beforeIndexes = (await this.collection.listIndexes().toArray()).length;
      console.log(`📊 Before optimization: ${beforeCount} documents, ${beforeIndexes} indexes`);

      // Rebuild indexes by dropping and recreating them
      try {
        // Drop all indexes except _id
        const indexes = await this.collection.listIndexes().toArray();
        for (const index of indexes) {
          if (index.name !== '_id_') {
            await this.collection.dropIndex(index.name);
            console.log(`🗑️ Dropped index: ${index.name}`);
          }
        }

        // Recreate indexes
        await this.createIndexes();
        console.log("✅ Indexes recreated");
      } catch (indexError) {
        console.log("⚠️ Index recreation failed:", indexError.message);
      }

      // Get updated statistics
      const afterCount = await this.collection.countDocuments();
      const afterIndexes = (await this.collection.listIndexes().toArray()).length;

      const results = {
        beforeOptimization: {
          documentCount: beforeCount,
          indexes: beforeIndexes
        },
        afterOptimization: {
          documentCount: afterCount,
          indexes: afterIndexes
        },
        optimizationTimestamp: new Date().toISOString()
      };

      console.log("✅ Collection optimization completed");
      return results;

    } catch (error) {
      console.error("❌ Collection optimization failed:", error);
      return { error: error.message };
    }
  }

  /**
   * Close the MongoDB connection
   */
  async close() {
    try {
      if (this.client) {
        await this.client.close();
        this.isInitialized = false;
        console.log("✅ MongoDB connection closed");
      }
    } catch (error) {
      console.error("❌ Error closing MongoDB connection:", error);
    }
  }
}

export default MongoVectorStore;
