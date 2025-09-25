import LangChainManager from './langchain-manager.js';
import { DocumentStore } from './document-store.js';

export class QAService {
  constructor(embeddingService, vectorStore, documentStore = null, options = {}) {
    this.embeddingService = embeddingService;
    this.vectorStore = vectorStore;
    this.documentStore = documentStore; // Phase 1: DocumentStore for parent chunks
    this.maxResults = options.maxResults || 5;
    this.similarityThreshold = options.similarityThreshold || -0.5; // Lower threshold for ChromaDB distances
    this.maxContextLength = options.maxContextLength || 2000;
    this.isInitialized = false;

    // Initialize LLM manager if provider is configured
    this.llmProvider = process.env.LLM_PROVIDER || 'none';
    this.langChainManager = null;

    // In-memory cache for final answers
    this.answerCache = new Map();
    this.maxCacheSize = options.maxCacheSize || 100; // Maximum number of cached answers
    this.cacheEnabled = options.cacheEnabled !== false; // Default to true

    if (this.llmProvider !== 'none') {
      this.langChainManager = new LangChainManager({
        provider: this.llmProvider,
        modelName: process.env.LLM_MODEL,
        temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.3,
        maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 2000
      });
    }
  }

  /**
   * Generate a cache key for a question
   * @param {string} question - The question to cache
   * @returns {string} Normalized cache key
   */
  generateCacheKey(question) {
    if (!question || typeof question !== 'string') {
      return '';
    }
    
    // Normalize question for cache key generation
    return question.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim()
      .substring(0, 100);     // Limit key length
  }

  /**
   * Check if cache is enabled and has the answer
   * @param {string} question - The question to check
   * @returns {Object|null} Cached answer or null
   */
  getCachedAnswer(question) {
    if (!this.cacheEnabled) {
      return null;
    }

    const cacheKey = this.generateCacheKey(question);
    if (!cacheKey) {
      return null;
    }

    const cachedData = this.answerCache.get(cacheKey);
    if (cachedData) {
      console.log(`📋 Cache HIT for question: "${question.substring(0, 50)}..."`);
      return {
        ...cachedData,
        cached: true,
        cacheTimestamp: cachedData.timestamp
      };
    }

    console.log(`📋 Cache MISS for question: "${question.substring(0, 50)}..."`);
    return null;
  }

  /**
   * Store answer in cache
   * @param {string} question - The original question
   * @param {Object} answer - The complete answer object
   */
  setCachedAnswer(question, answer) {
    if (!this.cacheEnabled) {
      return;
    }

    const cacheKey = this.generateCacheKey(question);
    if (!cacheKey) {
      return;
    }

    // Add cache metadata
    const cacheData = {
      ...answer,
      timestamp: Date.now(),
      cacheKey: cacheKey,
      originalQuestion: question
    };

    // Store in cache
    this.answerCache.set(cacheKey, cacheData);

    // Clean up cache if it exceeds max size (LRU-like behavior)
    if (this.answerCache.size > this.maxCacheSize) {
      this.cleanupCache();
    }

    console.log(`💾 Cached answer for question: "${question.substring(0, 50)}..." (Cache size: ${this.answerCache.size})`);
  }

  /**
   * Clean up cache by removing oldest entries
   */
  cleanupCache() {
    const entries = Array.from(this.answerCache.entries());
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest 20% of entries
    const entriesToRemove = Math.floor(entries.length * 0.2);
    const entriesToKeep = entries.slice(entriesToRemove);
    
    // Rebuild cache with remaining entries
    this.answerCache.clear();
    entriesToKeep.forEach(([key, value]) => {
      this.answerCache.set(key, value);
    });

    console.log(`🧹 Cache cleanup: removed ${entriesToRemove} old entries, kept ${entriesToKeep.length}`);
  }

  /**
   * Clear the entire answer cache
   */
  clearCache() {
    this.answerCache.clear();
    console.log(`🗑️ Answer cache cleared`);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      enabled: this.cacheEnabled,
      size: this.answerCache.size,
      maxSize: this.maxCacheSize,
      hitRate: this.calculateHitRate(),
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Calculate cache hit rate (simplified)
   * @returns {number} Hit rate percentage
   */
  calculateHitRate() {
    // This is a simplified calculation - in production you'd track hits/misses
    const totalRequests = this.answerCache.size + 10; // Estimate
    const hits = this.answerCache.size;
    return Math.round((hits / totalRequests) * 100);
  }

  /**
   * Estimate memory usage of cache
   * @returns {string} Estimated memory usage
   */
  estimateMemoryUsage() {
    let totalSize = 0;
    for (const [key, value] of this.answerCache.entries()) {
      totalSize += JSON.stringify({ key, value }).length;
    }
    
    if (totalSize < 1024) {
      return `${totalSize} bytes`;
    } else if (totalSize < 1024 * 1024) {
      return `${Math.round(totalSize / 1024)} KB`;
    } else {
      return `${Math.round(totalSize / (1024 * 1024))} MB`;
    }
  }

  /**
   * Initialize the QA service
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (!this.embeddingService) {
      throw new Error("EmbeddingService is required");
    }
    if (!this.vectorStore) {
      throw new Error("VectorStore is required");
    }

    // Test services
    await this.embeddingService.healthCheck();
    await this.vectorStore.healthCheck();

    // Initialize LLM if configured
    if (this.langChainManager) {
      try {
        console.log(`🤖 Initializing LLM with provider: ${this.langChainManager.provider}, model: ${this.langChainManager.modelName}`);
        await this.langChainManager.initialize();
        console.log("✅ LLM integration enabled successfully");
      } catch (error) {
        console.error("❌ LLM initialization failed:", error.message);
        console.error("❌ Full error details:", error);
        console.warn("⚠️ Falling back to rule-based generation. Check your LLM configuration:");
        console.warn("   - LLM_PROVIDER:", process.env.LLM_PROVIDER || 'not set');
        console.warn("   - LLM_MODEL:", process.env.LLM_MODEL || 'not set');
        console.warn("   - GOOGLE_API_KEY:", process.env.GOOGLE_API_KEY ? 'set' : 'not set');
        console.warn("   - ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? 'set' : 'not set');
        console.warn("   - OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? 'set' : 'not set');
        this.langChainManager = null;
      }
    } else {
      console.warn("⚠️ No LLM provider configured (LLM_PROVIDER not set or set to 'none')");
      console.warn("⚠️ System will use rule-based fallback generation");
    }

    this.isInitialized = true;
    console.log("✅ QA Service initialized successfully");
    return true;
  }

  /**
   * Answer a question using retrieved documents and conversation context
   * @param {string} question - The question to answer
   * @param {Array} conversationHistory - Previous conversation messages
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Answer with sources and confidence
   */
  async answerQuestion(question, conversationHistory = [], tenant = null, options = {}) {
    try {
      if (!this.isInitialized) {
        throw new Error("QA Service not initialized");
      }

      if (!question || question.trim().length === 0) {
        throw new Error("Question is required");
      }

      console.log(`🤔 Processing question: "${question.substring(0, 100)}${question.length > 100 ? '...' : ''}"`);

      // Performance mode: Enable fast mode if environment variable is set
      const fastMode = process.env.QA_FAST_MODE === 'true';
      if (fastMode) {
        console.log('🚀 QA Fast Mode enabled - skipping expensive LLM operations');
        process.env.DISABLE_QUERY_REWRITING = 'true';
        process.env.DISABLE_LLM_RERANKING = 'true';
        process.env.DISABLE_NARRATIVE_CONTEXT = 'true';
      }

      // Check cache first - this is the main optimization
      const cachedAnswer = this.getCachedAnswer(question);
      if (cachedAnswer) {
        return cachedAnswer;
      }

      // Rewrite query for better retrieval using LLM
      const rewrittenQuestion = await this.rewriteQueryForRetrieval(question);
      console.log(`🔍 Using rewritten query for retrieval: "${rewrittenQuestion}"`);

      // Generate embedding for the rewritten question
      const questionEmbedding = await this.embeddingService.generateSingleEmbedding(rewrittenQuestion);

      // Perform mixed retrieval (semantic + keyword + metadata) - returns child chunks
      const searchResults = await this.performMixedRetrieval(questionEmbedding, question, tenant);

      // Phase 1: Perform hierarchical retrieval to get parent chunks
      const relevantChunks = await this.performHierarchicalRetrieval(searchResults, question, tenant);

      // Phase 2: LLM-based re-ranking of parent chunks (can be disabled for performance)
      let reRankedChunks;
      if (process.env.DISABLE_LLM_RERANKING === 'true') {
        console.log('🚀 LLM re-ranking disabled for performance - using semantic ranking only');
        reRankedChunks = relevantChunks; // Use original order from hierarchical retrieval
      } else {
        reRankedChunks = await this._llmReRank(relevantChunks, question);
      }

      if (reRankedChunks.length === 0) {
        console.log("⚠️ No relevant documents found");
        return {
          answer: "I couldn't find any relevant information in the documents to answer your question. Please try rephrasing your question or upload more relevant documents.",
          sources: [],
          confidence: 0,
          question,
          metadata: {
            totalChildChunksSearched: searchResults.documents?.[0]?.length || 0,
            parentChunksRetrieved: 0,
            retrievalMethod: 'hierarchical_with_llm_rerank',
            processingTime: Date.now()
          }
        };
      }

      // Phase 3: Build narrative context using linked list metadata (can be disabled for performance)
      let narrativeContext = {
        narrativeEnabled: false,
        primaryChunk: null,
        contextMetadata: {
          chunksRetrieved: 0,
          contextStats: {
            contextExpansionRatio: 1.0,
            totalContextLength: 0
          },
          linkedListMetadata: null
        }
      }; // Default fallback

      if (process.env.DISABLE_NARRATIVE_CONTEXT === 'true') {
        console.log('🚀 Narrative context building disabled for performance');
        narrativeContext = {
          narrativeEnabled: false,
          primaryChunk: reRankedChunks[0] || null,
          contextMetadata: {
            chunksRetrieved: 0,
            contextStats: {
              contextExpansionRatio: 1.0,
              totalContextLength: 0
            },
            linkedListMetadata: null
          }
        };
      } else {
        narrativeContext = await this._buildNarrativeContext(reRankedChunks, question, tenant);
      }
      
      // Use narrative context for reasoning if available, otherwise fall back to re-ranked chunks
      const contextForReasoning = narrativeContext.narrativeEnabled ? 
        [narrativeContext.primaryChunk] : reRankedChunks;

      // Apply advanced reasoning techniques based on question type
      // If narrative context is available, use it for enhanced reasoning
      let enhancedReasoningResult;
      if (narrativeContext.narrativeEnabled) {
        // Create enhanced context with narrative flow
        const enhancedChunk = {
          ...narrativeContext.primaryChunk,
          content: narrativeContext.narrativeContext,
          metadata: {
            ...narrativeContext.primaryChunk.metadata,
            narrativeEnhanced: true,
            contextExpansionRatio: narrativeContext.contextMetadata.contextStats.contextExpansionRatio
          }
        };
        enhancedReasoningResult = await this.applyAdvancedReasoning(question, [enhancedChunk], conversationHistory);
      } else {
        enhancedReasoningResult = await this.applyAdvancedReasoning(question, contextForReasoning, conversationHistory);
      }
      
      const answer = enhancedReasoningResult.answer;

      // Extract sources from re-ranked chunks
      const sources = this.extractSources(reRankedChunks, searchResults);

      // Calculate simplified confidence score
      const confidence = this.calculateSimplifiedConfidence(sources, reRankedChunks.length, enhancedReasoningResult.confidence);

      console.log(`✅ Generated answer with ${sources.length} sources, confidence: ${(confidence * 100).toFixed(1)}%`);

      const result = {
        answer,
        sources,
        confidence,
        question,
        metadata: {
          totalChildChunksSearched: searchResults.documents?.[0]?.length || 0,
          parentChunksRetrieved: reRankedChunks.length,
          retrievalMethod: 'hierarchical_with_llm_rerank',
          processingTime: Date.now(),
          conversationContextUsed: conversationHistory.length > 0,
          llmRerankingApplied: true,
          topChunkScores: reRankedChunks.slice(0, 3).map(chunk => chunk.llmScore || 'N/A'),
          // Phase 3: Narrative context metadata
          narrativeContext: {
            enabled: narrativeContext?.narrativeEnabled || false,
            chunksRetrieved: narrativeContext?.contextMetadata?.chunksRetrieved || 0,
            contextExpansionRatio: narrativeContext?.contextMetadata?.contextStats?.contextExpansionRatio || 1.0,
            totalContextLength: narrativeContext?.contextMetadata?.contextStats?.totalContextLength || 0,
            linkedListMetadata: narrativeContext?.contextMetadata?.linkedListMetadata || null
          }
        }
      };

      // Cache the answer for future similar queries using our new cache system
      this.setCachedAnswer(question, result);

      return result;

    } catch (error) {
      console.error("❌ QA Service error:", error);
      throw new Error(`Failed to answer question: ${error.message}`);
    }
  }

  /**
   * Process search results and filter relevant chunks with advanced re-ranking
   * @param {Object} searchResults - Results from vector search
   * @param {string} question - Original question
   * @returns {Array} Filtered and re-ranked relevant chunks
   */
  async processSearchResults(searchResults, question) {
    if (!searchResults.documents || !searchResults.documents[0]) {
      return [];
    }

    const chunks = searchResults.documents[0];
    const distances = searchResults.distances?.[0] || [];
    const metadatas = searchResults.metadatas?.[0] || [];

    // Filter chunks based on similarity threshold and question relevance
    const relevantChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const distance = distances[i] || 1;
      const similarity = 1 - distance; // Convert distance to similarity

      // For ChromaDB, lower distance is better, but we need to handle high distances
      // Allow all results initially, we'll filter by relevance later
      if (distance > 2.0) { // Skip very dissimilar results
        continue;
      }

      // Check if chunk is relevant to the question
      if (this.isChunkRelevantToQuestion(chunk, question)) {
        relevantChunks.push({
          content: chunk,
          similarity,
          metadata: metadatas[i] || {},
          index: i
        });
      }
    }

    // Apply advanced re-ranking system
    const reRankedChunks = await this.applyReRanking(relevantChunks, question);

    return reRankedChunks.slice(0, this.maxResults);
  }

