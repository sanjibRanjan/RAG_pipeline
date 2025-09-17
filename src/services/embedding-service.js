import { GoogleGenerativeAI } from '@google/generative-ai';

// Constants
const MAX_BATCH_SIZE = 100;
const SUB_BATCH_SIZE = 20; // Controlled sub-batch size for throttled parallel processing
const EMBEDDING_MODEL_NAME = "gemini-embedding-001";

export class EmbeddingService {
  constructor() {
    this.model = null;
    this.isInitialized = false;
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
      
      // Test the connection directly (bypass isInitialized check during init)
      console.log("🔍 Testing embedding service connection...");
      const testResult = await this.model.embedContent("test");
      console.log(`✅ Test embedding generated with ${testResult.embedding.values.length} dimensions`);

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
   * Generate embedding for a single text
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
   * Generate embeddings with retry logic and individual fallback
   * @param {string[]} texts - Array of texts to embed
   * @param {number} maxRetries - Maximum number of retries
   * @returns {Promise<number[][]>} Array of embeddings
   */
  async generateEmbeddingsWithRetry(texts, maxRetries = 3) {
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
    
    // If batch processing fails, try individual processing
    console.log(`🔄 Batch processing failed, trying individual text processing...`);
    try {
      const individualEmbeddings = [];
      for (let i = 0; i < texts.length; i++) {
        console.log(`📝 Processing text ${i + 1}/${texts.length} individually...`);
        const embedding = await this.generateSingleEmbedding(texts[i]);
        individualEmbeddings.push(embedding);
        
        // Add delay between individual requests
        if (i < texts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
      }
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
   * Check if the service is healthy
   * @returns {Promise<boolean>} Health status
   */
  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return false;
      }

      // Quick health check by generating a small embedding
      await this.generateSingleEmbedding("health check");
      return true;
    } catch (error) {
      console.error("❌ Embedding service health check failed:", error);
      return false;
    }
  }
}

export default EmbeddingService;
