export class QAService {
  constructor(embeddingService, vectorStore, options = {}) {
    this.embeddingService = embeddingService;
    this.vectorStore = vectorStore;
    this.maxResults = options.maxResults || 5;
    this.similarityThreshold = options.similarityThreshold || -0.5; // Lower threshold for ChromaDB distances
    this.maxContextLength = options.maxContextLength || 2000;
    this.isInitialized = false;
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
  async answerQuestion(question, conversationHistory = [], options = {}) {
    try {
      if (!this.isInitialized) {
        throw new Error("QA Service not initialized");
      }

      if (!question || question.trim().length === 0) {
        throw new Error("Question is required");
      }

      console.log(`🤔 Processing question: "${question.substring(0, 100)}${question.length > 100 ? '...' : ''}"`);

      // Generate embedding for the question
      const questionEmbedding = await this.embeddingService.generateSingleEmbedding(question);

      // Search for relevant documents
      const searchResults = await this.vectorStore.search(questionEmbedding, this.maxResults);

      // Process search results
      const relevantChunks = this.processSearchResults(searchResults, question);

      if (relevantChunks.length === 0) {
        console.log("⚠️ No relevant documents found");
        return {
          answer: "I couldn't find any relevant information in the documents to answer your question. Please try rephrasing your question or upload more relevant documents.",
          sources: [],
          confidence: 0,
          question,
          metadata: {
            totalChunksSearched: searchResults.documents?.[0]?.length || 0,
            relevantChunksFound: 0,
            processingTime: Date.now()
          }
        };
      }

      // Generate answer based on retrieved documents and conversation context
      const answer = this.generateAnswer(question, relevantChunks, conversationHistory);

      // Extract sources from relevant chunks
      const sources = this.extractSources(relevantChunks, searchResults);

      // Calculate confidence score
      const confidence = this.calculateConfidence(sources, relevantChunks.length);

      console.log(`✅ Generated answer with ${sources.length} sources, confidence: ${(confidence * 100).toFixed(1)}%`);

      return {
        answer,
        sources,
        confidence,
        question,
        metadata: {
          totalChunksSearched: searchResults.documents?.[0]?.length || 0,
          relevantChunksFound: relevantChunks.length,
          processingTime: Date.now(),
          conversationContextUsed: conversationHistory.length > 0
        }
      };

    } catch (error) {
      console.error("❌ QA Service error:", error);
      throw new Error(`Failed to answer question: ${error.message}`);
    }
  }

  /**
   * Process search results and filter relevant chunks
   * @param {Object} searchResults - Results from vector search
   * @param {string} question - Original question
   * @returns {Array} Filtered relevant chunks
   */
  processSearchResults(searchResults, question) {
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

    // Sort by similarity (highest first)
    relevantChunks.sort((a, b) => b.similarity - a.similarity);

    return relevantChunks.slice(0, this.maxResults);
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
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));

    // Check if chunk contains significant question keywords
    const matchingWords = questionWords.filter(word => chunkLower.includes(word));
    const matchRatio = matchingWords.length / Math.max(questionWords.length, 1);

    return matchRatio >= 0.3; // At least 30% of question words should match
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
   * Generate answer based on retrieved chunks and conversation history
   * @param {string} question - User's question
   * @param {Array} relevantChunks - Relevant document chunks
   * @param {Array} conversationHistory - Previous conversation messages
   * @returns {string} Generated answer
   */
  generateAnswer(question, relevantChunks, conversationHistory) {
    // Combine all relevant chunks
    const combinedText = relevantChunks.map(chunk => chunk.content).join(" ");

    // Extract the most relevant sentences
    const relevantSentences = this.extractRelevantSentences(combinedText, question);

    if (relevantSentences.length === 0) {
      return this.generateFallbackAnswer(relevantChunks);
    }

    // Combine sentences into coherent answer
    let answer = relevantSentences.slice(0, 3).join(" ");

    // Add conversation context if available
    if (conversationHistory.length > 0) {
      answer = this.enhanceWithConversationContext(answer, conversationHistory, question);
    }

    // Ensure answer is not too long
    if (answer.length > this.maxContextLength) {
      answer = answer.substring(0, this.maxContextLength - 3) + "...";
    }

    return answer;
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
   * Calculate confidence score for the answer
   * @param {Array} sources - Answer sources
   * @param {number} totalRelevantChunks - Total relevant chunks found
   * @returns {number} Confidence score between 0 and 1
   */
  calculateConfidence(sources, totalRelevantChunks) {
    if (sources.length === 0) return 0;

    // Calculate average similarity
    const avgSimilarity = sources.reduce((sum, source) => sum + source.similarity, 0) / sources.length;

    // Factor in number of sources
    const sourceFactor = Math.min(sources.length / 3, 1); // Max benefit at 3 sources

    // Factor in total relevant chunks found
    const chunkFactor = Math.min(totalRelevantChunks / 5, 1); // Max benefit at 5 chunks

    const confidence = (avgSimilarity * 0.6) + (sourceFactor * 0.25) + (chunkFactor * 0.15);

    return Math.min(Math.max(confidence, 0), 1); // Clamp between 0 and 1
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
      vectorStoreHealthy: this.vectorStore ? true : false
    };
  }

  /**
   * Health check for QA service
   * @returns {Promise<boolean>} Health status
   */
  async healthCheck() {
    try {
      if (!this.isInitialized) return false;

      // Test embedding service
      await this.embeddingService.generateSingleEmbedding("health check");

      // Test vector store
      await this.vectorStore.getStats();

      return true;
    } catch (error) {
      console.error("❌ QA Service health check failed:", error);
      return false;
    }
  }
}

export default QAService;
