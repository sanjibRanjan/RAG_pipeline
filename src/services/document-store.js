/**
 * DocumentStore Service
 *
 * Phase 1: Persistent storage for parent chunks using file system
 * Stores parent chunks persistently across server restarts
 *
 * @author RAG Pipeline Team
 * @version 2.1.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DocumentStore {
  constructor(options = {}) {
    // In-memory Map for storing parent chunks (primary storage)
    this.parentChunks = new Map();

    // Configuration options
    this.maxSize = options.maxSize || 10000; // Maximum number of parent chunks to store
    this.cleanupInterval = options.cleanupInterval || 30 * 60 * 1000; // 30 minutes
    this.enableCleanup = options.enableCleanup !== false; // Default to true
    this.enablePersistence = options.enablePersistence !== false; // Default to true
    this.persistenceFile = options.persistenceFile || path.join(__dirname, '../../data/processed/document_store.json');

    // Statistics tracking
    this.stats = {
      totalStored: 0,
      totalRetrieved: 0,
      totalDeleted: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastCleanup: null,
      lastSave: null,
      lastLoad: null,
      createdAt: new Date().toISOString()
    };

    // Ensure persistence directory exists
    if (this.enablePersistence) {
      const persistenceDir = path.dirname(this.persistenceFile);
      if (!fs.existsSync(persistenceDir)) {
        fs.mkdirSync(persistenceDir, { recursive: true });
      }
      this.loadFromDisk();
    }

    // Start cleanup timer if enabled
    if (this.enableCleanup) {
      this.startCleanupTimer();
    }

    console.log(`📦 DocumentStore initialized with ${this.enablePersistence ? 'persistent' : 'in-memory'} storage`);
  }

  /**
   * Store a parent chunk in the document store
   * @param {string} parentId - Unique identifier for the parent chunk
   * @param {Object} parentChunk - Parent chunk object with content and metadata
   * @returns {boolean} Success status
   */
  storeParentChunk(parentId, parentChunk) {
    try {
      // Validate input
      if (!parentId || typeof parentId !== 'string') {
        throw new Error('Parent ID must be a non-empty string');
      }
      
      if (!parentChunk || typeof parentChunk !== 'object') {
        throw new Error('Parent chunk must be an object');
      }
      
      if (!parentChunk.content || typeof parentChunk.content !== 'string') {
        throw new Error('Parent chunk must have content property');
      }
      
      // Check if we need to cleanup before storing
      if (this.parentChunks.size >= this.maxSize) {
        this.performCleanup();
      }
      
      // Add timestamp and store
      const enrichedChunk = {
        ...parentChunk,
        storedAt: new Date().toISOString(),
        accessCount: 0,
        lastAccessed: null
      };
      
      this.parentChunks.set(parentId, enrichedChunk);
      this.stats.totalStored++;

      // Auto-save to disk if persistence is enabled
      this.autoSave();

      console.log(`📦 Stored parent chunk: ${parentId} (${parentChunk.content.length} chars)`);
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to store parent chunk ${parentId}:`, error.message);
      return false;
    }
  }

  /**
   * Retrieve a parent chunk by its ID
   * @param {string} parentId - Unique identifier for the parent chunk
   * @returns {Object|null} Parent chunk object or null if not found
   */
  getParentChunk(parentId) {
    try {
      if (!parentId || typeof parentId !== 'string') {
        throw new Error('Parent ID must be a non-empty string');
      }
      
      const chunk = this.parentChunks.get(parentId);
      
      if (chunk) {
        // Update access statistics
        chunk.accessCount++;
        chunk.lastAccessed = new Date().toISOString();
        this.stats.totalRetrieved++;
        this.stats.cacheHits++;
        
        console.log(`📦 Retrieved parent chunk: ${parentId} (accessed ${chunk.accessCount} times)`);
        return chunk;
      } else {
        this.stats.cacheMisses++;
        console.log(`📦 Parent chunk not found: ${parentId}`);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ Failed to retrieve parent chunk ${parentId}:`, error.message);
      return null;
    }
  }

  /**
   * Check if a parent chunk exists in the store
   * @param {string} parentId - Unique identifier for the parent chunk
   * @returns {boolean} True if chunk exists, false otherwise
   */
  hasParentChunk(parentId) {
    try {
      if (!parentId || typeof parentId !== 'string') {
        return false;
      }
      
      return this.parentChunks.has(parentId);
    } catch (error) {
      console.error(`❌ Failed to check parent chunk existence ${parentId}:`, error.message);
      return false;
    }
  }

  /**
   * Delete a parent chunk from the store
   * @param {string} parentId - Unique identifier for the parent chunk
   * @returns {boolean} Success status
   */
  deleteParentChunk(parentId) {
    try {
      if (!parentId || typeof parentId !== 'string') {
        throw new Error('Parent ID must be a non-empty string');
      }
      
      const deleted = this.parentChunks.delete(parentId);
      
      if (deleted) {
        this.stats.totalDeleted++;
        // Auto-save to disk if persistence is enabled
        this.autoSave();
        console.log(`📦 Deleted parent chunk: ${parentId}`);
        return true;
      } else {
        console.log(`📦 Parent chunk not found for deletion: ${parentId}`);
        return false;
      }
      
    } catch (error) {
      console.error(`❌ Failed to delete parent chunk ${parentId}:`, error.message);
      return false;
    }
  }

  /**
   * Store multiple parent chunks in batch
   * @param {Array} chunks - Array of objects with {id, chunk} properties
   * @returns {Object} Results summary
   */
  storeParentChunksBatch(chunks) {
    try {
      if (!Array.isArray(chunks)) {
        throw new Error('Chunks must be an array');
      }
      
      const results = {
        total: chunks.length,
        successful: 0,
        failed: 0,
        errors: []
      };
      
      chunks.forEach(({ id, chunk }, index) => {
        try {
          if (this.storeParentChunk(id, chunk)) {
            results.successful++;
          } else {
            results.failed++;
            results.errors.push(`Failed to store chunk at index ${index}`);
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`Error storing chunk at index ${index}: ${error.message}`);
        }
      });
      
      // Auto-save to disk if persistence is enabled
      this.autoSave();

      console.log(`📦 Batch storage complete: ${results.successful}/${results.total} successful`);
      return results;
      
    } catch (error) {
      console.error('❌ Batch storage failed:', error.message);
      return {
        total: 0,
        successful: 0,
        failed: 0,
        errors: [error.message]
      };
    }
  }

  /**
   * Get all parent chunk IDs currently stored
   * @returns {Array} Array of parent chunk IDs
   */
  getAllParentChunkIds() {
    try {
      return Array.from(this.parentChunks.keys());
    } catch (error) {
      console.error('❌ Failed to get all parent chunk IDs:', error.message);
      return [];
    }
  }

  /**
   * Get parent chunks by document name
   * @param {string} documentName - Name of the document
   * @returns {Array} Array of parent chunks for the document
   */
  getParentChunksByDocument(documentName) {
    try {
      if (!documentName || typeof documentName !== 'string') {
        throw new Error('Document name must be a non-empty string');
      }
      
      const chunks = [];
      
      for (const [id, chunk] of this.parentChunks.entries()) {
        if (chunk.metadata && chunk.metadata.fileName === documentName) {
          chunks.push({ id, ...chunk });
        }
      }
      
      console.log(`📦 Found ${chunks.length} parent chunks for document: ${documentName}`);
      return chunks;
      
    } catch (error) {
      console.error(`❌ Failed to get parent chunks for document ${documentName}:`, error.message);
      return [];
    }
  }

  /**
   * Clear all parent chunks from the store
   * @returns {number} Number of chunks cleared
   */
  clearAllParentChunks() {
    try {
      const count = this.parentChunks.size;
      this.parentChunks.clear();

      // Auto-save to disk if persistence is enabled
      this.autoSave();

      console.log(`📦 Cleared ${count} parent chunks from store`);
      return count;
      
    } catch (error) {
      console.error('❌ Failed to clear all parent chunks:', error.message);
      return 0;
    }
  }

  /**
   * Get store statistics and health information
   * @returns {Object} Store statistics
   */
  getStats() {
    try {
      const currentStats = {
        ...this.stats,
        currentSize: this.parentChunks.size,
        maxSize: this.maxSize,
        utilizationPercent: Math.round((this.parentChunks.size / this.maxSize) * 100),
        hitRate: this.stats.cacheHits + this.stats.cacheMisses > 0 
          ? Math.round((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100)
          : 0,
        uptime: Date.now() - new Date(this.stats.createdAt).getTime()
      };
      
      return currentStats;
      
    } catch (error) {
      console.error('❌ Failed to get store statistics:', error.message);
      return this.stats;
    }
  }

  /**
   * Perform cleanup of old or unused chunks
   * @param {Object} options - Cleanup options
   * @returns {Object} Cleanup results
   */
  performCleanup(options = {}) {
    try {
      const {
        maxAge = 24 * 60 * 60 * 1000, // 24 hours
        minAccessCount = 1,
        targetSize = Math.floor(this.maxSize * 0.8) // Clean to 80% capacity
      } = options;
      
      const now = Date.now();
      const chunksToDelete = [];
      
      // Find chunks to delete based on age and access count
      for (const [id, chunk] of this.parentChunks.entries()) {
        const age = now - new Date(chunk.storedAt).getTime();
        const shouldDelete = age > maxAge || chunk.accessCount < minAccessCount;
        
        if (shouldDelete) {
          chunksToDelete.push(id);
        }
      }
      
      // If we still need to clean more, remove least recently accessed
      if (this.parentChunks.size - chunksToDelete.length > targetSize) {
        const sortedChunks = Array.from(this.parentChunks.entries())
          .sort(([, a], [, b]) => {
            const aTime = a.lastAccessed ? new Date(a.lastAccessed).getTime() : 0;
            const bTime = b.lastAccessed ? new Date(b.lastAccessed).getTime() : 0;
            return aTime - bTime; // Oldest first
          });
        
        const additionalToDelete = sortedChunks
          .slice(0, this.parentChunks.size - targetSize)
          .map(([id]) => id);
        
        chunksToDelete.push(...additionalToDelete);
      }
      
      // Delete chunks
      let deletedCount = 0;
      chunksToDelete.forEach(id => {
        if (this.parentChunks.delete(id)) {
          deletedCount++;
        }
      });
      
      this.stats.lastCleanup = new Date().toISOString();
      
      console.log(`🧹 Cleanup complete: deleted ${deletedCount} parent chunks`);
      
      return {
        deletedCount,
        remainingCount: this.parentChunks.size,
        targetSize,
        chunksDeleted: chunksToDelete.slice(0, deletedCount)
      };
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      return {
        deletedCount: 0,
        remainingCount: this.parentChunks.size,
        error: error.message
      };
    }
  }

  /**
   * Start the cleanup timer
   * @private
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.cleanupInterval);
    
    console.log(`⏰ Cleanup timer started (interval: ${this.cleanupInterval}ms)`);
  }

  /**
   * Stop the cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('⏰ Cleanup timer stopped');
    }
  }

  /**
   * Export all parent chunks to a JSON-serializable format
   * @returns {Object} Export data
   */
  exportParentChunks() {
    try {
      const exportData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          totalChunks: this.parentChunks.size,
          version: '2.0.0'
        },
        chunks: {}
      };
      
      for (const [id, chunk] of this.parentChunks.entries()) {
        exportData.chunks[id] = {
          content: chunk.content,
          metadata: chunk.metadata,
          storedAt: chunk.storedAt,
          accessCount: chunk.accessCount,
          lastAccessed: chunk.lastAccessed
        };
      }
      
      console.log(`📤 Exported ${this.parentChunks.size} parent chunks`);
      return exportData;
      
    } catch (error) {
      console.error('❌ Export failed:', error.message);
      return null;
    }
  }

  /**
   * Import parent chunks from exported data
   * @param {Object} importData - Data to import
   * @returns {Object} Import results
   */
  importParentChunks(importData) {
    try {
      if (!importData || !importData.chunks) {
        throw new Error('Invalid import data format');
      }
      
      const results = {
        total: Object.keys(importData.chunks).length,
        successful: 0,
        failed: 0,
        errors: []
      };
      
      for (const [id, chunkData] of Object.entries(importData.chunks)) {
        try {
          if (this.storeParentChunk(id, chunkData)) {
            results.successful++;
          } else {
            results.failed++;
            results.errors.push(`Failed to import chunk ${id}`);
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`Error importing chunk ${id}: ${error.message}`);
        }
      }
      
      console.log(`📥 Import complete: ${results.successful}/${results.total} successful`);
      return results;
      
    } catch (error) {
      console.error('❌ Import failed:', error.message);
      return {
        total: 0,
        successful: 0,
        failed: 0,
        errors: [error.message]
      };
    }
  }

  /**
   * Load parent chunks from disk storage
   * @returns {boolean} Success status
   */
  loadFromDisk() {
    try {
      if (!this.enablePersistence) {
        console.log('📦 Persistence disabled, skipping disk load');
        return false;
      }

      if (!fs.existsSync(this.persistenceFile)) {
        console.log('📦 Persistence file does not exist, starting with empty store');
        return false;
      }

      const data = fs.readFileSync(this.persistenceFile, 'utf8');
      const parsedData = JSON.parse(data);

      // Load parent chunks
      if (parsedData.parentChunks && Array.isArray(parsedData.parentChunks)) {
        parsedData.parentChunks.forEach(([key, value]) => {
          this.parentChunks.set(key, value);
        });
        console.log(`📦 Loaded ${parsedData.parentChunks.length} parent chunks from disk`);
      }

      // Load statistics
      if (parsedData.stats) {
        Object.assign(this.stats, parsedData.stats);
      }

      this.stats.lastLoad = new Date().toISOString();
      console.log(`✅ DocumentStore loaded from: ${this.persistenceFile}`);
      return true;

    } catch (error) {
      console.error('❌ Error loading DocumentStore from disk:', error.message);
      return false;
    }
  }

  /**
   * Save parent chunks to disk storage
   * @returns {boolean} Success status
   */
  saveToDisk() {
    try {
      if (!this.enablePersistence) {
        console.log('📦 Persistence disabled, skipping disk save');
        return false;
      }

      const data = {
        parentChunks: Array.from(this.parentChunks.entries()),
        stats: this.stats,
        savedAt: new Date().toISOString(),
        version: '2.1.0'
      };

      fs.writeFileSync(this.persistenceFile, JSON.stringify(data, null, 2));
      this.stats.lastSave = new Date().toISOString();

      console.log(`💾 DocumentStore saved to: ${this.persistenceFile} (${this.parentChunks.size} parent chunks)`);
      return true;

    } catch (error) {
      console.error('❌ Error saving DocumentStore to disk:', error.message);
      return false;
    }
  }

  /**
   * Auto-save to disk (called after operations that modify data)
   */
  autoSave() {
    if (this.enablePersistence) {
      // Debounce saves to avoid excessive disk I/O
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }
      this.saveTimeout = setTimeout(() => {
        this.saveToDisk();
      }, 1000); // Save after 1 second of inactivity
    }
  }

  /**
   * Destroy the document store and cleanup resources
   */
  destroy() {
    try {
      // Final save before destroying
      if (this.enablePersistence) {
        this.saveToDisk();
      }

      this.stopCleanupTimer();
      this.clearAllParentChunks();

      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }

      console.log('📦 DocumentStore destroyed');
    } catch (error) {
      console.error('❌ Error destroying DocumentStore:', error.message);
    }
  }
}

export default DocumentStore;