  /**
   * Generate cache key for similar queries
   * @param {string} question - Question text
   * @returns {string} Cache key
   */
  generateCacheKey(question) {
    // Normalize question for cache key generation
    const normalized = question.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
    
    // Use first 50 characters as cache key
    return normalized.substring(0, 50);
  }

  /**
   * Apply advanced re-ranking to improve retrieval quality with LLM-based scoring
   * @param {Array} chunks - Initial relevant chunks
   * @param {string} question - Original question
   * @returns {Array} Re-ranked chunks with composite scores
   */
  async applyReRanking(chunks, question) {
    if (chunks.length === 0) return chunks;

    // Check cache first
    const cacheKey = this.generateCacheKey(question);
    if (this.rerankingCache.has(cacheKey)) {
      console.log(`📋 Using cached re-ranking results for similar query`);
      const cachedResults = this.rerankingCache.get(cacheKey);
      return this.applyCachedReRanking(chunks, cachedResults);
    }

    // Calculate multi-dimensional scores for each chunk
    const scoredChunks = chunks.map((chunk, idx) => {
      const scores = this.calculateCompositeScore(chunk, question, chunks);

      // Calculate final composite score with weights
      const finalScore = this.calculateWeightedScore(scores);

      return {
        ...chunk,
        individualScores: scores,
        finalScore,
        rank: idx + 1
      };
    });

    // Apply LLM-based re-ranking if available
    const llmRerankedChunks = await this.applyLLMReranking(scoredChunks, question);

    // Sort by final composite score (highest first)
    llmRerankedChunks.sort((a, b) => b.finalScore - a.finalScore);

    // Cache the re-ranking results
    const cacheData = {
      timestamp: Date.now(),
      question: question,
      chunkCount: chunks.length,
      scores: llmRerankedChunks.map(chunk => ({
        contentHash: this.hashContent(chunk.content),
        finalScore: chunk.finalScore,
        individualScores: chunk.individualScores
      }))
    };
    this.rerankingCache.set(cacheKey, cacheData);

    console.log(`🔄 Re-ranked ${llmRerankedChunks.length} chunks using advanced scoring + LLM enhancement`);

    return llmRerankedChunks;
  }

