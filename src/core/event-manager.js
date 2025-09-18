/**
 * Event-Driven Architecture Manager
 * Implements event-driven, mini-batch processing for document ingestion
 */

import { EventEmitter } from 'events';
import { performanceLogger } from '../utils/logger.js';

export class EventManager extends EventEmitter {
  constructor() {
    super();
    this.processingQueue = new Map(); // Track processing status per document
    this.batchSize = 10; // Mini-batch size for processing
    this.maxConcurrentBatches = 3; // Maximum concurrent batches
    this.activeBatches = 0;
    
    // Set up event listeners
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers for the event-driven architecture
   */
  setupEventHandlers() {
    this.on('document.uploaded', this.handleDocumentUpload.bind(this));
    this.on('document.processing.started', this.handleDocumentProcessingStarted.bind(this));
    this.on('document.processing.completed', this.handleDocumentProcessingCompleted.bind(this));
    this.on('document.processing.failed', this.handleDocumentProcessingFailed.bind(this));
    this.on('embedding.batch.started', this.handleEmbeddingBatchStarted.bind(this));
    this.on('embedding.batch.completed', this.handleEmbeddingBatchCompleted.bind(this));
    this.on('embedding.batch.failed', this.handleEmbeddingBatchFailed.bind(this));
  }

  /**
   * Handle document upload event - triggers immediate processing
   * @param {Object} data - Document upload data
   */
  async handleDocumentUpload(data) {
    const { documentId, filePath, originalName } = data;
    
    console.log(`📄 [EVENT] Document uploaded: ${originalName} (ID: ${documentId})`);
    
    // Initialize processing tracking
    this.processingQueue.set(documentId, {
      status: 'uploaded',
      filePath,
      originalName,
      startTime: Date.now(),
      batches: [],
      completedBatches: 0,
      totalBatches: 0,
      errors: []
    });

    // Emit processing started event
    this.emit('document.processing.started', {
      documentId,
      filePath,
      originalName
    });
  }

  /**
   * Handle document processing started event
   * @param {Object} data - Processing data
   */
  async handleDocumentProcessingStarted(data) {
    const { documentId } = data;
    const processingInfo = this.processingQueue.get(documentId);
    
    if (processingInfo) {
      processingInfo.status = 'processing';
      console.log(`🔄 [EVENT] Document processing started: ${processingInfo.originalName}`);
    }
  }

  /**
   * Handle document processing completed event
   * @param {Object} data - Processing completion data
   */
  async handleDocumentProcessingCompleted(data) {
    const { documentId, chunks, embeddings } = data;
    const processingInfo = this.processingQueue.get(documentId);
    
    if (processingInfo) {
      processingInfo.status = 'completed';
      processingInfo.endTime = Date.now();
      processingInfo.duration = processingInfo.endTime - processingInfo.startTime;
      processingInfo.chunks = chunks;
      processingInfo.embeddings = embeddings;
      
      console.log(`✅ [EVENT] Document processing completed: ${processingInfo.originalName} (${processingInfo.duration}ms)`);
      
      // Clean up processing info after 5 minutes
      setTimeout(() => {
        this.processingQueue.delete(documentId);
      }, 5 * 60 * 1000);
    }
  }

  /**
   * Handle document processing failed event
   * @param {Object} data - Processing failure data
   */
  async handleDocumentProcessingFailed(data) {
    const { documentId, error } = data;
    const processingInfo = this.processingQueue.get(documentId);
    
    if (processingInfo) {
      processingInfo.status = 'failed';
      processingInfo.endTime = Date.now();
      processingInfo.duration = processingInfo.endTime - processingInfo.startTime;
      processingInfo.error = error;
      
      console.log(`❌ [EVENT] Document processing failed: ${processingInfo.originalName} - ${error.message}`);
      
      // Clean up processing info after 5 minutes
      setTimeout(() => {
        this.processingQueue.delete(documentId);
      }, 5 * 60 * 1000);
    }
  }

  /**
   * Handle embedding batch started event
   * @param {Object} data - Batch data
   */
  async handleEmbeddingBatchStarted(data) {
    const { documentId, batchId, batchSize } = data;
    const processingInfo = this.processingQueue.get(documentId);
    
    if (processingInfo) {
      processingInfo.batches.push({
        batchId,
        size: batchSize,
        startTime: Date.now(),
        status: 'processing'
      });
      
      console.log(`🔄 [EVENT] Embedding batch started: ${batchId} (${batchSize} chunks)`);
    }
  }

  /**
   * Handle embedding batch completed event
   * @param {Object} data - Batch completion data
   */
  async handleEmbeddingBatchCompleted(data) {
    const { documentId, batchId, embeddings } = data;
    const processingInfo = this.processingQueue.get(documentId);
    
    if (processingInfo) {
      const batch = processingInfo.batches.find(b => b.batchId === batchId);
      if (batch) {
        batch.status = 'completed';
        batch.endTime = Date.now();
        batch.duration = batch.endTime - batch.startTime;
        batch.embeddings = embeddings;
      }
      
      processingInfo.completedBatches++;
      
      console.log(`✅ [EVENT] Embedding batch completed: ${batchId} (${embeddings.length} embeddings)`);
    }
  }

  /**
   * Handle embedding batch failed event
   * @param {Object} data - Batch failure data
   */
  async handleEmbeddingBatchFailed(data) {
    const { documentId, batchId, error } = data;
    const processingInfo = this.processingQueue.get(documentId);
    
    if (processingInfo) {
      const batch = processingInfo.batches.find(b => b.batchId === batchId);
      if (batch) {
        batch.status = 'failed';
        batch.endTime = Date.now();
        batch.duration = batch.endTime - batch.startTime;
        batch.error = error;
      }
      
      processingInfo.errors.push({
        batchId,
        error: error.message,
        timestamp: Date.now()
      });
      
      console.log(`❌ [EVENT] Embedding batch failed: ${batchId} - ${error.message}`);
    }
  }

  /**
   * Process chunks in mini-batches (event-driven)
   * @param {string} documentId - Document ID
   * @param {Array} chunks - Array of text chunks
   * @param {Function} embeddingFunction - Function to generate embeddings
   * @returns {Promise<Array>} Array of embeddings
   */
  async processChunksInMiniBatches(documentId, chunks, embeddingFunction) {
    const processingInfo = this.processingQueue.get(documentId);
    if (!processingInfo) {
      throw new Error(`Document ${documentId} not found in processing queue`);
    }

    const totalBatches = Math.ceil(chunks.length / this.batchSize);
    processingInfo.totalBatches = totalBatches;
    
    console.log(`🔄 [EVENT] Starting mini-batch processing: ${chunks.length} chunks in ${totalBatches} batches`);
    
    const allEmbeddings = [];
    
    // Process chunks in mini-batches
    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batch = chunks.slice(i, i + this.batchSize);
      const batchId = `batch_${documentId}_${Math.floor(i / this.batchSize) + 1}`;
      
      // Wait if we have too many concurrent batches
      while (this.activeBatches >= this.maxConcurrentBatches) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      this.activeBatches++;
      
      try {
        // Emit batch started event
        this.emit('embedding.batch.started', {
          documentId,
          batchId,
          batchSize: batch.length
        });
        
        // Process the batch
        const batchEmbeddings = await embeddingFunction(batch);
        
        // Emit batch completed event
        this.emit('embedding.batch.completed', {
          documentId,
          batchId,
          embeddings: batchEmbeddings
        });
        
        allEmbeddings.push(...batchEmbeddings);
        
      } catch (error) {
        // Emit batch failed event
        this.emit('embedding.batch.failed', {
          documentId,
          batchId,
          error
        });
        
        // For individual batch failures, we continue processing other batches
        console.log(`⚠️ [EVENT] Batch ${batchId} failed, continuing with other batches`);
      } finally {
        this.activeBatches--;
      }
    }
    
    return allEmbeddings;
  }

