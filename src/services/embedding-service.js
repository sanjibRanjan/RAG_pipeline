import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';

// Constants
const MAX_BATCH_SIZE = 100;
const SUB_BATCH_SIZE = 20; // Controlled sub-batch size for throttled parallel processing
const EMBEDDING_MODEL_NAME = "gemini-embedding-001";

// Rate limiting and retry constants
const RATE_LIMIT_DELAY = 500; // 500ms delay between API calls
const MAX_RETRIES = 5; // Maximum retry attempts
const INITIAL_RETRY_DELAY = 1000; // Initial retry delay in ms

export class EmbeddingService {
  constructor(systemMonitor = null) {
    this.model = null;
    this.isInitialized = false;
    this.cache = new Map(); // In-memory cache for embeddings
    this.lastApiCallTime = 0; // Track last API call for rate limiting
    this.systemMonitor = systemMonitor; // System monitor for observability

    // Enhanced metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      retries: 0,
      totalGenerationTime: 0,
      averageGenerationTime: 0
    };
  }

  /**
   * Initialize the embedding service
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error("GOOGLE_API_KEY environment variable is required");
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL_NAME });

      this.isInitialized = true;
      console.log(`✅ Embedding service initialized with model: ${EMBEDDING_MODEL_NAME}`);
      return true;
    } catch (error) {
      console.warn("⚠️ Embedding service initialization failed:", error.message);
      console.warn("⚠️ Application will continue without embedding service");
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Generate embeddings for multiple texts
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} Array of embeddings
   */
  async generateEmbeddings(texts) {
    if (!this.isInitialized) {
      throw new Error("Embedding service not initialized");
    }

    if (!texts || texts.length === 0) {
      throw new Error("No texts provided for embedding");
    }

    console.log(`🤖 Generating embeddings for ${texts.length} texts using throttled processing...`);
    
    const allEmbeddings = [];
    const totalBatches = Math.ceil(texts.length / MAX_BATCH_SIZE);
    
    // Process main batches sequentially to avoid rate limiting
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);
      const batchNumber = Math.floor(i / MAX_BATCH_SIZE) + 1;
      
      console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} texts)...`);
      
      try {
        // Use the refactored generateEmbeddingsBatch for controlled parallel processing
        const batchEmbeddings = await this.generateEmbeddingsBatch(batch);
        allEmbeddings.push(...batchEmbeddings);
        
        console.log(`✅ Batch ${batchNumber} completed (${batchEmbeddings.length} embeddings)`);
      } catch (error) {
        console.error(`❌ Batch ${batchNumber} failed:`, error.message);
        throw new Error(`Batch ${batchNumber} failed: ${error.message}`);
      }
    }
    
    console.log(`✅ Generated ${allEmbeddings.length} embeddings using throttled sequential batch processing`);
    return allEmbeddings;
  }

  /**
   * Generate a cache key for a text chunk
   * @param {string} text - Text to generate cache key for
   * @returns {string} Cache key
   */
  generateCacheKey(text) {
    return crypto.createHash('sha256').update(text.trim()).digest('hex');
  }

  /**
   * Enhanced single chunk embedding with caching and rate limiting
   * @param {string} chunk - Text chunk to embed
   * @returns {Promise<number[]>} Single embedding vector
   */
  async embedSingleChunk(chunk) {
    if (!this.isInitialized) {
      throw new Error("Embedding service not initialized");
    }

    if (!chunk || chunk.trim().length === 0) {
      throw new Error("No chunk provided for embedding");
    }

    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      const cacheKey = this.generateCacheKey(chunk);
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        this.metrics.cacheHits++;
        console.log(`CACHE HIT: Using cached embedding for chunk: "${chunk.substring(0, 30)}..."`);
        
        // Record metrics
        if (this.systemMonitor) {
          this.systemMonitor.recordEmbedding({
            cacheHit: true,
            success: true,
            generationTime: Date.now() - startTime
          });
        }
        
        return this.cache.get(cacheKey);
      }

      this.metrics.cacheMisses++;
      console.log(`Calling API for chunk: "${chunk.substring(0, 30)}..."`);
      
      // Apply rate limiting
      await this.enforceRateLimit();
      
      // Make API call with exponential backoff retry logic
      const embedding = await this.callApiWithRetry(chunk);
      
      // Cache the result
      this.cache.set(cacheKey, embedding);
      
      const generationTime = Date.now() - startTime;
      this.metrics.successfulRequests++;
      this.metrics.totalGenerationTime += generationTime;
      this.metrics.averageGenerationTime = this.metrics.totalGenerationTime / this.metrics.successfulRequests;
      
      console.log(`✅ Generated and cached embedding with ${embedding.length} dimensions (${generationTime}ms)`);
      
      // Record metrics
      if (this.systemMonitor) {
        this.systemMonitor.recordEmbedding({
          cacheHit: false,
          success: true,
          generationTime,
          retries: 0 // Will be updated by callApiWithRetry if retries occurred
        });
      }
      
      return embedding;
      
    } catch (error) {
      this.metrics.failedRequests++;
      
      // Record metrics
      if (this.systemMonitor) {
        this.systemMonitor.recordEmbedding({
          cacheHit: false,
          success: false,
          generationTime: Date.now() - startTime
        });
      }
      
      throw error;
    }
  }

  /**
   * Enforce rate limiting by ensuring minimum delay between API calls
   */
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCallTime;
    
    if (timeSinceLastCall < RATE_LIMIT_DELAY) {
      const delayNeeded = RATE_LIMIT_DELAY - timeSinceLastCall;
      console.log(`RATE LIMIT: Waiting ${delayNeeded}ms before next API call...`);
      await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }
    
    this.lastApiCallTime = Date.now();
  }

  /**
   * Call API with exponential backoff retry logic
   * @param {string} chunk - Text chunk to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async callApiWithRetry(chunk) {
    let lastError;
    let totalRetries = 0;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.model.embedContent(chunk);
        
        // Record successful retry metrics
        if (attempt > 1) {
          this.metrics.retries += (attempt - 1);
          totalRetries = attempt - 1;
        }
        
        return result.embedding.values;
      } catch (error) {
        lastError = error;
        
        // Check if it's a rate limit error (429)
        if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
          if (attempt < MAX_RETRIES) {
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            console.log(`RATE LIMIT HIT: Retrying in ${delay}ms... (attempt ${attempt}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // For other errors, don't retry immediately
        if (attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
          console.log(`API ERROR: Retrying in ${delay}ms... (attempt ${attempt}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Record failed retry metrics
    this.metrics.retries += (MAX_RETRIES - 1);
    
    throw new Error(`Failed to generate embedding after ${MAX_RETRIES} attempts. Last error: ${lastError.message}`);
  }

  /**
   * Process chunks in queue with robust error handling and caching
   * @param {string[]} chunks - Array of text chunks to process
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async processChunksInQueue(chunks) {
    if (!this.isInitialized) {
      throw new Error("Embedding service not initialized");
    }

    if (!chunks || chunks.length === 0) {
      console.log("No chunks to process");
      return [];
    }

    console.log(`🚀 Starting to process ${chunks.length} chunks in queue...`);
    
    const results = [];
    const errors = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkNumber = i + 1;
      
      try {
        console.log(`📝 Processing chunk ${chunkNumber}/${chunks.length}...`);
        const embedding = await this.embedSingleChunk(chunk);
        results.push(embedding);
        console.log(`✅ Chunk ${chunkNumber} processed successfully`);
      } catch (error) {
        console.error(`❌ Failed to process chunk ${chunkNumber}:`, error.message);
        errors.push({
          chunkNumber,
          chunk: chunk.substring(0, 50) + '...',
          error: error.message
        });
        
        // For individual chunk failures, we continue processing other chunks
        // but we need to maintain the same array structure
        results.push(null);
      }
    }
    
    // Log summary
    const successCount = results.filter(r => r !== null).length;
    const failureCount = errors.length;
    
    console.log(`📊 Processing complete: ${successCount} successful, ${failureCount} failed`);
    
    if (errors.length > 0) {
      console.log(`❌ Failed chunks:`, errors);
    }
    
    // Return only successful embeddings (filter out nulls)
    return results.filter(r => r !== null);
  }

  /**
   * Generate embedding for a single text (legacy method for backward compatibility)
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Single embedding vector
   */
  async generateSingleEmbedding(text) {
    if (!this.isInitialized) {
      throw new Error("Embedding service not initialized");
    }

    if (!text || text.trim().length === 0) {
      throw new Error("No text provided for embedding");
    }

    console.log("🔍 Generating single embedding...");
    const result = await this.model.embedContent(text);
    console.log(`✅ Generated embedding with ${result.embedding.values.length} dimensions`);

    return result.embedding.values;
  }

  /**
   * Generate embeddings in batches to handle large datasets
   * @param {string[]} texts - Array of texts to embed
   * @param {number} batchSize - Size of each batch
   * @returns {Promise<number[][]>} Array of embeddings
   */
  async generateEmbeddingsBatch(texts, batchSize = MAX_BATCH_SIZE) {
    if (!this.isInitialized) {
      throw new Error("Embedding service not initialized");
    }

    if (!texts || texts.length === 0) {
      return [];
    }

    console.log(`🔄 Processing ${texts.length} texts with controlled parallel sub-batches...`);

    const allEmbeddings = [];

    // Break the batch into smaller sub-batches of 20 texts each
    for (let i = 0; i < texts.length; i += SUB_BATCH_SIZE) {
      const subBatch = texts.slice(i, i + SUB_BATCH_SIZE);
      const subBatchNumber = Math.floor(i / SUB_BATCH_SIZE) + 1;
      const totalSubBatches = Math.ceil(texts.length / SUB_BATCH_SIZE);

      console.log(`   📦 Sub-batch ${subBatchNumber}/${totalSubBatches} (${subBatch.length} texts)...`);

      try {
        // Process the sub-batch in parallel
        const subBatchPromises = subBatch.map(text => this.model.embedContent(text));
        const subBatchResults = await Promise.all(subBatchPromises);
        const subBatchEmbeddings = subBatchResults.map(result => result.embedding.values);

        allEmbeddings.push(...subBatchEmbeddings);
        console.log(`   ✅ Sub-batch ${subBatchNumber} completed`);

        // Add throttling delay between sub-batches to prevent rate limiting
        if (i + SUB_BATCH_SIZE < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
        }
      } catch (error) {
        console.error(`❌ Sub-batch ${subBatchNumber} failed:`, error.message);
        throw new Error(`Sub-batch ${subBatchNumber} failed: ${error.message}`);
      }
    }

    console.log(`✅ Generated ${allEmbeddings.length} embeddings using throttled parallel processing`);
    return allEmbeddings;
  }

  /**
   * Generate embeddings with retry logic and individual fallback (enhanced version)
   * @param {string[]} texts - Array of texts to embed
   * @param {number} maxRetries - Maximum number of retries
   * @returns {Promise<number[][]>} Array of embeddings
   */
  async generateEmbeddingsWithRetry(texts, maxRetries = 3) {
    console.log(`🔄 Starting enhanced embedding generation for ${texts.length} texts...`);
    
    // First try the new robust queue processing method
    try {
      console.log(`🚀 Attempting robust queue processing...`);
      const embeddings = await this.processChunksInQueue(texts);
      
      if (embeddings.length === texts.length) {
        console.log(`✅ All ${embeddings.length} embeddings generated successfully using queue processing`);
        return embeddings;
      } else {
        console.log(`⚠️ Queue processing partially successful: ${embeddings.length}/${texts.length} embeddings generated`);
        return embeddings;
      }
    } catch (error) {
      console.warn(`⚠️ Queue processing failed, falling back to legacy batch processing:`, error.message);
    }
    
    // Fallback to legacy batch processing with retry logic
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.generateEmbeddings(texts);
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Embedding attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`🔄 Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If batch processing fails, try individual processing with the new robust method
    console.log(`🔄 Batch processing failed, trying individual text processing with robust queue...`);
    try {
      const individualEmbeddings = await this.processChunksInQueue(texts);
      console.log(`✅ Individual processing succeeded for ${individualEmbeddings.length} texts`);
      return individualEmbeddings;
    } catch (individualError) {
      throw new Error(`Both batch and individual processing failed. Batch error: ${lastError.message}, Individual error: ${individualError.message}`);
    }
  }

  /**
   * Get the dimensions of embeddings generated by this service
   * @returns {Promise<number>} Embedding dimensions
   */
  async getEmbeddingDimensions() {
    if (!this.isInitialized) {
      throw new Error("Embedding service not initialized");
    }

    const testEmbedding = await this.generateSingleEmbedding("test");
    return testEmbedding.length;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()).slice(0, 5) // Show first 5 keys as sample
    };
  }

  /**
   * Clear the embedding cache
   */
  clearCache() {
    const previousSize = this.cache.size;
    this.cache.clear();
    console.log(`🗑️ Cleared embedding cache (${previousSize} entries removed)`);
  }

  /**
   * Get embedding service metrics
   * @returns {Object} Service metrics
   */
  getMetrics() {
    const cacheHitRate = (this.metrics.cacheHits + this.metrics.cacheMisses) > 0 
      ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(2)
      : 0;
    
    const successRate = this.metrics.totalRequests > 0
      ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2)
      : 0;
    
    const retryRate = this.metrics.totalRequests > 0
      ? (this.metrics.retries / this.metrics.totalRequests * 100).toFixed(2)
      : 0;

    return {
      ...this.metrics,
      cacheHitRate: cacheHitRate + '%',
      successRate: successRate + '%',
      retryRate: retryRate + '%',
      cacheSize: this.cache.size,
      isInitialized: this.isInitialized
    };
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

      // Simple health check - just verify the model is available
      // No API call needed to avoid quota consumption
      return this.model !== null;
    } catch (error) {
      console.error("❌ Embedding service health check failed:", error);
      return false;
    }
  }
}

export default EmbeddingService;
