import { InferenceClient } from '@huggingface/inference';
export class EmbeddingService {
  constructor() {
    this.embeddings = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the embedding service
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      const apiKey = process.env.HF_API_KEY;
      if (!apiKey) {
        throw new Error("HF_API_KEY environment variable is required");
      }

      const model = process.env.HF_MODEL || "sentence-transformers/all-MiniLM-L6-v2";

      this.embeddings = new InferenceClient(apiKey);
      // Test the connection directly (bypass isInitialized check during init)
      console.log("🔍 Testing embedding service connection...");
      const testEmbedding = await this.embeddings.featureExtraction({
        model: model,
        inputs: "test"
      });
      console.log(`✅ Test embedding generated with ${testEmbedding.length} dimensions`);

      this.isInitialized = true;
      console.log(`✅ Embedding service initialized with model: ${model}`);
      return true;
    } catch (error) {
      console.error("❌ Embedding service initialization failed:", error);
      throw new Error(`Failed to initialize embedding service: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} Array of embeddings
   */
  async generateEmbeddings(texts) {
    try {
      if (!this.isInitialized || !this.embeddings) {
        throw new Error("Embedding service not initialized");
      }

      if (!texts || texts.length === 0) {
        throw new Error("No texts provided for embedding");
      }

      console.log(`🤖 Generating embeddings for ${texts.length} texts...`);
      const model = process.env.HF_MODEL || "sentence-transformers/all-MiniLM-L6-v2";
      
      // Process texts sequentially to avoid overwhelming the API
      const embeddings = [];
      for (let i = 0; i < texts.length; i++) {
        console.log(`📝 Processing text ${i + 1}/${texts.length}...`);
        
        // Retry logic for individual text processing
        let embedding = null;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts && !embedding) {
          try {
            embedding = await this.embeddings.featureExtraction({
              model: model,
              inputs: texts[i]
            });
            console.log(`✅ Text ${i + 1} processed successfully`);
          } catch (error) {
            attempts++;
            console.warn(`⚠️ Text ${i + 1} attempt ${attempts}/${maxAttempts} failed:`, error.message);
            
            if (attempts < maxAttempts) {
              const delay = Math.pow(2, attempts) * 1000; // Exponential backoff
              console.log(`🔄 Retrying text ${i + 1} in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              throw new Error(`Failed to process text ${i + 1} after ${maxAttempts} attempts: ${error.message}`);
            }
          }
        }
        
        embeddings.push(embedding);
        
        // Add small delay between requests to avoid rate limiting
        if (i < texts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
      }
      
      console.log(`✅ Generated ${embeddings.length} embeddings`);

      return embeddings;
    } catch (error) {
      console.error("❌ Embedding generation failed:", error);
      throw new Error(`Failed to generate embeddings: ${error.message}`);
    }
  }

  /**
   * Generate embedding for a single text
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Single embedding vector
   */
  async generateSingleEmbedding(text) {
    try {
      if (!this.isInitialized || !this.embeddings) {
        throw new Error("Embedding service not initialized");
      }

      if (!text || text.trim().length === 0) {
        throw new Error("No text provided for embedding");
      }

      console.log("🔍 Generating single embedding...");
      const model = process.env.HF_MODEL || "sentence-transformers/all-MiniLM-L6-v2";
      const embedding = await this.embeddings.featureExtraction({
        model: model,
        inputs: text
      });
      console.log(`✅ Generated embedding with ${embedding.length} dimensions`);

      return embedding;
    } catch (error) {
      console.error("❌ Single embedding generation failed:", error);
      throw new Error(`Failed to generate single embedding: ${error.message}`);
    }
  }

  /**
   * Generate embeddings in batches to handle large datasets
   * @param {string[]} texts - Array of texts to embed
   * @param {number} batchSize - Size of each batch
   * @returns {Promise<number[][]>} Array of embeddings
   */
  async generateEmbeddingsBatch(texts, batchSize = 10) {
    try {
      if (!this.isInitialized || !this.embeddings) {
        throw new Error("Embedding service not initialized");
      }

      if (!texts || texts.length === 0) {
        return [];
      }

      console.log(`🔄 Generating embeddings in batches of ${batchSize}...`);
      const allEmbeddings = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchNumber = Math.floor(i/batchSize) + 1;
        const totalBatches = Math.ceil(texts.length/batchSize);
        
        console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} texts)...`);

        try {
          const batchEmbeddings = await this.generateEmbeddingsWithRetry(batch);
          allEmbeddings.push(...batchEmbeddings);
          
          // Add delay between batches to avoid rate limiting
          if (i + batchSize < texts.length) {
            await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
          }
        } catch (error) {
          console.error(`❌ Failed to process batch ${batchNumber}:`, error.message);
          throw new Error(`Batch ${batchNumber} failed: ${error.message}`);
        }
      }

      console.log(`✅ Generated ${allEmbeddings.length} embeddings in ${Math.ceil(texts.length/batchSize)} batches`);
      return allEmbeddings;
    } catch (error) {
      console.error("❌ Batch embedding generation failed:", error);
      throw new Error(`Failed to generate batch embeddings: ${error.message}`);
    }
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
    try {
      if (!this.isInitialized || !this.embeddings) {
        throw new Error("Embedding service not initialized");
      }

      const testEmbedding = await this.generateSingleEmbedding("test");
      return testEmbedding.length;
    } catch (error) {
      console.error("❌ Failed to get embedding dimensions:", error);
      throw new Error(`Failed to get embedding dimensions: ${error.message}`);
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