  /**
   * Get processing status for a document
   * @param {string} documentId - Document ID
   * @returns {Object|null} Processing status
   */
  getProcessingStatus(documentId) {
    return this.processingQueue.get(documentId) || null;
  }

  /**
   * Get all processing statuses
   * @returns {Array} Array of processing statuses
   */
  getAllProcessingStatuses() {
    return Array.from(this.processingQueue.values());
  }

  /**
   * Get system metrics
   * @returns {Object} System metrics
   */
  getSystemMetrics() {
    const statuses = this.getAllProcessingStatuses();
    
    return {
      totalDocuments: statuses.length,
      activeBatches: this.activeBatches,
      maxConcurrentBatches: this.maxConcurrentBatches,
      batchSize: this.batchSize,
      processing: statuses.filter(s => s.status === 'processing').length,
      completed: statuses.filter(s => s.status === 'completed').length,
      failed: statuses.filter(s => s.status === 'failed').length,
      averageProcessingTime: this.calculateAverageProcessingTime(statuses)
    };
  }

  /**
   * Calculate average processing time
   * @param {Array} statuses - Processing statuses
   * @returns {number} Average processing time in ms
   */
  calculateAverageProcessingTime(statuses) {
    const completedStatuses = statuses.filter(s => s.status === 'completed' && s.duration);
    if (completedStatuses.length === 0) return 0;
    
    const totalTime = completedStatuses.reduce((sum, s) => sum + s.duration, 0);
    return Math.round(totalTime / completedStatuses.length);
  }
}

export default EventManager;
