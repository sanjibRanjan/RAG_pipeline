import { ChromaClient } from "chromadb";

export class VectorStore {
  constructor() {
    this.client = null;
    this.collection = null;
    this.isInitialized = false;
    this.collectionName = null;
  }

  /**
   * Initialize the vector store connection
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      const chromaUrl = process.env.CHROMA_DB_URL || "http://localhost:8000";
      this.collectionName = process.env.CHROMA_COLLECTION_NAME || "rag_documents";

      console.log(`🔗 Connecting to ChromaDB at: ${chromaUrl}`);

      // Parse URL for host and port
      const url = new URL(chromaUrl);
      const host = url.hostname;
      const port = parseInt(url.port) || 8000;

      this.client = new ChromaClient({ host, port });

      // Test connection and get/create collection
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
      });

      // Test the connection
      await this.collection.count();

      this.isInitialized = true;
      console.log(`✅ ChromaDB connected successfully - Collection: ${this.collectionName}`);
      return true;
    } catch (error) {
      console.error("❌ ChromaDB connection failed:", error);
      throw new Error(`Failed to initialize vector store: ${error.message}`);
    }
  }

  /**
   * Add documents to the vector store
   * @param {string[]} documents - Array of document texts
   * @param {number[][]} embeddings - Array of embeddings
   * @param {Object[]} metadatas - Array of metadata objects
   * @param {string[]} ids - Array of unique IDs
   * @returns {Promise<boolean>} Success status
   */
  async addDocuments(documents, embeddings, metadatas, ids) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("Vector store not initialized");
      }

      if (!documents || !embeddings || !metadatas || !ids) {
        throw new Error("All parameters (documents, embeddings, metadatas, ids) are required");
      }

      if (documents.length !== embeddings.length ||
          documents.length !== metadatas.length ||
          documents.length !== ids.length) {
        throw new Error("All arrays must have the same length");
      }

      console.log(`📥 Adding ${documents.length} documents to vector store...`);

      // Cleanse metadata to ensure all values are string, number, boolean, or null
      const cleansedMetadatas = metadatas.map(metadata => {
        const cleansed = {};
        for (const [key, value] of Object.entries(metadata)) {
          if (['string', 'number', 'boolean'].includes(typeof value) || value === null) {
            cleansed[key] = value;
          } else {
            cleansed[key] = String(value);
          }
        }
        return cleansed;
      });

      await this.collection.add({
        ids,
        embeddings,
        metadatas: cleansedMetadatas,
        documents,
      });

      console.log(`✅ Successfully added ${documents.length} documents to vector store`);
      return true;
    } catch (error) {
      console.error("❌ Error adding documents:", error);
      throw new Error(`Failed to add documents: ${error.message}`);
    }
  }

  /**
   * Search for similar documents
   * @param {number[]} queryEmbedding - Query embedding vector
   * @param {number} nResults - Number of results to return
   * @returns {Promise<Object>} Search results
   */
  async search(queryEmbedding, nResults = 5) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("Vector store not initialized");
      }

      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error("Query embedding is required");
      }

      console.log(`🔍 Searching for ${nResults} similar documents...`);

      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults,
      });

      console.log(`✅ Found ${results.documents[0]?.length || 0} relevant documents`);
      return results;
    } catch (error) {
      console.error("❌ Search error:", error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Get document by ID
   * @param {string} id - Document ID
   * @returns {Promise<Object>} Document data
   */
  async getDocument(id) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("Vector store not initialized");
      }

      console.log(`📄 Getting document: ${id}`);
      const result = await this.collection.get({
        ids: [id],
      });

      if (!result.documents || result.documents.length === 0) {
        throw new Error(`Document with ID ${id} not found`);
      }

      return {
        id: result.ids[0],
        document: result.documents[0],
        metadata: result.metadatas[0],
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
        throw new Error("Vector store not initialized");
      }

      if (!ids || ids.length === 0) {
        throw new Error("Document IDs are required");
      }

      console.log(`🗑️ Deleting ${ids.length} documents...`);
      await this.collection.delete({
        ids,
      });

      console.log(`✅ Successfully deleted ${ids.length} documents`);
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
        throw new Error("Vector store not initialized");
      }

      const count = await this.collection.count();
      console.log(`📊 Collection stats - Documents: ${count}`);

      return {
        collectionName: this.collectionName,
        documentCount: count,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Error getting stats:", error);
      throw new Error(`Failed to get stats: ${error.message}`);
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
        throw new Error("Vector store not initialized");
      }

      console.log(`📝 Updating metadata for document: ${id}`);
      await this.collection.update({
        ids: [id],
        metadatas: [metadata],
      });

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
        throw new Error("Vector store not initialized");
      }

      console.log(`📋 Listing documents (limit: ${limit}, offset: ${offset})`);
      const result = await this.collection.get({
        limit,
        offset,
      });

      const documents = result.ids.map((id, index) => ({
        id,
        metadata: result.metadatas[index],
        contentPreview: result.documents[index]?.substring(0, 100) + "...",
      }));

      console.log(`✅ Listed ${documents.length} documents`);
      return documents;
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
        throw new Error("Vector store not initialized");
      }

      console.log(`📊 Getting document summaries...`);

      // Get all documents (with reasonable limit for summary)
      const allDocs = await this.collection.get({ limit: 10000 });

      if (!allDocs.ids || allDocs.ids.length === 0) {
        return [];
      }

      // Group by document name
      const docGroups = {};

      allDocs.ids.forEach((id, index) => {
        const metadata = allDocs.metadatas[index];
        const documentName = metadata.documentName;

        if (!docGroups[documentName]) {
          docGroups[documentName] = {
            name: documentName,
            chunks: 0,
            totalEmbeddings: 0,
            fileSize: metadata.fileSize || 0,
            fileType: metadata.fileType || 'unknown',
            version: metadata.version || 1,
            uploadedAt: metadata.uploadedAt || null,
            lastModified: metadata.uploadedAt || null,
            chunkIndices: [],
            contentLength: 0,
          };
        }

        docGroups[documentName].chunks++;
        docGroups[documentName].chunkIndices.push(metadata.chunkIndex || index);
        docGroups[documentName].contentLength += metadata.contentLength || 0;

        // Update last modified if this chunk is newer
        if (metadata.uploadedAt && (!docGroups[documentName].lastModified ||
            new Date(metadata.uploadedAt) > new Date(docGroups[documentName].lastModified))) {
          docGroups[documentName].lastModified = metadata.uploadedAt;
        }
      });

      const summaries = Object.values(docGroups).map(doc => ({
        ...doc,
        totalEmbeddings: doc.chunks, // Assuming 1 embedding per chunk
        averageChunkSize: doc.contentLength / doc.chunks,
        chunkRange: {
          min: Math.min(...doc.chunkIndices),
          max: Math.max(...doc.chunkIndices)
        }
      }));

      console.log(`✅ Generated summaries for ${summaries.length} documents`);
      return summaries;

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
        throw new Error("Vector store not initialized");
      }

      console.log(`🔍 Searching documents with query: "${query}"`);

      // Get all documents for filtering
      const allDocs = await this.collection.get({ limit: 10000 });

      if (!allDocs.ids || allDocs.ids.length === 0) {
        return [];
      }

      let filteredResults = [];

      for (let i = 0; i < allDocs.ids.length; i++) {
        const id = allDocs.ids[i];
        const metadata = allDocs.metadatas[i];
        const content = allDocs.documents[i];

        // Apply filters
        let matches = true;

        // Text search in document name
        if (query && metadata.documentName) {
          const nameMatch = metadata.documentName.toLowerCase().includes(query.toLowerCase());
          const contentMatch = content && content.toLowerCase().includes(query.toLowerCase());

          if (!nameMatch && !contentMatch) {
            matches = false;
          }
        }

        // Apply additional filters
        if (filters.fileType && metadata.fileType !== filters.fileType) {
          matches = false;
        }

        if (filters.minFileSize && (metadata.fileSize || 0) < filters.minFileSize) {
          matches = false;
        }

        if (filters.maxFileSize && (metadata.fileSize || 0) > filters.maxFileSize) {
          matches = false;
        }

        if (matches) {
          filteredResults.push({
            id,
            documentName: metadata.documentName,
            fileType: metadata.fileType,
            fileSize: metadata.fileSize,
            version: metadata.version,
            uploadedAt: metadata.uploadedAt,
            chunkIndex: metadata.chunkIndex,
            contentLength: metadata.contentLength,
            contentPreview: content ? content.substring(0, 200) + "..." : "",
            searchMatch: query ? (metadata.documentName?.toLowerCase().includes(query.toLowerCase()) ? 'name' : 'content') : null
          });
        }
      }

      console.log(`✅ Found ${filteredResults.length} documents matching query`);
      return filteredResults;

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
        throw new Error("Vector store not initialized");
      }

      console.log(`📄 Getting details for document: ${documentName}`);

      // Get all chunks for this document
      const allDocs = await this.collection.get({ limit: 10000 });

      const documentChunks = [];
      let totalSize = 0;
      let firstUploaded = null;
      let lastUploaded = null;

      for (let i = 0; i < allDocs.ids.length; i++) {
        const metadata = allDocs.metadatas[i];
        if (metadata.documentName === documentName) {
          documentChunks.push({
            id: allDocs.ids[i],
            chunkIndex: metadata.chunkIndex || i,
            contentLength: metadata.contentLength || 0,
            uploadedAt: metadata.uploadedAt,
            version: metadata.version || 1
          });

          totalSize += metadata.contentLength || 0;

          if (metadata.uploadedAt) {
            if (!firstUploaded || metadata.uploadedAt < firstUploaded) {
              firstUploaded = metadata.uploadedAt;
            }
            if (!lastUploaded || metadata.uploadedAt > lastUploaded) {
              lastUploaded = metadata.uploadedAt;
            }
          }
        }
      }

      if (documentChunks.length === 0) {
        throw new Error(`Document "${documentName}" not found`);
      }

      const details = {
        name: documentName,
        totalChunks: documentChunks.length,
        totalContentLength: totalSize,
        averageChunkSize: totalSize / documentChunks.length,
        firstUploaded,
        lastUploaded,
        version: documentChunks[0].version || 1,
        chunks: documentChunks.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0))
      };

      console.log(`✅ Retrieved details for ${documentName}: ${documentChunks.length} chunks`);
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
        throw new Error("Vector store not initialized");
      }

      console.log(`📋 Getting versions for document: ${documentName}`);

      // Get all chunks for this document
      const allDocs = await this.collection.get({ limit: 10000 });

      const versions = {};
      let maxVersion = 0;

      for (let i = 0; i < allDocs.ids.length; i++) {
        const metadata = allDocs.metadatas[i];
        if (metadata.documentName === documentName) {
          const version = metadata.version || 1;
          maxVersion = Math.max(maxVersion, version);

          if (!versions[version]) {
            versions[version] = {
              version,
              chunks: [],
              metadata: {
                version,
                fileSize: metadata.fileSize,
                fileType: metadata.fileType,
                fileHash: metadata.fileHash,
                textLength: metadata.textLength,
                chunkCount: metadata.totalChunks || 0,
                uploadedAt: metadata.uploadedAt,
                processedAt: metadata.ingestionTime || metadata.uploadedAt,
                versionType: metadata.versionType || 'unknown'
              }
            };
          }

          versions[version].chunks.push({
            id: allDocs.ids[i],
            chunkIndex: metadata.chunkIndex || i,
            contentLength: metadata.contentLength || 0,
          });
        }
      }

      // Convert to array and sort by version
      const versionList = Object.values(versions)
        .sort((a, b) => b.version - a.version); // Latest first

      console.log(`✅ Found ${versionList.length} versions for ${documentName}`);
      return versionList;

    } catch (error) {
      console.error("❌ Error getting document versions:", error);
      throw new Error(`Failed to get document versions: ${error.message}`);
    }
  }

  /**
   * Compare two versions of a document
   * @param {string} documentName - Name of the document
   * @param {number} version1 - First version number
   * @param {number} version2 - Second version number
   * @returns {Promise<Object>} Version comparison result
   */
  async compareDocumentVersions(documentName, version1, version2) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("Vector store not initialized");
      }

      console.log(`🔍 Comparing ${documentName} versions ${version1} vs ${version2}`);

      const versions = await this.getDocumentVersions(documentName);

      const v1 = versions.find(v => v.version === version1);
      const v2 = versions.find(v => v.version === version2);

      if (!v1 || !v2) {
        throw new Error(`Version ${!v1 ? version1 : version2} not found for document ${documentName}`);
      }

      // Compare metadata
      const comparison = {
        documentName,
        versions: {
          from: v1.version,
          to: v2.version
        },
        changes: {
          hasChanges: false,
          chunkCount: {
            from: v1.metadata.chunkCount,
            to: v2.metadata.chunkCount,
            changed: v1.metadata.chunkCount !== v2.metadata.chunkCount
          },
          fileSize: {
            from: v1.metadata.fileSize,
            to: v2.metadata.fileSize,
            changed: v1.metadata.fileSize !== v2.metadata.fileSize
          },
          textLength: {
            from: v1.metadata.textLength,
            to: v2.metadata.textLength,
            changed: v1.metadata.textLength !== v2.metadata.textLength
          },
          fileHash: {
            from: v1.metadata.fileHash,
            to: v2.metadata.fileHash,
            changed: v1.metadata.fileHash !== v2.metadata.fileHash
          }
        },
        timestamps: {
          from: v1.metadata.processedAt,
          to: v2.metadata.processedAt
        }
      };

      // Check if any changes occurred
      comparison.changes.hasChanges = Object.values(comparison.changes).some(change =>
        typeof change === 'object' && change.changed === true
      );

      console.log(`✅ Version comparison completed: ${comparison.changes.hasChanges ? 'Changes detected' : 'No changes'}`);
      return comparison;

    } catch (error) {
      console.error("❌ Error comparing document versions:", error);
      throw new Error(`Failed to compare document versions: ${error.message}`);
    }
  }

  /**
   * Get specific version of a document
   * @param {string} documentName - Name of the document
   * @param {number} version - Version number
   * @returns {Promise<Object>} Version details
   */
  async getDocumentVersion(documentName, version) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("Vector store not initialized");
      }

      console.log(`📄 Getting version ${version} of document: ${documentName}`);

      const versions = await this.getDocumentVersions(documentName);
      const targetVersion = versions.find(v => v.version === version);

      if (!targetVersion) {
        throw new Error(`Version ${version} not found for document ${documentName}`);
      }

      console.log(`✅ Retrieved version ${version} of ${documentName}`);
      return targetVersion;

    } catch (error) {
      console.error("❌ Error getting document version:", error);
      throw new Error(`Failed to get document version: ${error.message}`);
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
        throw new Error("Vector store not initialized");
      }

      console.log(`🗑️ Deleting version ${version} of document: ${documentName}`);

      // Get all chunks for this document and version
      const allDocs = await this.collection.get({ limit: 10000 });

      const chunksToDelete = [];

      for (let i = 0; i < allDocs.ids.length; i++) {
        const metadata = allDocs.metadatas[i];
        if (metadata.documentName === documentName && metadata.version === version) {
          chunksToDelete.push(allDocs.ids[i]);
        }
      }

      if (chunksToDelete.length === 0) {
        throw new Error(`Version ${version} not found for document ${documentName}`);
      }

      // Delete the chunks
      await this.collection.delete({
        ids: chunksToDelete,
      });

      console.log(`✅ Deleted ${chunksToDelete.length} chunks for ${documentName} version ${version}`);
      return true;

    } catch (error) {
      console.error("❌ Error deleting document version:", error);
      throw new Error(`Failed to delete document version: ${error.message}`);
    }
  }

  /**
   * Rollback document to a previous version
   * @param {string} documentName - Name of the document
   * @param {number} targetVersion - Version to rollback to
   * @returns {Promise<Object>} Rollback result
   */
  async rollbackDocumentVersion(documentName, targetVersion) {
    try {
      if (!this.isInitialized || !this.collection) {
        throw new Error("Vector store not initialized");
      }

      console.log(`⏪ Rolling back ${documentName} to version ${targetVersion}`);

      const versions = await this.getDocumentVersions(documentName);
      const target = versions.find(v => v.version === targetVersion);

      if (!target) {
        throw new Error(`Version ${targetVersion} not found for document ${documentName}`);
      }

      // Get the latest version to compare
      const latest = versions[0]; // Already sorted latest first

      if (latest.version === targetVersion) {
        throw new Error(`Document ${documentName} is already at version ${targetVersion}`);
      }

      // Delete all versions newer than target
      const versionsToDelete = versions.filter(v => v.version > targetVersion);

      let totalDeleted = 0;
      for (const version of versionsToDelete) {
        await this.deleteDocumentVersion(documentName, version.version);
        totalDeleted += version.chunks.length;
      }

      const result = {
        documentName,
        rolledBackTo: targetVersion,
        deletedVersions: versionsToDelete.map(v => v.version),
        totalChunksDeleted: totalDeleted,
        rollbackTime: new Date().toISOString()
      };

      console.log(`✅ Rollback completed: ${documentName} → version ${targetVersion}`);
      return result;

    } catch (error) {
      console.error("❌ Error rolling back document version:", error);
      throw new Error(`Failed to rollback document version: ${error.message}`);
    }
  }

  /**
   * Get version history summary for a document
   * @param {string} documentName - Name of the document
   * @returns {Promise<Object>} Version history summary
   */
  async getVersionHistory(documentName) {
    try {
      const versions = await this.getDocumentVersions(documentName);

      const history = {
        documentName,
        totalVersions: versions.length,
        currentVersion: versions.length > 0 ? versions[0].version : 0,
        oldestVersion: versions.length > 0 ? versions[versions.length - 1].version : 0,
        versionTimeline: versions.map(v => ({
          version: v.version,
          uploadTime: v.metadata.uploadedAt,
          chunkCount: v.metadata.chunkCount,
          fileSize: v.metadata.fileSize,
          versionType: v.metadata.versionType || 'unknown'
        })),
        summary: {
          totalChunks: versions.reduce((sum, v) => sum + v.metadata.chunkCount, 0),
          averageChunkSize: versions.length > 0 ?
            versions.reduce((sum, v) => sum + v.metadata.chunkCount, 0) / versions.length : 0,
          sizeTrend: versions.length > 1 ?
            versions[0].metadata.fileSize > versions[versions.length - 1].metadata.fileSize ?
              'increasing' : 'decreasing' : 'stable'
        }
      };

      return history;

    } catch (error) {
      console.error("❌ Error getting version history:", error);
      throw new Error(`Failed to get version history: ${error.message}`);
    }
  }

  /**
   * Check if the service is healthy
   * @returns {Promise<boolean>} Health status
   */
  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return false;
      }

      // Quick health check by getting stats
      await this.getStats();
      return true;
    } catch (error) {
      console.error("❌ Vector store health check failed:", error);
      return false;
    }
  }
}

export default VectorStore;