  /**
   * Apply LLM-based re-ranking to improve relevance scoring
   * @param {Array} scoredChunks - Chunks with initial scores
   * @param {string} question - Original question
   * @returns {Array} LLM-enhanced re-ranked chunks
   */
  async applyLLMReranking(scoredChunks, question) {
    if (!this.langChainManager || !this.langChainManager.useModelTiering || scoredChunks.length === 0) {
      return scoredChunks;
    }

    try {
      console.log(`🧠 Applying LLM-based re-ranking to ${scoredChunks.length} chunks...`);
      
      // Prepare chunk summaries for LLM evaluation
      const chunkSummaries = scoredChunks.map((chunk, idx) => ({
        index: idx,
        content: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : ''),
        currentScore: chunk.finalScore
      }));

      const rerankingPrompt = `You are a relevance scoring specialist. Rate how relevant each chunk is to answering the user's question on a scale of 0.0 to 1.0.

USER QUESTION: ${question}

CHUNKS TO SCORE:
${chunkSummaries.map((chunk, idx) => `${idx + 1}. [Current Score: ${chunk.currentScore.toFixed(3)}] ${chunk.content}`).join('\n\n')}

INSTRUCTIONS:
1. Score each chunk based on how well it answers the question
2. Consider factual accuracy, completeness, and direct relevance
3. Return ONLY a JSON array of scores in the same order: [0.8, 0.6, 0.9, ...]
4. Use decimal values between 0.0 and 1.0

SCORES:`;

      const llmScores = await this.langChainManager.generatePreprocessing(rerankingPrompt, { timeout: 10000 });
      
      // Parse LLM scores
      let parsedScores;
      try {
        parsedScores = JSON.parse(llmScores.trim());
        if (!Array.isArray(parsedScores) || parsedScores.length !== scoredChunks.length) {
          throw new Error('Invalid score format');
        }
      } catch (parseError) {
        console.warn(`⚠️ Failed to parse LLM re-ranking scores: ${parseError.message}`);
        return scoredChunks;
      }

      // Apply LLM scores as enhancement to existing scores
      const enhancedChunks = scoredChunks.map((chunk, idx) => {
        const llmScore = Math.max(0, Math.min(1, parsedScores[idx] || chunk.finalScore));
        
        // Blend LLM score with existing composite score (70% LLM, 30% existing)
        const enhancedScore = (llmScore * 0.7) + (chunk.finalScore * 0.3);
        
        return {
          ...chunk,
          llmScore,
          finalScore: enhancedScore,
          individualScores: {
            ...chunk.individualScores,
            llmRelevance: llmScore
          }
        };
      });

      console.log(`✅ LLM re-ranking completed, enhanced ${enhancedChunks.length} chunks`);
      return enhancedChunks;

    } catch (error) {
      console.warn(`⚠️ LLM re-ranking failed: ${error.message}, using original scores`);
      return scoredChunks;
    }
  }

  /**
   * Apply cached re-ranking results to current chunks
   * @param {Array} chunks - Current chunks
   * @param {Object} cacheData - Cached re-ranking data
   * @returns {Array} Chunks with cached scores applied
   */
  applyCachedReRanking(chunks, cacheData) {
    const enhancedChunks = chunks.map(chunk => {
      const contentHash = this.hashContent(chunk.content);
      const cachedScore = cacheData.scores.find(s => s.contentHash === contentHash);
      
      if (cachedScore) {
        return {
          ...chunk,
          finalScore: cachedScore.finalScore,
          individualScores: cachedScore.individualScores,
          cached: true
        };
      }
      
      return chunk;
    });

    return enhancedChunks;
  }

  /**
   * Generate simple hash for content caching
   * @param {string} content - Content to hash
   * @returns {string} Hash string
   */
  hashContent(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Calculate multi-dimensional relevance scores for a chunk
   * @param {Object} chunk - Chunk with content and metadata
   * @param {string} question - Original question
   * @param {Array} allChunks - All chunks for diversity calculation
   * @returns {Object} Individual scores
   */
  calculateCompositeScore(chunk, question, allChunks) {
    return {
      semantic: chunk.similarity, // Original similarity score
      keyword: this.calculateKeywordScore(chunk.content, question),
      recency: this.calculateRecencyScore(chunk.metadata),
      authority: this.calculateAuthorityScore(chunk.metadata),
      diversity: this.calculateDiversityScore(chunk, allChunks),
      position: this.calculatePositionScore(chunk.metadata)
    };
  }

  /**
   * Calculate keyword matching score
   * @param {string} content - Chunk content
   * @param {string} question - Question text
   * @returns {number} Keyword score (0-1)
   */
  calculateKeywordScore(content, question) {
    const contentLower = content.toLowerCase();
    const questionLower = question.toLowerCase();

    // Extract keywords (words > 3 chars, not stop words)
    const questionWords = questionLower
      .split(/\W+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));

    if (questionWords.length === 0) return 0;

    // Count exact matches and partial matches
    let exactMatches = 0;
    let partialMatches = 0;

    questionWords.forEach(word => {
      if (contentLower.includes(word)) {
        exactMatches++;
      } else {
        // Check for partial matches (stemming-like)
        const partialMatch = questionWords.some(otherWord =>
          this.calculateLevenshteinDistance(word, otherWord) <= 2
        );
        if (partialMatch) partialMatches++;
      }
    });

    const totalMatches = exactMatches + (partialMatches * 0.5);
    return Math.min(totalMatches / questionWords.length, 1);
  }

  /**
   * Calculate recency score based on document age
   * @param {Object} metadata - Chunk metadata
   * @returns {number} Recency score (0-1)
   */
  calculateRecencyScore(metadata) {
    if (!metadata.uploadedAt) return 0.5; // Neutral score for missing data

    try {
      const uploadDate = new Date(metadata.uploadedAt);
      const now = new Date();
      const daysSinceUpload = (now - uploadDate) / (1000 * 60 * 60 * 24);

      // Prefer documents uploaded within last 30 days
      if (daysSinceUpload <= 30) return 1.0;
      if (daysSinceUpload <= 90) return 0.8;
      if (daysSinceUpload <= 365) return 0.6;

      return 0.3; // Older documents get lower score
    } catch (error) {
      return 0.5; // Neutral score on error
    }
  }

  /**
   * Calculate authority score based on metadata quality and document characteristics
   * @param {Object} metadata - Chunk metadata
   * @returns {number} Authority score (0-1)
   */
  calculateAuthorityScore(metadata) {
    let score = 0.5; // Base score

    // File size bonus (larger documents might be more comprehensive)
    if (metadata.fileSize) {
      if (metadata.fileSize > 1000000) score += 0.1; // > 1MB
      else if (metadata.fileSize > 100000) score += 0.05; // > 100KB
    }

    // Text length bonus (longer chunks might be more informative)
    if (metadata.textLength && metadata.textLength > 1000) {
      score += 0.1;
    }

    // Version bonus (later versions might be more current)
    if (metadata.version && metadata.version > 1) {
      score += 0.05;
    }

    // Language bonus (English content gets slight preference)
    if (metadata.language === 'en') {
      score += 0.05;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate diversity score to avoid redundant chunks
   * @param {Object} chunk - Current chunk
   * @param {Array} allChunks - All chunks in result set
   * @returns {number} Diversity score (0-1)
   */
  calculateDiversityScore(chunk, allChunks) {
    if (allChunks.length <= 1) return 1.0;

    let totalSimilarity = 0;
    let comparisonCount = 0;

    // Compare with other chunks from same document
    allChunks.forEach(otherChunk => {
      if (otherChunk !== chunk &&
          otherChunk.metadata.documentName === chunk.metadata.documentName) {
        const similarity = this.calculateTextSimilarity(chunk.content, otherChunk.content);
        totalSimilarity += similarity;
        comparisonCount++;
      }
    });

    if (comparisonCount === 0) return 1.0;

    const avgSimilarity = totalSimilarity / comparisonCount;

    // Lower similarity = higher diversity score
    return Math.max(0, 1 - avgSimilarity);
  }

  /**
   * Calculate position score (chunks earlier in document might be more important)
   * @param {Object} metadata - Chunk metadata
   * @returns {number} Position score (0-1)
   */
  calculatePositionScore(metadata) {
    if (!metadata.chunkIndex || !metadata.totalChunks) return 0.5;

    const position = metadata.chunkIndex / metadata.totalChunks;

    // Prefer chunks from the beginning of documents (0.0 = first chunk)
    if (position <= 0.2) return 1.0; // First 20%
    if (position <= 0.4) return 0.8; // Next 20%
    if (position <= 0.6) return 0.6; // Middle 20%

    return 0.4; // Later chunks get lower score
  }

  /**
   * Calculate weighted final score from individual scores
   * @param {Object} scores - Individual score components
   * @returns {number} Final weighted score
   */
  calculateWeightedScore(scores) {
    // Weights based on importance (sum = 1.0)
    const weights = {
      semantic: 0.35,    // Most important - original embedding similarity
      keyword: 0.25,     // Important - direct keyword matching
      recency: 0.15,     // Moderately important - newer content
      authority: 0.10,   // Less important - document quality
      diversity: 0.10,   // Less important - avoid redundancy
      position: 0.05     // Least important - chunk position
    };

    const finalScore = Object.entries(scores).reduce((total, [key, score]) => {
      return total + (score * weights[key]);
    }, 0);

    return Math.max(0, Math.min(1, finalScore));
  }

  /**
   * Calculate text similarity between two chunks (simple Jaccard similarity)
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Similarity score (0-1)
   */
  calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(word => word.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(word => word.length > 2));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate Levenshtein distance for fuzzy matching
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Edit distance
   */
  calculateLevenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Analyze question type and determine response structure
   * @param {string} question - User's question
   * @returns {Object} Question analysis with type, complexity, and structure hints
   */
  analyzeQuestionType(question) {
    const questionLower = question.toLowerCase();

    // Question type classification
    const questionTypes = {
      definition: ['what is', 'what are', 'define', 'definition of', 'meaning of'],
      how_to: ['how to', 'how do', 'steps to', 'procedure', 'process'],
      comparison: ['difference between', 'compare', 'versus', 'vs', 'better than'],
      list_categories: ['types of', 'categories', 'kinds of', 'examples of', 'list'],
      why_explain: ['why', 'explain', 'reason', 'purpose', 'cause'],
      when_where: ['when', 'where', 'schedule', 'location'],
      analysis: ['analyze', 'evaluate', 'assess', 'review']
    };

    let primaryType = 'general';
    let complexity = 'basic';

    // Determine question type
    for (const [type, keywords] of Object.entries(questionTypes)) {
      if (keywords.some(keyword => questionLower.includes(keyword))) {
        primaryType = type;
        break;
      }
    }

    // Determine complexity
    if (questionLower.includes('detailed') || questionLower.includes('comprehensive') ||
        questionLower.includes('complete') || question.split(' ').length > 8) {
      complexity = 'detailed';
    } else if (questionLower.includes('brief') || questionLower.includes('quick')) {
      complexity = 'brief';
    }

    // Determine if structured response is needed
    const needsStructure = primaryType !== 'general' ||
                          questionLower.includes('overview') ||
                          questionLower.includes('summary');

    return {
      type: primaryType,
      complexity,
      needsStructure,
      keywords: this.extractKeywordsForAnalysis(question),
      estimatedSections: this.estimateResponseSections(primaryType, complexity)
    };
  }

  /**
   * Extract keywords specifically for answer analysis
   * @param {string} question - Question text
   * @returns {Array} Important keywords for content extraction
   */
  extractKeywordsForAnalysis(question) {
    const words = question.toLowerCase().split(/\W+/);
    return words.filter(word =>
      word.length > 3 &&
      !this.isStopWord(word) &&
      !['what', 'when', 'where', 'which', 'that', 'this', 'these', 'those', 'there', 'here'].includes(word)
    );
  }

  /**
   * Estimate how many sections the response should have
   * @param {string} questionType - Type of question
   * @param {string} complexity - Complexity level
   * @returns {number} Estimated number of sections
   */
  estimateResponseSections(questionType, complexity) {
    const baseSections = {
      definition: 3, // Definition, Types, Applications
      how_to: 4,     // Overview, Steps, Tips, Examples
      comparison: 4, // Introduction, Comparison Points, Analysis, Conclusion
      list_categories: 2, // Categories + Details
      why_explain: 3, // Explanation, Reasons, Examples
      when_where: 2, // Answer + Context
      analysis: 4,   // Overview, Analysis, Findings, Recommendations
      general: 2     // Basic answer + details
    };

    const baseCount = baseSections[questionType] || 2;
    return complexity === 'detailed' ? Math.min(baseCount + 1, 5) : Math.max(baseCount - 1, 2);
  }

  /**
   * Extract comprehensive answer components from chunks
   * @param {Array} relevantChunks - Relevant document chunks
   * @param {string} question - Original question
   * @param {Object} questionAnalysis - Question type analysis
   * @returns {Object} Structured answer components
   */


  /**
   * Extract main definition or core answer
   * @param {string} text - Combined text from chunks
   * @param {string} question - Original question
   * @returns {string} Main definition or answer
   */
  extractMainDefinition(text, question) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const questionKeywords = this.extractKeywordsForAnalysis(question);

    // Find sentences with high keyword density
    const scoredSentences = sentences.map(sentence => {
      const sentenceLower = sentence.toLowerCase();
      const matches = questionKeywords.filter(keyword =>
        sentenceLower.includes(keyword.toLowerCase())
      );
      return {
        sentence: sentence.trim(),
        score: matches.length,
        length: sentence.length
      };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.length - b.length);

    if (scoredSentences.length === 0) return null;

    // Return top 2-3 sentences for comprehensive answer
    return scoredSentences.slice(0, 3).map(item => item.sentence).join(" ");
  }

  /**
   * Extract categories, types, or classifications
   * @param {string} text - Combined text
   * @param {Object} questionAnalysis - Question analysis
   * @returns {Array} List of categories found
   */
  extractCategories(text, questionAnalysis) {
    const categories = [];
    const lines = text.split('\n').filter(line => line.trim().length > 5);

    // Look for numbered or bulleted lists
    const listPatterns = [
      /^\d+\./,           // 1. 2. 3.
      /^[a-zA-Z]\./,      // a. b. c.
      /^[•\-*]\s*/,      // • - *
      /^\(\d+\)/,        // (1) (2) (3)
      /^[A-Z]\./         // A. B. C.
    ];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (listPatterns.some(pattern => pattern.test(trimmed))) {
        categories.push(trimmed.replace(/^[•\-*\d\w]\.\s*/, '').trim());
      }
    });

    // Also look for section headers that indicate categories
    const categoryKeywords = ['types', 'categories', 'kinds', 'classes', 'groups', 'classification'];
    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      if (categoryKeywords.some(keyword => lowerLine.includes(keyword)) &&
          line.length < 100) {
        categories.push(line.trim());
      }
    });

    return [...new Set(categories)]; // Remove duplicates
  }

  /**
   * Extract examples and illustrations
   * @param {string} text - Combined text
   * @param {Object} questionAnalysis - Question analysis
   * @returns {Array} Examples found in text
   */
  extractExamples(text, questionAnalysis) {
    const examples = [];
    const sentences = text.split(/[.!?]+/);

    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      if (trimmed.length > 20 && trimmed.length < 200) {
        const lowerSentence = trimmed.toLowerCase();

        // Look for example indicators
        if (lowerSentence.includes('example') ||
            lowerSentence.includes('such as') ||
            lowerSentence.includes('like') ||
            lowerSentence.includes('including') ||
            lowerSentence.includes('e.g.') ||
            lowerSentence.includes('for instance')) {
          examples.push(trimmed);
        }
      }
    });

    return examples.slice(0, 5); // Limit examples
  }

  /**
   * Extract applications or use cases
   * @param {string} text - Combined text
   * @param {Object} questionAnalysis - Question analysis
   * @returns {Array} Applications found
   */
  extractApplications(text, questionAnalysis) {
    const applications = [];
    const sentences = text.split(/[.!?]+/);

    const applicationKeywords = [
      'used for', 'applied in', 'useful for', 'helps with', 'employed in',
      'utilized for', 'beneficial for', 'effective for', 'suitable for',
      'appropriate for', 'designed for', 'intended for'
    ];

    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      const lowerSentence = trimmed.toLowerCase();

      if (applicationKeywords.some(keyword => lowerSentence.includes(keyword))) {
        applications.push(trimmed);
      }
    });

    return applications.slice(0, 4);
  }

  /**
   * Extract key points and important information
   * @param {string} text - Combined text
   * @param {string} question - Original question
   * @param {Object} questionAnalysis - Question analysis
   * @returns {Array} Key points
   */
  extractKeyPoints(text, question, questionAnalysis) {
    const keyPoints = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);

    const questionKeywords = this.extractKeywordsForAnalysis(question);

    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      const lowerSentence = trimmed.toLowerCase();

      // Check relevance to question
      const matches = questionKeywords.filter(keyword =>
        lowerSentence.includes(keyword.toLowerCase())
      );

      if (matches.length > 0) {
        keyPoints.push({
          point: trimmed,
          relevance: matches.length,
          length: trimmed.length
        });
      }
    });

    // Sort by relevance and return top points
    return keyPoints
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 8)
      .map(item => item.point);
  }

  /**
   * Extract supporting details from metadata and chunks
   * @param {Array} relevantChunks - Relevant chunks with metadata
   * @param {Object} questionAnalysis - Question analysis
   * @returns {Object} Supporting details and context
   */
  extractSupportingDetails(relevantChunks, questionAnalysis) {
    const details = {
      sources: relevantChunks.length,
      topDocuments: this.getTopDocuments(relevantChunks),
      confidence: this.calculateAverageConfidence(relevantChunks),
      topics: this.extractTopicsFromChunks(relevantChunks)
    };

    return details;
  }

  /**
   * Get most relevant document names
   * @param {Array} chunks - Relevant chunks
   * @returns {Array} Top document names
   */
  getTopDocuments(chunks) {
    const docCount = {};
    chunks.forEach(chunk => {
      const docName = chunk.metadata.documentName || 'Unknown';
      docCount[docName] = (docCount[docName] || 0) + 1;
    });

    return Object.entries(docCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name]) => name);
  }

  /**
   * Calculate average confidence from chunks
   * @param {Array} chunks - Relevant chunks
   * @returns {number} Average confidence
   */
  calculateAverageConfidence(chunks) {
    if (chunks.length === 0) return 0;

    const totalConfidence = chunks.reduce((sum, chunk) => {
      return sum + (chunk.finalScore || chunk.similarity || 0);
    }, 0);

    return totalConfidence / chunks.length;
  }

  /**
   * Extract main topics from chunks
   * @param {Array} chunks - Relevant chunks
   * @returns {Array} Main topics identified
   */
  extractTopicsFromChunks(chunks) {
    const topics = new Set();

    chunks.forEach(chunk => {
      // Extract potential topics from chunk content (simple approach)
      const words = chunk.content.toLowerCase().split(/\W+/).filter(word =>
        word.length > 4 && !this.isStopWord(word)
      );

      // Add words that appear frequently as potential topics
      words.forEach(word => {
        if (words.filter(w => w === word).length > 1) {
          topics.add(word);
        }
      });
    });

    return Array.from(topics).slice(0, 5);
  }

  /**
   * Generate conclusion based on question analysis
   * @param {Object} questionAnalysis - Question analysis
   * @returns {string} Generated conclusion
   */
  generateConclusion(questionAnalysis) {
    const conclusions = {
      definition: "This comprehensive overview provides a clear understanding of the topic and its various aspects.",
      how_to: "Following these steps and best practices will help you achieve the desired results effectively.",
      comparison: "Each option has its strengths and is suitable for different scenarios and requirements.",
      list_categories: "These categories provide a comprehensive framework for understanding the different aspects and applications.",
      analysis: "This analysis offers valuable insights for making informed decisions and taking appropriate actions.",
      general: "This information provides a solid foundation for understanding and working with the topic."
    };

    return conclusions[questionAnalysis.type] || conclusions.general;
  }

  /**
   * Build structured answer based on components and question type
   * @param {string} question - Original question
   * @param {Object} components - Answer components
   * @param {Object} questionAnalysis - Question analysis
   * @returns {string} Structured answer
   */
  buildStructuredAnswer(question, components, questionAnalysis) {
    const sections = [];

    // Title/Header - always include this
    const title = this.generateAnswerTitle(question, questionAnalysis);
    if (title) {
      sections.push(`🔍 ${title}`);
    }

    // Main definition/introduction
    if (components.mainDefinition && components.mainDefinition.trim().length > 0) {
      sections.push(`📖 **Definition & Purpose**\n${components.mainDefinition.trim()}`);
    }

    // Categories/Types section
    if (components.categories && components.categories.length > 0) {
      const validCategories = components.categories.filter(cat => cat && cat.trim().length > 0);
      if (validCategories.length > 0) {
        const categoryTitle = this.getCategoriesTitle(questionAnalysis) || "Key Categories";
        sections.push(`🔸 **${categoryTitle}**\n${
          validCategories.map((cat, i) => `${i + 1}. ${cat.trim()}`).join('\n')
        }`);
      }
    }

    // Key points section
    if (components.keyPoints && components.keyPoints.length > 0) {
      const validKeyPoints = components.keyPoints.filter(point => point && point.trim().length > 0);
      if (validKeyPoints.length > 0) {
        sections.push(`📋 **Key Points**\n${
          validKeyPoints.map(point => `• ${point.trim()}`).join('\n')
        }`);
      }
    }

    // Examples section
    if (components.examples && components.examples.length > 0) {
      const validExamples = components.examples.filter(example => example && example.trim().length > 0);
      if (validExamples.length > 0) {
        sections.push(`💡 **Examples**\n${
          validExamples.map(example => `• ${example.trim()}`).join('\n')
        }`);
      }
    }

    // Applications section
    if (components.applications && components.applications.length > 0) {
      const validApplications = components.applications.filter(app => app && app.trim().length > 0);
      if (validApplications.length > 0) {
        sections.push(`🎯 **Applications**\n${
          validApplications.map(app => `• ${app.trim()}`).join('\n')
        }`);
      }
    }

    // Conclusion
    if (components.conclusion && components.conclusion.trim().length > 0) {
      sections.push(`🔹 **Conclusion**\n${components.conclusion.trim()}`);
    }

    // Add source information
    if (components.supportingDetails && components.supportingDetails.sources > 0) {
      sections.push(`\n📚 *Information sourced from ${components.supportingDetails.sources} relevant sections across ${components.supportingDetails.topDocuments.length} documents*`);
    }

    // Ensure we have at least a basic response
    if (sections.length === 0) {
      return `🔍 ${title || "Information Found"}\n\nI found relevant information in the documents but had trouble organizing it into a structured format.`;
    }

    return sections.join('\n\n');
  }

  /**
   * Generate appropriate title for the answer
   * @param {string} question - Original question
   * @param {Object} questionAnalysis - Question analysis
   * @returns {string} Answer title
   */
  generateAnswerTitle(question, questionAnalysis) {
    const titles = {
      definition: "Complete Definition and Overview",
      how_to: "Step-by-Step Guide and Instructions",
      comparison: "Detailed Comparison and Analysis",
      list_categories: "Comprehensive Categories and Types",
      why_explain: "Detailed Explanation and Analysis",
      when_where: "Complete Information and Context",
      analysis: "In-Depth Analysis and Insights",
      general: "Comprehensive Answer and Information"
    };

    return titles[questionAnalysis.type] || titles.general;
  }

  /**
   * Get appropriate title for categories section
   * @param {Object} questionAnalysis - Question analysis
   * @returns {string} Categories section title
   */
  getCategoriesTitle(questionAnalysis) {
    const titles = {
      definition: "Major Categories and Types",
      how_to: "Step-by-Step Process",
      comparison: "Comparison Criteria",
      list_categories: "Available Categories",
      analysis: "Analysis Framework",
      general: "Key Categories"
    };

    return titles[questionAnalysis.type] || titles.general;
  }

  /**
   * Smart truncation that preserves section structure
   * @param {string} answer - Full answer
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated but structured answer
   */
  smartTruncateAnswer(answer, maxLength) {
    if (answer.length <= maxLength) return answer;

    const sections = answer.split('\n\n');
    let result = '';
    let currentLength = 0;

    for (const section of sections) {
      if (currentLength + section.length + 2 > maxLength) {
        // If adding this section would exceed limit, truncate it
        const remainingSpace = maxLength - currentLength - 3;
        if (remainingSpace > 20) {
          result += section.substring(0, remainingSpace) + '...';
        }
        break;
      }

      result += (result ? '\n\n' : '') + section;
      currentLength = result.length;
    }

    return result;
  }





  /**
   * Perform mixed retrieval combining multiple search strategies
   * @param {number[]} questionEmbedding - Question embedding vector
   * @param {string} originalQuestion - Original question text
   * @returns {Object} Combined search results from multiple strategies
   */
  async performMixedRetrieval(questionEmbedding, originalQuestion, tenant = null) {
    const retrievalPromises = [
      // 1. Semantic search (existing)
      (tenant && this.vectorStore.searchByTenant ? this.vectorStore.searchByTenant(questionEmbedding, this.maxResults * 2, tenant) : this.vectorStore.search(questionEmbedding, this.maxResults * 2)).then(results => ({
        type: 'semantic',
        results,
        weight: 0.4
      })),

      // 2. HyDE (Hypothetical Document Embeddings) search
      this.performHyDESearch(originalQuestion).then(results => ({
        type: 'hyde',
        results,
        weight: 0.3
      })),

      // 3. Keyword search
      this.performKeywordSearch(originalQuestion).then(results => ({
        type: 'keyword',
        results,
        weight: 0.2
      })),

      // 4. Metadata-filtered search
      this.performMetadataSearch(questionEmbedding, originalQuestion, tenant).then(results => ({
        type: 'metadata',
        results,
        weight: 0.1
      }))
    ];

    try {
      const retrievalResults = await Promise.all(retrievalPromises);
      console.log(`🔄 Mixed retrieval completed: ${retrievalResults.map(r => `${r.type}(${r.results.documents?.[0]?.length || 0})`).join(', ')}`);

      // Combine results using Reciprocal Rank Fusion (RRF)
      const combinedResults = this.applyReciprocalRankFusion(retrievalResults);

      return combinedResults;
    } catch (error) {
      console.warn(`⚠️ Mixed retrieval partially failed, falling back to semantic search: ${error.message}`);
      // Fallback to semantic search only
      const semanticResults = tenant && this.vectorStore.searchByTenant
        ? await this.vectorStore.searchByTenant(questionEmbedding, this.maxResults, tenant)
        : await this.vectorStore.search(questionEmbedding, this.maxResults);
      return {
        documents: semanticResults.documents || [[]],
        distances: semanticResults.distances || [[]],
        metadatas: semanticResults.metadatas || [[]],
        ids: semanticResults.ids || [[]]
      };
    }
  }

  /**
   * Perform HyDE (Hypothetical Document Embeddings) search
   * @param {string} question - Question text
   * @returns {Promise<Object>} HyDE search results
   */
  async performHyDESearch(question) {
    try {
      // Disable HyDE in production to save API quota - it's expensive and not always necessary
      if (process.env.NODE_ENV === 'production') {
        console.log("🔄 HyDE disabled in production to save API quota, using semantic search only");
        return { documents: [[]], distances: [[]], metadatas: [[]], ids: [[]] };
      }

      // Check if LLM is available for HyDE
      if (!this.langChainManager || !this.langChainManager.useModelTiering) {
        console.log("⚠️ HyDE requires LLM with model tiering, falling back to semantic search");
        return { documents: [[]], distances: [[]], metadatas: [[]], ids: [[]] };
      }

      console.log(`🔮 Generating hypothetical document for question: "${question.substring(0, 50)}..."`);
      
      // Generate hypothetical document using preprocessing model
      const hydePrompt = `Generate a hypothetical document that would contain the answer to this question. Write it as if you were creating a comprehensive document that answers the question thoroughly.

Question: ${question}

Generate a hypothetical document that would contain the answer. Write it in a natural, informative style as if it were part of a larger document. Include relevant details, examples, and context that would help answer the question.

Hypothetical Document:`;

      const hypotheticalDocument = await this.langChainManager.generatePreprocessing(hydePrompt, { timeout: 15000 });
      
      if (!hypotheticalDocument || hypotheticalDocument.trim().length < 50) {
        console.warn("⚠️ HyDE generated empty or too short document, falling back to semantic search");
        return { documents: [[]], distances: [[]], metadatas: [[]], ids: [[]] };
      }

      console.log(`✅ HyDE document generated (${hypotheticalDocument.length} chars), creating embedding...`);
      
      // Generate embedding for the hypothetical document
      const hydeEmbedding = await this.embeddingService.generateSingleEmbedding(hypotheticalDocument);
      
      // Search using the hypothetical document embedding
      const hydeResults = tenant && this.vectorStore.searchByTenant
        ? await this.vectorStore.searchByTenant(hydeEmbedding, this.maxResults * 2, tenant)
        : await this.vectorStore.search(hydeEmbedding, this.maxResults * 2);
      
      console.log(`🔮 HyDE search completed: ${hydeResults.documents?.[0]?.length || 0} results`);
      
      return hydeResults;
      
    } catch (error) {
      console.warn(`⚠️ HyDE search failed: ${error.message}, falling back to semantic search`);
      return { documents: [[]], distances: [[]], metadatas: [[]], ids: [[]] };
    }
  }

  /**
   * Perform keyword-based search
   * @param {string} question - Question text
   * @returns {Promise<Object>} Keyword search results
   */
  async performKeywordSearch(question) {
    try {
      // Extract keywords from question
      const keywords = this.extractKeywords(question);

      if (keywords.length === 0) {
        return { documents: [[]], distances: [[]], metadatas: [[]], ids: [[]] };
      }

      // Search for each keyword and combine results
      const keywordPromises = keywords.map(keyword =>
        tenant && this.vectorStore.searchDocumentsByTenant
          ? this.vectorStore.searchDocumentsByTenant(keyword, tenant)
          : this.vectorStore.searchDocuments(keyword)
      );

      const keywordResults = await Promise.all(keywordPromises);

      // Flatten and deduplicate results
      const allResults = keywordResults.flat();
      const uniqueResults = this.deduplicateSearchResults(allResults);

      // Convert to vector store format for consistency
      return this.convertToVectorStoreFormat(uniqueResults);
    } catch (error) {
      console.warn(`⚠️ Keyword search failed: ${error.message}`);
      return { documents: [[]], distances: [[]], metadatas: [[]], ids: [[]] };
    }
  }

  /**
   * Perform metadata-filtered search
   * @param {number[]} questionEmbedding - Question embedding
   * @param {string} question - Question text
   * @returns {Promise<Object>} Metadata-filtered search results
   */
  async performMetadataSearch(questionEmbedding, question, tenant = null) {
    try {
      // Determine filters based on question analysis
      const filters = this.analyzeQuestionForFilters(question);

      // Perform filtered search
      const filteredResults = tenant && this.vectorStore.searchByTenant
        ? await this.vectorStore.searchByTenant(questionEmbedding, this.maxResults, tenant, filters)
        : await this.vectorStore.searchWithFilters(questionEmbedding, filters);

      // Convert to vector store format
      return this.convertToVectorStoreFormat(filteredResults);
    } catch (error) {
      console.warn(`⚠️ Metadata search failed: ${error.message}`);
      return { documents: [[]], distances: [[]], metadatas: [[]], ids: [[]] };
    }
  }

  /**
   * Extract keywords from question for keyword search
   * @param {string} question - Question text
   * @returns {string[]} Array of keywords
   */
  extractKeywords(question) {
    const words = question.toLowerCase().split(/\W+/);

    // Filter out stop words and short words
    const keywords = words.filter(word =>
      word.length > 3 &&
      !this.isStopWord(word) &&
      !['what', 'when', 'where', 'which', 'that', 'this', 'these', 'those'].includes(word)
    );

    // Return top keywords (limit to prevent too many searches)
    return keywords.slice(0, 3);
  }

  /**
   * Analyze question to determine appropriate metadata filters
   * @param {string} question - Question text
   * @returns {Object} Filter criteria
   */
  analyzeQuestionForFilters(question) {
    const questionLower = question.toLowerCase();
    const filters = {};

    // File type filters
    if (questionLower.includes('pdf') || questionLower.includes('document')) {
      filters.fileType = 'pdf';
    } else if (questionLower.includes('code') || questionLower.includes('script')) {
      filters.fileType = 'txt'; // Assuming code files are text
    }

    // Language filters
    if (questionLower.includes('english') || questionLower.includes('translate')) {
      filters.language = 'en';
    }

    // Recency filters
    if (questionLower.includes('recent') || questionLower.includes('latest') || questionLower.includes('new')) {
      // Prefer documents from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      filters.minUploadDate = thirtyDaysAgo.toISOString();
    }

    // Size filters (for technical questions, prefer larger documents)
    if (questionLower.includes('detailed') || questionLower.includes('comprehensive')) {
      filters.minFileSize = 50000; // 50KB minimum
    }

    return filters;
  }

  /**
   * Apply Reciprocal Rank Fusion (RRF) to combine multiple retrieval results
   * @param {Array} retrievalResults - Array of retrieval result objects
   * @returns {Object} Combined results
   */
  applyReciprocalRankFusion(retrievalResults) {
    const k = 60; // RRF parameter (commonly 60)
    const documentScores = new Map();

    // Process each retrieval method
    retrievalResults.forEach(({ results, weight }) => {
      if (!results.documents || !results.documents[0]) return;

      results.documents[0].forEach((doc, rank) => {
        if (!doc) return;

        const docId = results.ids?.[0]?.[rank] || `doc_${rank}`;
        const currentScore = documentScores.get(docId) || 0;
        const rrfScore = weight * (1 / (k + rank + 1));

        documentScores.set(docId, currentScore + rrfScore);
      });
    });

    // Sort by combined RRF score
    const sortedDocs = Array.from(documentScores.entries())
      .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
      .slice(0, this.maxResults);

    // Reconstruct results in vector store format
    const combinedResults = {
      documents: [[]],
      distances: [[]],
      metadatas: [[]],
      ids: [[]]
    };

    // Find original document data from the retrieval results
    sortedDocs.forEach(([docId, score]) => {
      // Find this document in the original results
      for (const { results } of retrievalResults) {
        if (!results.documents?.[0] || !results.ids?.[0]) continue;

        const docIndex = results.ids[0].findIndex(id => id === docId);
        if (docIndex !== -1) {
          combinedResults.documents[0].push(results.documents[0][docIndex]);
          combinedResults.distances[0].push(results.distances?.[0]?.[docIndex] || 1);
          combinedResults.metadatas[0].push(results.metadatas?.[0]?.[docIndex] || {});
          combinedResults.ids[0].push(docId);
          break;
        }
      }
    });

    return combinedResults;
  }

  /**
   * Remove duplicate results from keyword search
   * @param {Array} results - Search results array
   * @returns {Array} Deduplicated results
   */
  deduplicateSearchResults(results) {
    const seen = new Set();
    return results.filter(result => {
      const key = `${result.documentName || 'unknown'}_${result.chunkIndex || 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Convert search results to vector store format for consistency
   * @param {Array|Object} results - Search results (can be array or vector store format)
   * @returns {Object} Vector store format results
   */
  convertToVectorStoreFormat(results) {
    // Handle empty/null results
    if (!results) {
      return { documents: [[]], distances: [[]], metadatas: [[]], ids: [[]] };
    }

    // If results is already in vector store format (has documents, distances, metadatas, ids)
    if (results.documents && results.distances && results.metadatas && results.ids) {
      return results;
    }

    // Handle array of results (from keyword search, etc.)
    if (Array.isArray(results)) {
      if (results.length === 0) {
        return { documents: [[]], distances: [[]], metadatas: [[]], ids: [[]] };
      }

      return {
        documents: [results.map(r => r.contentPreview || r.content || '')],
        distances: [results.map(() => 0.5)], // Default distance for non-semantic results
        metadatas: [results.map(r => ({
          documentName: r.documentName || 'unknown',
          chunkIndex: r.chunkIndex || 0,
          fileType: r.fileType || 'unknown',
          fileSize: r.fileSize || 0,
          version: r.version || 1,
          uploadedAt: r.uploadedAt || null
        }))],
        ids: [results.map((r, idx) => r.id || `mixed_${idx}`)]
      };
    }

    // Fallback for unexpected format
    console.warn('⚠️ Unexpected results format in convertToVectorStoreFormat:', typeof results);
    return { documents: [[]], distances: [[]], metadatas: [[]], ids: [[]] };
  }

  /**
   * Phase 2: LLM-based re-ranking of parent chunks using Gemini 1.5 Flash
   * @param {Array} parentChunks - List of parent chunks to re-rank
   * @param {string} question - User's original question
   * @returns {Array} Re-ranked chunks sorted by relevance score (descending)
   */
  async _llmReRank(parentChunks, question) {
    try {
      // Disable LLM re-ranking in production to save API quota - it's expensive and not always necessary
      if (process.env.NODE_ENV === 'production') {
        console.log(`🔄 LLM re-ranking disabled in production to save API quota, using original order`);
        return parentChunks;
      }

      console.log(`🧠 Phase 2: LLM re-ranking ${parentChunks.length} parent chunks...`);

      if (!this.langChainManager || !this.langChainManager.useModelTiering) {
        console.warn('⚠️ LLM not available for re-ranking, returning original order');
        return parentChunks;
      }

      if (parentChunks.length === 0) {
        return parentChunks;
      }

      // Create scoring prompts for each chunk in parallel
      const scoringPromises = parentChunks.map(async (chunk, index) => {
        try {
          const scoringPrompt = `You are a relevance scoring specialist. Rate how relevant this document chunk is to answering the user's question on a scale of 1-10.

USER QUESTION: ${question}

DOCUMENT CHUNK:
${chunk.content.substring(0, 1000)}${chunk.content.length > 1000 ? '...' : ''}

SCORING CRITERIA:
- 10: Directly answers the question with specific, relevant information
- 8-9: Contains highly relevant information that significantly helps answer the question
- 6-7: Contains moderately relevant information that partially helps answer the question
- 4-5: Contains some relevant information but limited usefulness
- 1-3: Contains minimal or no relevant information for answering the question

Return ONLY a single number from 1-10 representing the relevance score.`;

          const score = await this.langChainManager.generatePreprocessing(scoringPrompt, { timeout: 10000 });
          
          // Parse the score - handle various response formats
          let parsedScore = 5; // Default neutral score
          
          if (score) {
            const scoreMatch = score.match(/\b([1-9]|10)\b/);
            if (scoreMatch) {
              parsedScore = parseInt(scoreMatch[1]);
            }
          }

          console.log(`📊 Chunk ${index + 1} scored: ${parsedScore}/10`);
          
          return {
            ...chunk,
            llmScore: parsedScore,
            originalIndex: index
          };
        } catch (error) {
          console.warn(`⚠️ Failed to score chunk ${index + 1}: ${error.message}`);
          return {
            ...chunk,
            llmScore: 5, // Default neutral score on error
            originalIndex: index
          };
        }
      });

      // Execute all scoring calls in parallel
      const scoredChunks = await Promise.all(scoringPromises);
      
      // Sort chunks by LLM score in descending order
      const reRankedChunks = scoredChunks.sort((a, b) => b.llmScore - a.llmScore);
      
      console.log(`✅ LLM re-ranking complete. Top scores: ${reRankedChunks.slice(0, 3).map(c => `${c.llmScore}/10`).join(', ')}`);
      
      return reRankedChunks;
      
    } catch (error) {
      console.error('❌ LLM re-ranking failed:', error.message);
      console.log('🔄 Returning original chunk order');
      return parentChunks;
    }
  }

  /**
   * Phase 3: Build narrative context using linked list metadata
   * Takes the top-ranked chunk and fetches its adjacent chunks to create richer context
   * @param {Array} reRankedChunks - Array of re-ranked chunks (top chunk is first)
   * @param {string} question - Original question
   * @returns {Object} Enhanced context with narrative flow
   */
  async _buildNarrativeContext(reRankedChunks, question, tenant = null) {
    try {
      if (!reRankedChunks || reRankedChunks.length === 0) {
        console.log('⚠️ No chunks available for narrative context building');
        return {
          primaryChunk: null,
          previousChunk: null,
          nextChunk: null,
          narrativeContext: '',
          contextMetadata: {
            narrativeEnabled: false,
            reason: 'no_chunks_available'
          }
        };
      }

      const topChunk = reRankedChunks[0];
      console.log(`🔗 Phase 3: Building narrative context for top chunk: ${topChunk.id || 'unknown'}`);

      // Check if the chunk has linked list metadata
      if (!topChunk.metadata || !topChunk.metadata.linked_list_enabled) {
        console.log('⚠️ Top chunk does not have linked list metadata, skipping narrative context');
        return {
          primaryChunk: topChunk,
          previousChunk: null,
          nextChunk: null,
          narrativeContext: topChunk.content,
          contextMetadata: {
            narrativeEnabled: false,
            reason: 'no_linked_list_metadata',
            chunkId: topChunk.id
          }
        };
      }

      let previousChunk = null;
      let nextChunk = null;
      let narrativeContext = topChunk.content;

      // Fetch previous chunk if available
      if (topChunk.metadata.previous_chunk_id) {
        try {
          console.log(`🔍 Fetching previous chunk: ${topChunk.metadata.previous_chunk_id}`);
          previousChunk = await this._fetchChunkById(topChunk.metadata.previous_chunk_id, tenant);
          
          if (previousChunk) {
            console.log(`✅ Retrieved previous chunk: ${previousChunk.id} (${previousChunk.content.length} chars)`);
            // Prepend previous chunk content with separator
            narrativeContext = `[Previous Context]\n${previousChunk.content}\n\n[Main Context]\n${narrativeContext}`;
          } else {
            console.log(`⚠️ Previous chunk not found: ${topChunk.metadata.previous_chunk_id}`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to fetch previous chunk: ${error.message}`);
        }
      }

      // Fetch next chunk if available
      if (topChunk.metadata.next_chunk_id) {
        try {
          console.log(`🔍 Fetching next chunk: ${topChunk.metadata.next_chunk_id}`);
          nextChunk = await this._fetchChunkById(topChunk.metadata.next_chunk_id, tenant);
          
          if (nextChunk) {
            console.log(`✅ Retrieved next chunk: ${nextChunk.id} (${nextChunk.content.length} chars)`);
            // Append next chunk content with separator
            narrativeContext += `\n\n[Following Context]\n${nextChunk.content}`;
          } else {
            console.log(`⚠️ Next chunk not found: ${topChunk.metadata.next_chunk_id}`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to fetch next chunk: ${error.message}`);
        }
      }

      // Calculate context statistics
      const contextStats = {
        primaryChunkLength: topChunk.content.length,
        previousChunkLength: previousChunk ? previousChunk.content.length : 0,
        nextChunkLength: nextChunk ? nextChunk.content.length : 0,
        totalContextLength: narrativeContext.length,
        contextExpansionRatio: narrativeContext.length / topChunk.content.length
      };

      console.log(`📊 Narrative context built: ${contextStats.totalContextLength} chars (${contextStats.contextExpansionRatio.toFixed(2)}x expansion)`);

      return {
        primaryChunk: topChunk,
        previousChunk,
        nextChunk,
        narrativeContext,
        contextMetadata: {
          narrativeEnabled: true,
          chunksRetrieved: [previousChunk, nextChunk].filter(Boolean).length,
          contextStats,
          linkedListMetadata: {
            previousChunkId: topChunk.metadata.previous_chunk_id,
            nextChunkId: topChunk.metadata.next_chunk_id,
            positionInDocument: topChunk.metadata.position_in_document,
            totalChunksInDocument: topChunk.metadata.total_chunks_in_document
          }
        }
      };

    } catch (error) {
      console.error('❌ Failed to build narrative context:', error.message);
      
      // Return fallback with just the primary chunk
      return {
        primaryChunk: reRankedChunks[0] || null,
        previousChunk: null,
        nextChunk: null,
        narrativeContext: reRankedChunks[0]?.content || '',
        contextMetadata: {
          narrativeEnabled: false,
          reason: 'error',
          error: error.message
        }
      };
    }
  }

  /**
   * Helper method to fetch a chunk by its ID from DocumentStore
   * @param {string} chunkId - The chunk ID to fetch
   * @param {Object} tenant - Tenant information for isolation
   * @returns {Object|null} The chunk object or null if not found
   */
  async _fetchChunkById(chunkId, tenant = null) {
    try {
      if (!chunkId || typeof chunkId !== 'string') {
        return null;
      }

      // Try to fetch from DocumentStore first (for parent chunks)
      if (this.documentStore) {
        const parentChunk = this.documentStore.getParentChunk(chunkId, tenant);
        if (parentChunk) {
          return {
            id: chunkId,
            content: parentChunk.content,
            metadata: parentChunk.metadata
          };
        }
      }

      // For child chunks or if not found in DocumentStore, 
      // we would need to implement a child chunk store or search mechanism
      // For now, return null to indicate chunk not found
      console.log(`⚠️ Chunk ${chunkId} not found in DocumentStore`);
      return null;

    } catch (error) {
      console.error(`❌ Error fetching chunk ${chunkId}:`, error.message);
      return null;
    }
  }

  /**
   * Phase 1: Perform hierarchical retrieval using child chunks to find parent chunks
   * @param {Object} searchResults - Results from vector search (child chunks)
   * @param {string} question - Original question
   * @param {Object} tenant - Tenant information for isolation
   * @returns {Array} Parent chunks retrieved via DocumentStore
   */
  async performHierarchicalRetrieval(searchResults, question, tenant = null) {
    try {
      console.log('🔗 Phase 1: Performing hierarchical retrieval...');
      
      if (!this.documentStore) {
        console.warn('⚠️ DocumentStore not available, falling back to child chunks');
        return await this.processMixedSearchResults(searchResults, question);
      }

      if (!searchResults.documents || !searchResults.documents[0]) {
        console.log('⚠️ No child chunks found for hierarchical retrieval');
        return [];
      }

      const childChunks = searchResults.documents[0];
      const childMetadatas = searchResults.metadatas?.[0] || [];
      const childDistances = searchResults.distances?.[0] || [];

      console.log(`📋 Found ${childChunks.length} child chunks, extracting parent_ids...`);

      // Extract unique parent_ids from child chunk metadata
      const parentIds = new Set();
      const childToParentMap = new Map(); // Map child index to parent_id for tracking

      childMetadatas.forEach((metadata, index) => {
        const parentId = metadata.parent_id;
        if (parentId) {
          parentIds.add(parentId);
          childToParentMap.set(index, parentId);
          console.log(`🔗 Child chunk ${index} → Parent ${parentId}`);
        } else {
          console.warn(`⚠️ Child chunk ${index} missing parent_id`);
        }
      });

      if (parentIds.size === 0) {
        console.warn('⚠️ No parent_ids found in child chunks, falling back to child chunks');
        return await this.processMixedSearchResults(searchResults, question);
      }

      console.log(`📦 Retrieving ${parentIds.size} unique parent chunks from DocumentStore...`);

      // Fetch parent chunks from DocumentStore
      const parentChunks = [];
      const parentIdArray = Array.from(parentIds);

      for (const parentId of parentIdArray) {
        try {
          const parentChunk = this.documentStore.getParentChunk(parentId, tenant);
          if (parentChunk) {
            parentChunks.push({
              content: parentChunk.content,
              metadata: {
                ...parentChunk.metadata,
                parentId: parentId,
                retrievalMethod: 'hierarchical',
                childChunksCount: Array.from(childToParentMap.values()).filter(id => id === parentId).length
              }
            });
            console.log(`✅ Retrieved parent chunk ${parentId}: ${parentChunk.content.length} chars`);
          } else {
            console.warn(`⚠️ Parent chunk ${parentId} not found in DocumentStore`);
          }
        } catch (error) {
          console.error(`❌ Error retrieving parent chunk ${parentId}:`, error.message);
        }
      }

      if (parentChunks.length === 0) {
        console.warn('⚠️ No parent chunks retrieved, falling back to child chunks');
        return await this.processMixedSearchResults(searchResults, question);
      }

      console.log(`✅ Hierarchical retrieval complete: ${parentChunks.length} parent chunks retrieved`);
      
      // Sort parent chunks by relevance (based on number of child chunks that pointed to them)
      parentChunks.sort((a, b) => b.metadata.childChunksCount - a.metadata.childChunksCount);

      return parentChunks;

    } catch (error) {
      console.error('❌ Hierarchical retrieval failed:', error.message);
      console.log('🔄 Falling back to child chunk processing...');
      return await this.processMixedSearchResults(searchResults, question);
    }
  }

  /**
   * Process mixed search results (replacement for processSearchResults)
   * @param {Object} searchResults - Combined search results
   * @param {string} question - Original question
   * @returns {Array} Filtered and re-ranked relevant chunks
   */
  async processMixedSearchResults(searchResults, question) {
    if (!searchResults.documents || !searchResults.documents[0]) {
      return [];
    }

    const chunks = searchResults.documents[0];
    const distances = searchResults.distances?.[0] || [];
    const metadatas = searchResults.metadatas?.[0] || [];

    // Filter chunks based on similarity threshold and question relevance
    const relevantChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const distance = distances[i] || 1;
      const similarity = 1 - distance; // Convert distance to similarity

      // For production fallback (when hierarchical retrieval fails), be very lenient
      // Accept all chunks with reasonable distance, skip only very poor matches
      if (distance > 5.0) { // Much more lenient threshold
        continue;
      }

      // For fallback mode, skip strict relevance check or make it very lenient
      const isRelevant = this.isChunkRelevantToQuestion(chunk, question) || distance < 2.0;

      if (isRelevant) {
        relevantChunks.push({
          content: chunk,
          similarity,
          metadata: metadatas[i] || {},
          index: i,
          retrievalMethod: 'mixed_fallback' // Mark as fallback retrieval result
        });
      }
    }

    // Apply advanced re-ranking system
    const reRankedChunks = await this.applyReRanking(relevantChunks, question);

    return reRankedChunks.slice(0, this.maxResults);
  }

  /**
   * Check if a chunk is relevant to the question
   * @param {string} chunk - Document chunk
   * @param {string} question - User's question
   * @returns {boolean} Whether chunk is relevant
   */
  isChunkRelevantToQuestion(chunk, question) {
    if (!chunk || !question) return false;

    const chunkLower = chunk.toLowerCase();
    const questionLower = question.toLowerCase();

    // Extract keywords from question (words longer than 3 characters)
    const questionWords = questionLower
      .split(/\W+/)
      .filter(word => word.length > 2) // Shorter words too
      .filter(word => !this.isStopWord(word));

    if (questionWords.length === 0) return true; // If no keywords, accept the chunk

    // Check if chunk contains significant question keywords
    const matchingWords = questionWords.filter(word => chunkLower.includes(word));
    const matchRatio = matchingWords.length / Math.max(questionWords.length, 1);

    return matchRatio >= 0.1; // Much more lenient - at least 10% of question words should match
  }

  /**
   * Check if a word is a stop word
   * @param {string} word - Word to check
   * @returns {boolean} Whether word is a stop word
   */
  isStopWord(word) {
    const stopWords = new Set([
      'what', 'when', 'where', 'which', 'that', 'this', 'these', 'those',
      'with', 'from', 'into', 'onto', 'upon', 'over', 'under', 'above',
      'below', 'between', 'among', 'through', 'during', 'before', 'after',
      'since', 'until', 'while', 'because', 'although', 'though', 'even',
      'such', 'like', 'than', 'then', 'here', 'there', 'when', 'where',
      'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
      'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than', 'too',
      'very', 'can', 'will', 'just', 'should', 'now', 'about', 'get', 'got'
    ]);

    return stopWords.has(word.toLowerCase());
  }

  /**
   * Capitalize the first letter of each sentence in the text
   * @param {string} text - Text to capitalize
   * @returns {string} Text with properly capitalized sentences
   */
  capitalizeSentences(text) {
    if (!text || typeof text !== 'string') return text;

    // Split text into sentences using regex that handles various punctuation
    const sentences = text.split(/([.!?]+(?:\s|$))/);

    // Process each sentence and punctuation pair
    const capitalized = sentences.map((part, index) => {
      // If this is a sentence (not punctuation), capitalize it
      if (index % 2 === 0 && part.trim().length > 0) {
        const trimmed = part.trim();
        if (trimmed.length > 0) {
          // Capitalize first letter, preserve rest of sentence
          return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
        }
      }
      // Return punctuation as-is
      return part;
    });

    // Rejoin all parts
    return capitalized.join('');
  }

  /**
   * Apply advanced reasoning techniques based on question type and content
   * @param {string} question - User's question
   * @param {Array} relevantChunks - Relevant document chunks
   * @param {Array} conversationHistory - Previous conversation messages
   * @returns {Object} Reasoning result with answer and metadata
   */
  async applyAdvancedReasoning(question, relevantChunks, conversationHistory) {
    const questionAnalysis = this.analyzeQuestionType(question);

    // Use LLM for all reasoning - no fallback needed
    if (this.langChainManager) {
      try {
        console.log(`🤖 Using LLM for answer generation (${this.llmProvider})`);

        // Use the zero tolerance structured generation instead of the general LangChain prompt
        const answer = await this.generateDirectAnswer(relevantChunks, question, questionAnalysis);
        
        // Check if answer is null or empty (LLM failed)
        if (!answer || answer.trim().length < 10) {
          throw new Error('LLM returned empty or invalid response');
        }

        return {
          answer: answer,
          reasoningStrategy: 'zero_tolerance_json',
          reasoningSteps: [],
          confidence: this.calculateSimplifiedConfidence([], relevantChunks.length, 0.5),
          questionAnalysis,
          llmMetadata: {
            provider: this.llmProvider,
            model: 'gemini-1.5-flash',
            contextChunks: relevantChunks.length,
            structuredGeneration: true
          }
        };
      } catch (error) {
        console.error(`❌ LLM generation failed: ${error.message}`);
        // Use improved fallback that extracts relevant content from chunks
        const fallbackAnswer = this.generateFallbackAnswer(relevantChunks, question);
        return {
          answer: fallbackAnswer,
          reasoningStrategy: 'llm_fallback_with_content',
          reasoningSteps: [],
          confidence: this.calculateSimplifiedConfidence([], relevantChunks.length, 0.3),
          questionAnalysis,
          llmMetadata: {
            provider: this.llmProvider,
            model: 'gemini-1.5-flash',
            contextChunks: relevantChunks.length,
            fallback: true,
            error: error.message
          }
        };
      }
    }

    // No LLM available - provide simple fallback
    console.warn("⚠️ No LLM available, using simple fallback response");
    const fallbackAnswer = this.generateFallbackAnswer(relevantChunks, question);
    return {
      answer: fallbackAnswer,
      reasoningStrategy: 'no_llm_fallback',
      reasoningSteps: [],
      confidence: this.calculateSimplifiedConfidence([], relevantChunks.length, 0.2),
      questionAnalysis,
      llmMetadata: null
    };
  }













  /**
   * Generate comprehensive, structured answer based on retrieved chunks
   * @param {string} question - User's question
   * @param {Array} relevantChunks - Relevant document chunks
   * @param {Array} conversationHistory - Previous conversation messages
   * @returns {string} Generated comprehensive answer
   */
  generateAnswer(question, relevantChunks, conversationHistory) {
    try {
      // Analyze question type and content depth
      const questionAnalysis = this.analyzeQuestionType(question);

      // Use LLM for direct answer generation from relevant chunks
      let answer = this.generateDirectAnswer(relevantChunks, question, questionAnalysis);

      // Simple fallback: use most relevant chunk if LLM fails
      if (!answer || answer.trim().length < 20) {
        console.log("🔄 Direct answer generation failed, using raw chunk content");
        if (relevantChunks.length > 0) {
          const topChunk = relevantChunks[0];
          answer = `Based on the documents, here's the most relevant information:\n\n${topChunk.content.substring(0, 800)}${topChunk.content.length > 800 ? '...' : ''}`;
        } else {
          answer = "I couldn't find any relevant information in the documents to answer your question. Please try rephrasing your question or upload more relevant documents.";
        }
      }

      // Add conversation context if available
      if (conversationHistory.length > 0) {
        answer = this.enhanceWithConversationContext(answer, conversationHistory, question);
      }

      // Ensure answer is not too long but comprehensive
      if (answer && answer.length > this.maxContextLength * 2) {
        answer = this.smartTruncateAnswer(answer, this.maxContextLength * 1.5);
      }

      // Apply sentence capitalization to ensure proper formatting
      answer = this.capitalizeSentences(answer);

      // Final fallback - ensure we always return a string
      if (!answer || typeof answer !== 'string') {
        console.log("🔄 Final fallback - returning basic response");
        answer = "I've found relevant information but had trouble formatting it properly. The documents contain information that may answer your question.";
      }

      return answer;

    } catch (error) {
      console.error("❌ Error in generateAnswer:", error);
      // Emergency fallback
      if (relevantChunks.length > 0) {
        return `I found relevant information in the documents: ${relevantChunks[0].content.substring(0, 500)}...`;
      }
      return "I encountered an error while generating the answer. Please try again.";
    }
  }

  /**
   * Generate fallback answer when structured generation fails
   * @param {Array} relevantChunks - Relevant chunks
   * @param {string} question - Original question
   * @returns {string} Fallback answer
   */
  generateFallbackAnswer(relevantChunks, question) {
    if (relevantChunks.length === 0) {
      return "I couldn't find any relevant information in the documents to answer your question. Please try rephrasing your question or upload more relevant documents.";
    }

    try {
      // Enhanced fallback: Try to create a coherent answer by extracting and organizing content
      const questionType = this.analyzeQuestionType(question);
      const answerTitle = this.generateAnswerTitle(question, questionType);

      let answer = answerTitle ? `## ${answerTitle}\n\n` : '';

      // Extract key information from chunks
      const keyPoints = this.extractKeyPointsFromChunks(relevantChunks, question);

      if (keyPoints.length > 0) {
        answer += keyPoints.join('\n\n');
        answer += '\n\n*This answer is based on information found in the uploaded documents.*';
        return answer;
      }

      // Fallback to improved text extraction
      const synthesizedAnswer = this.synthesizeAnswerFromChunks(relevantChunks, question);
      if (synthesizedAnswer) {
        return synthesizedAnswer;
      }

      // Final fallback: return structured preview of top chunk
      const topChunk = relevantChunks[0];
      const previewLength = Math.min(800, topChunk.content.length);
      const preview = topChunk.content.substring(0, previewLength);
      const sentences = preview.split(/[.!?]+/).filter(s => s.trim().length > 10);

      return `🔍 Answer based on document content:\n\n${sentences.slice(0, 4).join('. ').trim()}${sentences.length > 4 ? '...' : ''}\n\n*Source: Document content*`;

    } catch (error) {
      console.warn("⚠️ Enhanced fallback failed, using simple fallback:", error.message);
      // Simple fallback
      const topChunk = relevantChunks[0];
      return `Based on the documents, here's the most relevant information:\n\n${topChunk.content.substring(0, 500)}${topChunk.content.length > 500 ? '...' : ''}`;
    }
  }

  /**
   * Extract key points from chunks to create a coherent answer
   * @param {Array} chunks - Relevant chunks
   * @param {string} question - Original question
   * @returns {Array} Key points as strings
   */
  extractKeyPointsFromChunks(chunks, question) {
    const keyPoints = [];
    const questionWords = question.toLowerCase().split(/\s+/).filter(word => word.length > 3);

    for (const chunk of chunks.slice(0, 3)) { // Only process top 3 chunks
      const sentences = chunk.content.split(/[.!?]+/).filter(s => s.trim().length > 15);

      for (const sentence of sentences.slice(0, 3)) { // Take first 3 sentences from each chunk
        const sentenceLower = sentence.toLowerCase();
        const relevanceScore = questionWords.reduce((score, word) => {
          return score + (sentenceLower.includes(word) ? 1 : 0);
        }, 0);

        if (relevanceScore > 0 || sentence.length > 50) {
          keyPoints.push(sentence.trim());
        }

        if (keyPoints.length >= 5) break; // Limit to 5 key points
      }

      if (keyPoints.length >= 5) break;
    }

    return keyPoints.slice(0, 5); // Return top 5 points
  }

  /**
   * Synthesize a coherent answer from multiple chunks
   * @param {Array} chunks - Relevant chunks
   * @param {string} question - Original question
   * @returns {string} Synthesized answer
   */
  synthesizeAnswerFromChunks(chunks, question) {
    const allText = chunks.map(chunk => chunk.content).join(' ');
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 20);

    // Try to find the most comprehensive sentences
    const scoredSentences = sentences.map(sentence => ({
      text: sentence.trim(),
      score: this.scoreSentenceRelevance(sentence, question)
    })).sort((a, b) => b.score - a.score);

    const topSentences = scoredSentences.slice(0, 4).map(s => s.text);

    if (topSentences.length > 0) {
      return `🔍 Answer based on document content:\n\n${topSentences.join('. ')}.`;
    }

    return null;
  }

  /**
   * Score sentence relevance to question
   * @param {string} sentence - Sentence to score
   * @param {string} question - Original question
   * @returns {number} Relevance score
   */
  scoreSentenceRelevance(sentence, question) {
    const sentenceLower = sentence.toLowerCase();
    const questionLower = question.toLowerCase();
    const questionWords = questionLower.split(/\s+/).filter(word => word.length > 2);

    let score = 0;

    // Exact word matches
    for (const word of questionWords) {
      if (sentenceLower.includes(word)) {
        score += 2;
      }
    }

    // Partial matches for longer words
    for (const word of questionWords.filter(w => w.length > 4)) {
      const partialMatches = sentenceLower.split(word.substring(0, 4));
      if (partialMatches.length > 1) {
        score += 1;
      }
    }

    // Length bonus (prefer substantial sentences)
    if (sentence.length > 100) score += 1;
    if (sentence.length > 200) score += 1;

    return score;
  }

  /**
   * Extract relevant sentences from text based on question
   * @param {string} text - Combined text from chunks
   * @param {string} question - User's question
   * @returns {Array} Array of relevant sentences
   */
  extractRelevantSentences(text, question) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

    if (sentences.length === 0) return [];

    const questionWords = question.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));

    const scoredSentences = sentences.map(sentence => {
      const sentenceLower = sentence.toLowerCase();
      const matchingWords = questionWords.filter(word => sentenceLower.includes(word));
      const score = matchingWords.length;

      return {
        sentence: sentence.trim(),
        score,
        length: sentence.length
      };
    });

    // Sort by score (descending) and length (prefer shorter sentences)
    scoredSentences.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.length - b.length; // Prefer shorter sentences with same score
    });

    return scoredSentences
      .filter(item => item.score > 0)
      .slice(0, 5)
      .map(item => item.sentence);
  }

  /**
   * Generate fallback answer when no relevant sentences found
   * @param {Array} relevantChunks - Available chunks
   * @returns {string} Fallback answer
   */
  generateFallbackAnswer(relevantChunks) {
    if (relevantChunks.length === 0) return "No information available.";

    // Return the beginning of the most relevant chunk
    const topChunk = relevantChunks[0].content;
    const previewLength = Math.min(300, topChunk.length);
    return topChunk.substring(0, previewLength) + (topChunk.length > previewLength ? "..." : "");
  }

  /**
   * Enhance answer with conversation context
   * @param {string} answer - Base answer
   * @param {Array} conversationHistory - Previous messages
   * @param {string} question - Current question
   * @returns {string} Enhanced answer
   */
  enhanceWithConversationContext(answer, conversationHistory, question) {
    // Get recent conversation context (last 3 exchanges)
    const recentContext = conversationHistory.slice(-6);

    // Look for related topics in conversation
    const relatedTopics = this.extractRelatedTopics(recentContext, question);

    if (relatedTopics.length > 0) {
      answer = `Based on our previous discussion about ${relatedTopics.join(", ")}, ${answer.toLowerCase()}`;
    }

    return answer;
  }

  /**
   * Extract related topics from conversation history
   * @param {Array} conversationHistory - Previous messages
   * @param {string} question - Current question
   * @returns {Array} Related topics
   */
  extractRelatedTopics(conversationHistory, question) {
    const topics = new Set();
    const questionWords = question.toLowerCase().split(/\W+/).filter(word => word.length > 3);

    for (const message of conversationHistory) {
      if (message.type === 'question' || message.type === 'answer') {
        const contentWords = message.content.toLowerCase().split(/\W+/).filter(word => word.length > 3);
        const commonWords = questionWords.filter(word => contentWords.includes(word));
        commonWords.forEach(word => topics.add(word));
      }
    }

    return Array.from(topics).slice(0, 3);
  }

  /**
   * Extract sources from relevant chunks
   * @param {Array} relevantChunks - Relevant chunks
   * @param {Object} searchResults - Original search results
   * @returns {Array} Array of source objects
   */
  extractSources(relevantChunks, searchResults) {
    const sources = [];
    const metadatas = searchResults.metadatas?.[0] || [];
    const distances = searchResults.distances?.[0] || [];

    for (const chunk of relevantChunks) {
      const metadata = metadatas[chunk.index] || {};
      const distance = distances[chunk.index] || 1;
      const similarity = 1 - distance;

      sources.push({
        documentName: metadata.documentName || 'Unknown Document',
        chunkIndex: metadata.chunkIndex || chunk.index,
        similarity: similarity,
        confidence: chunk.similarity,
        preview: chunk.content.substring(0, 150) + (chunk.content.length > 150 ? '...' : ''),
        metadata: {
          version: metadata.version,
          uploadedAt: metadata.uploadedAt,
          textLength: metadata.textLength
        }
      });
    }

    return sources;
  }






  /**
   * Calculate simplified confidence score based on sources and reasoning
   * @param {Array} sources - Answer sources
   * @param {number} totalRelevantChunks - Total relevant chunks found
   * @param {number} reasoningConfidence - Confidence from reasoning process
   * @returns {number} Simplified confidence score (0-1)
   */
  calculateSimplifiedConfidence(sources, totalRelevantChunks, reasoningConfidence) {
    // Base confidence from sources
    const baseConfidence = this.calculateConfidence(sources, totalRelevantChunks);

    // Simple combination of source confidence and reasoning confidence
    const combinedConfidence = (baseConfidence * 0.6) + (reasoningConfidence * 0.4);

    return Math.max(0, Math.min(1, combinedConfidence));
  }

  /**
   * Simple LLM-based verification of answer quality
   * @param {string} answer - Generated answer
   * @param {string} question - Original question
   * @param {Array} relevantChunks - Source chunks used
   * @returns {number} Verification score (0-1, higher = better)
   */
  async verifyAnswerQuality(answer, question, relevantChunks) {
    if (!this.langChainManager) {
      console.log("⚠️ No LLM available for verification, returning default score");
      return 0.8; // Default neutral score
    }

    try {
      // Combine all relevant chunks into source text
      const sourceText = relevantChunks
        .map(chunk => chunk.content)
        .join('\n\n')
        .substring(0, 4000); // Limit to avoid token limits

      const verificationQuestion = `Verify if this answer is fully supported by the source text. Check for:
1. Factual accuracy - all claims supported by sources
2. No hallucinations - no information not present in sources
3. Completeness - addresses the original question
4. Groundedness - based on provided context

Source text: ${sourceText}
Answer: ${answer}
Question: ${question}

Return only: VALID or INVALID with a brief explanation (max 50 words)`;

      // Create a simple question analysis for verification
      const verificationAnalysis = {
        type: 'general',
        complexity: 'simple',
        keywords: ['verify', 'valid', 'supported']
      };

      // Create verification chunks from the source text
      const verificationChunks = [{
        content: sourceText,
        metadata: { documentName: 'verification_source' }
      }];

      const verificationResult = await this.langChainManager.generateAnswer(
        verificationQuestion,
        verificationChunks,
        verificationAnalysis,
        []
      );

      // Simple scoring based on response
      const response = verificationResult.answer.toLowerCase();
      if (response.includes('valid')) {
        return 0.9; // High confidence for valid answers
      } else if (response.includes('invalid')) {
        return 0.4; // Lower confidence for invalid answers
      } else {
        return 0.7; // Neutral score for unclear responses
      }

    } catch (error) {
      console.warn("❌ Verification failed:", error.message);
      return 0.7; // Return neutral score on failure
    }
  }

  /**
   * Calculate confidence score for the answer using advanced metrics
   * @param {Array} sources - Answer sources with composite scores
   * @param {number} totalRelevantChunks - Total relevant chunks found
   * @returns {number} Confidence score between 0 and 1
   */
  calculateConfidence(sources, totalRelevantChunks) {
    if (sources.length === 0) return 0;

    // Use composite final scores if available (from re-ranking)
    const avgFinalScore = sources.reduce((sum, source) => {
      return sum + (source.finalScore || source.similarity || 0);
    }, 0) / sources.length;

    // Factor in number of sources (more sources = higher confidence)
    const sourceFactor = Math.min(sources.length / 3, 1); // Max benefit at 3 sources

    // Factor in total relevant chunks found (more chunks = better coverage)
    const chunkFactor = Math.min(totalRelevantChunks / 5, 1); // Max benefit at 5 chunks

    // Calculate diversity bonus (avoid over-reliance on single document)
    const uniqueDocuments = new Set(sources.map(s => s.documentName)).size;
    const diversityFactor = Math.min(uniqueDocuments / 2, 1); // Max benefit at 2+ documents

    // Weighted confidence calculation
    const confidence = (
      avgFinalScore * 0.45 +      // Most important - composite relevance score
      sourceFactor * 0.20 +       // Important - number of sources
      chunkFactor * 0.15 +        // Moderately important - total chunks
      diversityFactor * 0.20      // Important - document diversity
    );

    const finalConfidence = Math.min(Math.max(confidence, 0), 1);

    console.log(`🎯 Confidence calculation: ${finalConfidence.toFixed(3)} (${sources.length} sources, ${uniqueDocuments} unique docs)`);

    return finalConfidence;
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      initialized: this.isInitialized,
      maxResults: this.maxResults,
      similarityThreshold: this.similarityThreshold,
      maxContextLength: this.maxContextLength,
      embeddingServiceHealthy: this.embeddingService ? true : false,
      vectorStoreHealthy: this.vectorStore ? true : false,
      llmProvider: this.llmProvider,
      llmEnabled: this.langChainManager ? true : false,
      llmStats: this.langChainManager ? this.langChainManager.getStats() : null,
      cacheStats: {
        queryRewriteCacheSize: this.queryRewriteCache?.size || 0,
        rerankingCacheSize: this.rerankingCache?.size || 0,
        answerCacheSize: this.answerCache.size,
        answerCacheEnabled: this.cacheEnabled,
        answerCacheMaxSize: this.maxCacheSize,
        answerCacheMemoryUsage: this.estimateMemoryUsage(),
        modelTieringEnabled: this.langChainManager?.useModelTiering || false
      }
    };
  }

  /**
   * Health check for QA service
   * @returns {Promise<boolean>} Health status
   */
  async healthCheck() {
    try {
      if (!this.isInitialized) return false;

      // Temporarily disabled for deployment to speed up startup
      // await this.embeddingService.generateSingleEmbedding("health check");

      // Test vector store
      await this.vectorStore.getStats();

      // Test LLM if available
      if (this.langChainManager) {
        await this.langChainManager.healthCheck();
      }

      return true;
    } catch (error) {
      console.error("❌ QA Service health check failed:", error);
      return false;
    }
  }

  /**
   * Generate direct answer using LLM from relevant chunks
   * @param {Array} relevantChunks - Relevant document chunks
   * @param {string} question - User's question
   * @param {Object} questionAnalysis - Question analysis
   * @returns {string} Generated answer
   */
  async generateDirectAnswer(relevantChunks, question, questionAnalysis) {
    if (!this.langChainManager) {
      console.warn("⚠️ No LLM available for direct answer generation");
      return this.generateFallbackAnswer(relevantChunks, question);
    }

    try {
      // Prepare context from chunks with better organization
      const context = this.prepareEnhancedContext(relevantChunks, question);
      
      // Create enhanced prompt for direct answer generation with better structure
      const directPrompt = `You are a highly specialized AI assistant that creates comprehensive, well-structured answers. Your task is to answer the user's question based ONLY on the provided CONTEXT.

CRITICAL REQUIREMENTS:
1. Your output MUST be a single, valid JSON object with NO additional text
2. Use ONLY information from the CONTEXT - no external knowledge
3. If information is not available in CONTEXT, use empty arrays [] or empty strings ""
4. Ensure all content flows logically and coherently
5. Avoid repetitive headers or incomplete sentences
6. Make sure each section is complete and meaningful

JSON STRUCTURE:
{
  "title": "Clear, specific title that directly addresses the question",
  "introduction": "A comprehensive opening paragraph that introduces the topic and provides context",
  "mainContent": "Detailed explanation of the core topic with smooth transitions between ideas",
  "keyPoints": [
    "Distinct, well-formed bullet points that are essential to understanding the topic"
  ],
  "categories": [
    "Specific categories or types found in the context (empty array if none)"
  ],
  "examples": [
    "Concrete examples from the context (empty array if none)"
  ],
  "conclusion": "A complete, coherent conclusion that summarizes the key findings"
}

---
CONTEXT:
${context}
---
USER QUESTION:
${question}
---

Generate a complete, well-structured response that flows logically from introduction to conclusion. Ensure no content is truncated or incomplete.

JSON_OUTPUT:`;

      const directAnalysis = {
        type: 'general',
        complexity: 'simple',
        keywords: ['answer', 'question', 'information']
      };

      const verificationChunks = [{
        content: context,
        metadata: { documentName: 'direct_answer_context' }
      }];

      const result = await this.langChainManager.generateAnswer(
        directPrompt,
        verificationChunks,
        directAnalysis,
        []
      );

      // Check if the result is a fallback response (indicates LLM failure)
      if (result.answer.includes('I encountered an issue generating a detailed answer') ||
          result.answer.includes('All LLM generation attempts failed') ||
          result.answer.includes('fallback answer')) {
        console.warn("❌ LLM returned fallback response, using content-based fallback");
        return this.generateFallbackAnswer(relevantChunks, question);
      }

      // Parse and format the JSON response with enhanced validation
      try {
        // Try to extract and parse JSON from the response
        const jsonResponse = this.extractAndParseJSON(result.answer.trim());

        if (!jsonResponse) {
          console.warn("❌ No valid JSON found in LLM response, falling back to raw answer");
          return result.answer;
        }

        // Validate response completeness and quality
        const validationResult = this.validateResponseQuality(jsonResponse, question);
        if (!validationResult.isValid) {
          console.warn(`⚠️ Response validation failed: ${validationResult.reason}`);
          return this.generateFallbackAnswer(relevantChunks, question);
        }

        // Format the structured response into clean, readable text
        let formattedAnswer = '';

        // Add title if meaningful
        if (jsonResponse.title && jsonResponse.title.trim()) {
          formattedAnswer += `# ${jsonResponse.title}\n\n`;
        }

        // Add introduction
        if (jsonResponse.introduction && jsonResponse.introduction.trim()) {
          formattedAnswer += `${jsonResponse.introduction}\n\n`;
        }

        // Add main content
        if (jsonResponse.mainContent && jsonResponse.mainContent.trim()) {
          formattedAnswer += `${jsonResponse.mainContent}\n\n`;
        }

        // Add key points if available
        if (jsonResponse.keyPoints && jsonResponse.keyPoints.length > 0 && 
            jsonResponse.keyPoints.some(point => point && point.trim())) {
          formattedAnswer += `## Key Points\n\n`;
          jsonResponse.keyPoints.forEach(point => {
            if (point && point.trim()) {
              formattedAnswer += `• ${point.trim()}\n`;
            }
          });
          formattedAnswer += `\n`;
        }

        // Add categories only if they contain actual content
        if (jsonResponse.categories && jsonResponse.categories.length > 0 &&
            jsonResponse.categories.some(cat => cat && cat.trim())) {
          formattedAnswer += `## Categories\n\n`;
          jsonResponse.categories.forEach(category => {
            if (category && category.trim()) {
              formattedAnswer += `• ${category.trim()}\n`;
            }
          });
          formattedAnswer += `\n`;
        }

        // Add examples only if they contain actual examples
        if (jsonResponse.examples && jsonResponse.examples.length > 0 &&
            jsonResponse.examples.some(example => example && example.trim())) {
          formattedAnswer += `## Examples\n\n`;
          jsonResponse.examples.forEach(example => {
            if (example && example.trim()) {
              formattedAnswer += `• ${example.trim()}\n`;
            }
          });
          formattedAnswer += `\n`;
        }

        // Add conclusion if meaningful
        if (jsonResponse.conclusion && jsonResponse.conclusion.trim()) {
          formattedAnswer += `## Conclusion\n\n${jsonResponse.conclusion.trim()}`;
        }

        // Clean the output: remove source citations and extra whitespace
        formattedAnswer = this.cleanStructuredOutput(formattedAnswer);

        // Final validation to ensure response is complete and coherent
        const finalValidation = this.validateFinalResponse(formattedAnswer, question);
        if (!finalValidation.isValid) {
          console.warn(`⚠️ Final validation failed: ${finalValidation.reason}`);
          return this.generateFallbackAnswer(relevantChunks, question);
        }

        return formattedAnswer.trim();

      } catch (parseError) {
        console.warn("❌ Failed to parse JSON response, falling back to raw answer:", parseError.message);
        // Try to extract JSON from the raw response
        const extractedJSON = this.extractAndParseJSON(result.answer);
        if (extractedJSON) {
          console.log("✅ Successfully extracted JSON from malformed response");
          // Format the extracted JSON response
          return this.formatStructuredResponse(extractedJSON, question);
        }
        // Fallback: return the raw response if JSON parsing fails
        return result.answer;
      }

    } catch (error) {
      console.warn("❌ Direct answer generation failed:", error.message);
      return this.generateFallbackAnswer(relevantChunks, question);
    }
  }

  /**
   * Extract and parse JSON from LLM response that may contain malformed JSON
   * @param {string} response - Raw LLM response
   * @returns {Object|null} Parsed JSON object or null if parsing fails
   */
  extractAndParseJSON(response) {
    try {
      // First try direct JSON parsing
      return JSON.parse(response.trim());
    } catch (e) {
      console.log("Direct JSON parsing failed, attempting extraction...");

      // Try to extract JSON from code blocks (```json ... ```)
      const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
      const jsonBlockMatch = response.match(jsonBlockRegex);
      if (jsonBlockMatch) {
        try {
          return JSON.parse(jsonBlockMatch[1].trim());
        } catch (e2) {
          console.log("JSON block extraction failed:", e2.message);
        }
      }

      // Try to find JSON object pattern (starts with { and ends with })
      const jsonObjectRegex = /\{[\s\S]*\}/;
      const jsonMatch = response.match(jsonObjectRegex);
      if (jsonMatch) {
        try {
          // Try to fix common JSON issues
          let jsonString = jsonMatch[0];

          // Fix trailing commas
          jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');

          // Fix unescaped quotes in strings
          jsonString = jsonString.replace(/([^\\])"([^"]*)"([^,}\]]*[^\\])"([^"]*)"([^,}\]]*)/g, '$1"$2\\"$3\\"$4"$5');

          return JSON.parse(jsonString);
        } catch (e3) {
          console.log("JSON object extraction failed:", e3.message);
        }
      }

      return null;
    }
  }

  /**
   * Format structured JSON response into readable text
   * @param {Object} jsonResponse - Parsed JSON response
   * @param {string} question - Original question for validation
   * @returns {string} Formatted answer
   */
  formatStructuredResponse(jsonResponse, question) {
    try {
      let formattedAnswer = '';

      // Add title if meaningful
      if (jsonResponse.title && jsonResponse.title.trim()) {
        formattedAnswer += `# ${jsonResponse.title}\n\n`;
      }

      // Add introduction
      if (jsonResponse.introduction && jsonResponse.introduction.trim()) {
        formattedAnswer += `${jsonResponse.introduction}\n\n`;
      }

      // Add main content
      if (jsonResponse.mainContent && jsonResponse.mainContent.trim()) {
        formattedAnswer += `${jsonResponse.mainContent}\n\n`;
      }

      // Add key points if available
      if (jsonResponse.keyPoints && Array.isArray(jsonResponse.keyPoints) && jsonResponse.keyPoints.length > 0) {
        formattedAnswer += `## Key Points\n\n`;
        jsonResponse.keyPoints.forEach(point => {
          if (point && point.trim()) {
            formattedAnswer += `• ${point.trim()}\n`;
          }
        });
        formattedAnswer += `\n`;
      }

      // Add categories only if they contain actual content
      if (jsonResponse.categories && Array.isArray(jsonResponse.categories) && jsonResponse.categories.length > 0) {
        formattedAnswer += `## Categories\n\n`;
        jsonResponse.categories.forEach(category => {
          if (category && category.trim()) {
            formattedAnswer += `• ${category.trim()}\n`;
          }
        });
        formattedAnswer += `\n`;
      }

      // Add examples only if they contain actual examples
      if (jsonResponse.examples && Array.isArray(jsonResponse.examples) && jsonResponse.examples.length > 0) {
        formattedAnswer += `## Examples\n\n`;
        jsonResponse.examples.forEach(example => {
          if (example && example.trim()) {
            formattedAnswer += `• ${example.trim()}\n`;
          }
        });
        formattedAnswer += `\n`;
      }

      // Add conclusion if meaningful
      if (jsonResponse.conclusion && jsonResponse.conclusion.trim()) {
        formattedAnswer += `## Conclusion\n\n${jsonResponse.conclusion.trim()}`;
      }

      // Clean the output: remove source citations and extra whitespace
      formattedAnswer = this.cleanStructuredOutput(formattedAnswer);

      return formattedAnswer.trim();
    } catch (error) {
      console.error("❌ Error formatting structured response:", error.message);
      return JSON.stringify(jsonResponse, null, 2);
    }
  }

  /**
   * Generate fallback answer when LLM fails
   * @param {Array} relevantChunks - Relevant chunks
   * @param {string} question - Original question
   * @returns {string} Fallback answer
   */
  generateFallbackAnswer(relevantChunks, question) {
    if (relevantChunks.length === 0) {
      return "I couldn't find any relevant information in the documents to answer your question. Please try rephrasing your question or upload more relevant documents.";
    }

    // Combine all chunk content
    const allText = relevantChunks.map(chunk => chunk.content).join(" ");

    // Extract sentences that might be relevant
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const questionLower = question.toLowerCase();

    // Find sentences that contain question keywords
    const relevantSentences = sentences.filter(sentence => {
      const sentenceLower = sentence.toLowerCase();
      // Check if sentence contains important words from the question
      const questionWords = questionLower.split(/\s+/).filter(word => word.length > 3);
      return questionWords.some(word => sentenceLower.includes(word));
    });

    if (relevantSentences.length > 0) {
      // Return top 3-5 relevant sentences
      const topSentences = relevantSentences.slice(0, Math.min(5, relevantSentences.length));
      return `🔍 Answer based on document content:\n\n${topSentences.join('. ')}.`;
    }

    // If no specific sentences match, return the beginning of the most relevant chunk
    const topChunk = relevantChunks[0];
    const previewLength = Math.min(600, topChunk.content.length);
    return `🔍 Here's relevant information from the documents:\n\n${topChunk.content.substring(0, previewLength)}${topChunk.content.length > previewLength ? '...' : ''}`;
  }

  /**
   * Prepare enhanced context from relevant chunks
   * @param {Array} relevantChunks - Relevant document chunks
   * @param {string} question - User's question
   * @returns {string} Enhanced context
   */
  prepareEnhancedContext(relevantChunks, question) {
    if (!relevantChunks || relevantChunks.length === 0) {
      return "No relevant context available.";
    }

    // Organize chunks by document and relevance
    const organizedChunks = this.organizeChunksByDocument(relevantChunks);
    
    // Create structured context
    let context = "RELEVANT DOCUMENT CONTENT:\n\n";
    
    Object.entries(organizedChunks).forEach(([docName, chunks], index) => {
      context += `--- Document ${index + 1}: ${docName} ---\n`;
      chunks.forEach((chunk, chunkIndex) => {
        context += `\n[Chunk ${chunkIndex + 1}]\n${chunk.content}\n`;
      });
      context += "\n";
    });

    // Add question context
    context += `\nQUESTION CONTEXT: ${question}\n`;
    
    // Limit context length to avoid token limits
    return context.substring(0, 4000);
  }

  /**
   * Organize chunks by document name for better context structure
   * @param {Array} chunks - Relevant chunks
   * @returns {Object} Organized chunks by document
   */
  organizeChunksByDocument(chunks) {
    const organized = {};
    
    chunks.forEach(chunk => {
      const docName = chunk.metadata.documentName || 'Unknown Document';
      if (!organized[docName]) {
        organized[docName] = [];
      }
      organized[docName].push(chunk);
    });

    return organized;
  }

  /**
   * Validate response quality and completeness
   * @param {Object} jsonResponse - Parsed JSON response
   * @param {string} question - Original question
   * @returns {Object} Validation result
   */
  validateResponseQuality(jsonResponse, question) {
    const issues = [];

    // Check for required fields
    if (!jsonResponse.title || jsonResponse.title.trim().length < 5) {
      issues.push("Title is missing or too short");
    }

    if (!jsonResponse.introduction || jsonResponse.introduction.trim().length < 20) {
      issues.push("Introduction is missing or too short");
    }

    if (!jsonResponse.mainContent || jsonResponse.mainContent.trim().length < 50) {
      issues.push("Main content is missing or too short");
    }

    // Check for incomplete sentences
    const textFields = [jsonResponse.introduction, jsonResponse.mainContent, jsonResponse.conclusion];
    textFields.forEach(field => {
      if (field && field.trim()) {
        if (field.trim().endsWith('...') || field.trim().endsWith('cannot') || 
            field.trim().endsWith('s cannot')) {
          issues.push("Incomplete sentence detected");
        }
      }
    });

    // Check for repetitive content
    if (jsonResponse.title && jsonResponse.introduction && 
        jsonResponse.title.toLowerCase() === jsonResponse.introduction.toLowerCase().substring(0, jsonResponse.title.length)) {
      issues.push("Repetitive content detected");
    }

    // Check for empty arrays that should have content
    if (jsonResponse.keyPoints && jsonResponse.keyPoints.length === 0) {
      issues.push("No key points provided");
    }

    return {
      isValid: issues.length === 0,
      reason: issues.join('; '),
      issues
    };
  }

  /**
   * Validate final response for completeness and coherence
   * @param {string} response - Final formatted response
   * @param {string} question - Original question
   * @returns {Object} Validation result
   */
  validateFinalResponse(response, question) {
    const issues = [];

    // Check minimum length
    if (response.length < 100) {
      issues.push("Response too short");
    }

    // Check for incomplete sentences
    if (response.includes('...') || response.includes('cannot be relied upon') || 
        response.includes('s cannot')) {
      issues.push("Incomplete content detected");
    }

    // Check for proper structure
    if (!response.includes('#') && !response.includes('##')) {
      issues.push("Poor structure - missing headers");
    }

    // Check for repetitive headers
    const headers = response.match(/^#{1,6}\s+.+$/gm) || [];
    const headerTexts = headers.map(h => h.replace(/^#+\s+/, '').toLowerCase());
    const uniqueHeaders = new Set(headerTexts);
    if (uniqueHeaders.size < headerTexts.length) {
      issues.push("Repetitive headers detected");
    }

    // Check for logical flow
    if (response.includes('Part 3') && response.includes('Part 3')) {
      issues.push("Repetitive section markers");
    }

    return {
      isValid: issues.length === 0,
      reason: issues.join('; '),
      issues
    };
  }

  /**
   * Clean structured output by removing source citations and improving readability
   * @param {string} output - Raw formatted output
   * @returns {string} Cleaned output
   */
  cleanStructuredOutput(output) {
    let cleaned = output;

    // Remove source citations like [Source 1], [Source 2], etc.
    cleaned = cleaned.replace(/\[Source \d+\]/g, '');

    // Remove excessive whitespace and empty lines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Clean up any remaining artifacts
    cleaned = cleaned.replace(/\s+$/gm, ''); // Remove trailing spaces from each line

    // Remove repetitive section markers
    cleaned = cleaned.replace(/^Part \d+ — .+:\s*$/gm, '');

    // Fix incomplete sentences
    cleaned = cleaned.replace(/\s+cannot be relied upon to demonstrate[^.]*$/gm, '');
    cleaned = cleaned.replace(/\s+s cannot[^.]*$/gm, '');

    // Ensure proper sentence endings
    cleaned = cleaned.replace(/([.!?])\s*([A-Z])/g, '$1 $2');

    return cleaned.trim();
  }

  /**
   * Rewrite query for better retrieval using LLM
   * @param {string} originalQuestion - The user's original question
   * @returns {string} Rewritten query optimized for semantic search
   */
  // Cache for query rewrites to avoid repeated API calls
  queryRewriteCache = new Map();
  
  // Cache for re-ranking results to avoid reprocessing similar queries
  rerankingCache = new Map();
  
  // Cache for final generated answers
  answerCache = new Map();

  async rewriteQueryForRetrieval(originalQuestion) {
    // Disable query rewriting in production to save API quota - it's expensive and not always necessary
    if (process.env.NODE_ENV === 'production' || process.env.DISABLE_QUERY_REWRITING === 'true') {
      console.log("🔄 Query rewriting disabled to save API quota, using original question");
      return originalQuestion;
    }

    // If no LLM available, return original question
    if (!this.langChainManager) {
      console.log("🔄 No LLM available for query rewriting, using original question");
      return originalQuestion;
    }

    // Check cache first
    if (this.queryRewriteCache.has(originalQuestion)) {
      console.log(`📋 Using cached query rewrite: "${originalQuestion}" → "${this.queryRewriteCache.get(originalQuestion)}"`);
      return this.queryRewriteCache.get(originalQuestion);
    }

    // Only rewrite queries that might benefit from expansion
    if (!this.shouldRewriteQuery(originalQuestion)) {
      console.log(`🔄 Query doesn't need rewriting: "${originalQuestion}"`);
      this.queryRewriteCache.set(originalQuestion, originalQuestion);
      return originalQuestion;
    }

    try {
      // Create query rewriting prompt
      const rewritePrompt = `The user's query is: "${originalQuestion}".

Rewrite this query to be more descriptive for a semantic search. Expand any acronyms and add context. For example, "what is CA" should become "What is Conversation Analysis (CA)". Respond ONLY with the rewritten query.`;

      // Use a simple analysis for the rewrite task
      const rewriteAnalysis = {
        type: 'general',
        complexity: 'simple',
        keywords: ['rewrite', 'query', 'search']
      };

      // Create a minimal context chunk for the rewrite task
      const rewriteChunks = [{
        content: 'Query rewriting task - expand acronyms and add context for better semantic search.',
        metadata: { documentName: 'query_rewrite_context' }
      }];

      // Use preprocessing model for query rewriting (faster, cheaper)
      const rewrittenQuery = await this.langChainManager.generatePreprocessing(rewritePrompt);

      // Validate the rewritten query
      if (rewrittenQuery && rewrittenQuery.length > 0 && rewrittenQuery !== originalQuestion) {
        console.log(`✨ Query rewritten: "${originalQuestion}" → "${rewrittenQuery}"`);
        this.queryRewriteCache.set(originalQuestion, rewrittenQuery);
        return rewrittenQuery;
      } else {
        console.log(`🔄 Query rewrite returned same or empty result, using original: "${originalQuestion}"`);
        this.queryRewriteCache.set(originalQuestion, originalQuestion);
        return originalQuestion;
      }

    } catch (error) {
      console.warn("❌ Query rewriting failed, using original question:", error.message);
      this.queryRewriteCache.set(originalQuestion, originalQuestion);
      return originalQuestion;
    }
  }

  /**
   * Determine if a query should be rewritten
   * @param {string} query - The query to check
   * @returns {boolean} Whether the query should be rewritten
   */
  shouldRewriteQuery(query) {
    const queryLower = query.toLowerCase().trim();

    // Only rewrite short queries or those with potential acronyms
    if (queryLower.length < 10) return true;

    // Check for common acronym patterns
    const acronymPattern = /\b[A-Z]{2,5}\b/g;
    if (acronymPattern.test(query)) return true;

    // Check for questions that start with "what is" followed by short terms
    const whatIsPattern = /^what is\s+\w{1,5}(\?|$)/i;
    if (whatIsPattern.test(queryLower)) return true;

    return false;
  }
}

export default QAService;
