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

    // Apply query expansion for better retrieval
    const expandedQuery = this.expandQuery(question);
    console.log(`🔍 Expanded query: "${expandedQuery.substring(0, 150)}${expandedQuery.length > 150 ? '...' : ''}"`);

    // Generate embedding for the expanded question
    const questionEmbedding = await this.embeddingService.generateSingleEmbedding(expandedQuery);

    // Perform mixed retrieval (semantic + keyword + metadata)
    const searchResults = await this.performMixedRetrieval(questionEmbedding, question);

    // Process search results with mixed retrieval data
    const relevantChunks = this.processMixedSearchResults(searchResults, question);

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

      // Apply advanced reasoning techniques based on question type
      const reasoningResult = await this.applyAdvancedReasoning(question, relevantChunks, conversationHistory);
      const answer = reasoningResult.answer;

      // Extract sources from relevant chunks
      const sources = this.extractSources(relevantChunks, searchResults);

      // Apply quality control and hallucination detection
      const qualityCheck = await this.performQualityControl(answer, question, relevantChunks);

      // Calculate enhanced confidence score
      const confidence = this.calculateEnhancedConfidence(sources, relevantChunks.length, reasoningResult.confidence, qualityCheck);

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
   * Process search results and filter relevant chunks with advanced re-ranking
   * @param {Object} searchResults - Results from vector search
   * @param {string} question - Original question
   * @returns {Array} Filtered and re-ranked relevant chunks
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

    // Apply advanced re-ranking system
    const reRankedChunks = this.applyReRanking(relevantChunks, question);

    return reRankedChunks.slice(0, this.maxResults);
  }

  /**
   * Apply advanced re-ranking to improve retrieval quality
   * @param {Array} chunks - Initial relevant chunks
   * @param {string} question - Original question
   * @returns {Array} Re-ranked chunks with composite scores
   */
  applyReRanking(chunks, question) {
    if (chunks.length === 0) return chunks;

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

    // Sort by final composite score (highest first)
    scoredChunks.sort((a, b) => b.finalScore - a.finalScore);

    console.log(`🔄 Re-ranked ${scoredChunks.length} chunks using advanced scoring`);

    return scoredChunks;
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
  extractAnswerComponents(relevantChunks, question, questionAnalysis) {
    try {
      // Ensure we have valid inputs
      if (!relevantChunks || relevantChunks.length === 0) {
        return this.getEmptyComponents();
      }

      const allText = relevantChunks
        .filter(chunk => chunk && chunk.content)
        .map(chunk => chunk.content)
        .join(" ");

      if (!allText || allText.trim().length === 0) {
        return this.getEmptyComponents();
      }

      // Extract different types of content based on question type
      const components = {
        mainDefinition: this.extractMainDefinition(allText, question) || null,
        categories: this.extractCategories(allText, questionAnalysis) || [],
        examples: this.extractExamples(allText, questionAnalysis) || [],
        applications: this.extractApplications(allText, questionAnalysis) || [],
        keyPoints: this.extractKeyPoints(allText, question, questionAnalysis) || [],
        supportingDetails: this.extractSupportingDetails(relevantChunks, questionAnalysis) || { sources: 0, topDocuments: [], confidence: 0, topics: [] },
        conclusion: this.generateConclusion(questionAnalysis) || null
      };

      return components;
    } catch (error) {
      console.error("❌ Error in extractAnswerComponents:", error);
      return this.getEmptyComponents();
    }
  }

  /**
   * Get empty components structure for fallback
   * @returns {Object} Empty components object
   */
  getEmptyComponents() {
    return {
      mainDefinition: null,
      categories: [],
      examples: [],
      applications: [],
      keyPoints: [],
      supportingDetails: { sources: 0, topDocuments: [], confidence: 0, topics: [] },
      conclusion: null
    };
  }

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
   * Expand query with synonyms and related terms for better retrieval
   * @param {string} originalQuery - Original user question
   * @returns {string} Expanded query with additional terms
   */
  expandQuery(originalQuery) {
    let expandedQuery = originalQuery;

    // Apply multiple expansion strategies
    expandedQuery = this.applySynonymExpansion(expandedQuery);
    expandedQuery = this.applyQuestionTypeExpansion(expandedQuery);
    expandedQuery = this.applyContextualExpansion(expandedQuery);

    // Remove duplicates and clean up
    expandedQuery = this.cleanExpandedQuery(expandedQuery);

    return expandedQuery;
  }

  /**
   * Apply synonym expansion based on common terms
   * @param {string} query - Query to expand
   * @returns {string} Query with synonyms added
   */
  applySynonymExpansion(query) {
    const synonymMap = {
      // Technical terms
      'code': ['programming', 'script', 'function', 'algorithm'],
      'data': ['information', 'dataset', 'records', 'content'],
      'file': ['document', 'resource', 'asset'],
      'process': ['workflow', 'procedure', 'method', 'approach'],
      'system': ['platform', 'framework', 'infrastructure'],
      'user': ['person', 'individual', 'customer', 'client'],
      'error': ['issue', 'problem', 'bug', 'failure'],
      'result': ['output', 'outcome', 'response', 'answer'],

      // Question words
      'what': ['what', 'which', 'describe', 'explain'],
      'how': ['how', 'what is the process', 'steps', 'procedure'],
      'why': ['why', 'reason', 'purpose', 'cause'],
      'when': ['when', 'time', 'schedule', 'period'],
      'where': ['where', 'location', 'place', 'position'],

      // Common concepts
      'create': ['create', 'build', 'develop', 'implement', 'generate'],
      'find': ['find', 'search', 'locate', 'discover', 'identify'],
      'change': ['change', 'modify', 'update', 'alter', 'transform'],
      'connect': ['connect', 'link', 'integrate', 'join', 'associate'],
      'manage': ['manage', 'handle', 'control', 'organize', 'administer'],

      // Domain-specific (can be customized based on your use case)
      'api': ['api', 'interface', 'endpoint', 'service'],
      'database': ['database', 'storage', 'data store', 'repository'],
      'server': ['server', 'host', 'machine', 'instance'],
      'client': ['client', 'application', 'frontend', 'consumer']
    };

    let expandedQuery = query;
    const queryLower = query.toLowerCase();

    // Add synonyms for matched words
    Object.entries(synonymMap).forEach(([key, synonyms]) => {
      if (queryLower.includes(key)) {
        // Add 2-3 most relevant synonyms (avoid making query too long)
        const relevantSynonyms = synonyms.slice(0, 2);
        expandedQuery += ' ' + relevantSynonyms.join(' ');
      }
    });

    return expandedQuery;
  }

  /**
   * Apply expansion based on question type
   * @param {string} query - Query to expand
   * @returns {string} Query with type-specific expansions
   */
  applyQuestionTypeExpansion(query) {
    const queryLower = query.toLowerCase();
    let expandedQuery = query;

    // Question type detection and expansion
    if (queryLower.startsWith('what') || queryLower.includes('what is')) {
      expandedQuery += ' definition description meaning explanation';
    }

    if (queryLower.startsWith('how') || queryLower.includes('how to') || queryLower.includes('how do')) {
      expandedQuery += ' steps procedure process tutorial guide instructions';
    }

    if (queryLower.startsWith('why') || queryLower.includes('why does') || queryLower.includes('why is')) {
      expandedQuery += ' reason purpose cause explanation benefit';
    }

    if (queryLower.startsWith('when') || queryLower.includes('when should') || queryLower.includes('when do')) {
      expandedQuery += ' time schedule timing period duration';
    }

    if (queryLower.startsWith('where') || queryLower.includes('where is') || queryLower.includes('where can')) {
      expandedQuery += ' location place position address path';
    }

    if (queryLower.includes('error') || queryLower.includes('problem') || queryLower.includes('issue')) {
      expandedQuery += ' troubleshooting solution fix resolution debug';
    }

    if (queryLower.includes('example') || queryLower.includes('sample')) {
      expandedQuery += ' instance case scenario demonstration illustration';
    }

    return expandedQuery;
  }

  /**
   * Apply contextual expansion based on query patterns
   * @param {string} query - Query to expand
   * @returns {string} Query with contextual expansions
   */
  applyContextualExpansion(query) {
    const queryLower = query.toLowerCase();
    let expandedQuery = query;

    // Technical context patterns
    if (queryLower.includes('install') || queryLower.includes('setup')) {
      expandedQuery += ' installation configuration deployment prerequisites requirements';
    }

    if (queryLower.includes('performance') || queryLower.includes('speed') || queryLower.includes('slow')) {
      expandedQuery += ' optimization efficiency speed performance bottleneck latency';
    }

    if (queryLower.includes('security') || queryLower.includes('safe') || queryLower.includes('protect')) {
      expandedQuery += ' security protection authentication authorization encryption';
    }

    if (queryLower.includes('test') || queryLower.includes('testing')) {
      expandedQuery += ' testing validation verification unit test integration test';
    }

    // Length-based expansion (don't expand very short queries too much)
    if (query.split(' ').length <= 3) {
      expandedQuery += ' information details overview summary guide';
    }

    return expandedQuery;
  }

  /**
   * Clean expanded query by removing duplicates and excessive length
   * @param {string} query - Expanded query to clean
   * @returns {string} Cleaned query
   */
  cleanExpandedQuery(query) {
    // Split into words and remove duplicates (case insensitive)
    const words = query.split(/\s+/);
    const seen = new Set();
    const uniqueWords = [];

    words.forEach(word => {
      const lowerWord = word.toLowerCase();
      if (!seen.has(lowerWord) && word.length > 1) {
        seen.add(lowerWord);
        uniqueWords.push(word);
      }
    });

    // Limit query length to prevent excessive expansion
    const maxWords = 20; // Reasonable limit for embedding models
    const limitedWords = uniqueWords.slice(0, maxWords);

    return limitedWords.join(' ');
  }

  /**
   * Perform mixed retrieval combining multiple search strategies
   * @param {number[]} questionEmbedding - Question embedding vector
   * @param {string} originalQuestion - Original question text
   * @returns {Object} Combined search results from multiple strategies
   */
  async performMixedRetrieval(questionEmbedding, originalQuestion) {
    const retrievalPromises = [
      // 1. Semantic search (existing)
      this.vectorStore.search(questionEmbedding, this.maxResults * 2).then(results => ({
        type: 'semantic',
        results,
        weight: 0.5
      })),

      // 2. Keyword search
      this.performKeywordSearch(originalQuestion).then(results => ({
        type: 'keyword',
        results,
        weight: 0.3
      })),

      // 3. Metadata-filtered search
      this.performMetadataSearch(questionEmbedding, originalQuestion).then(results => ({
        type: 'metadata',
        results,
        weight: 0.2
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
      const semanticResults = await this.vectorStore.search(questionEmbedding, this.maxResults);
      return {
        documents: semanticResults.documents || [[]],
        distances: semanticResults.distances || [[]],
        metadatas: semanticResults.metadatas || [[]],
        ids: semanticResults.ids || [[]]
      };
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
        this.vectorStore.searchDocuments(keyword)
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
  async performMetadataSearch(questionEmbedding, question) {
    try {
      // Determine filters based on question analysis
      const filters = this.analyzeQuestionForFilters(question);

      // Perform filtered search
      const filteredResults = await this.vectorStore.searchWithFilters(questionEmbedding, filters);

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
   * @param {Array} results - Search results
   * @returns {Object} Vector store format results
   */
  convertToVectorStoreFormat(results) {
    if (!results || results.length === 0) {
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

  /**
   * Process mixed search results (replacement for processSearchResults)
   * @param {Object} searchResults - Combined search results
   * @param {string} question - Original question
   * @returns {Array} Filtered and re-ranked relevant chunks
   */
  processMixedSearchResults(searchResults, question) {
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

      // For mixed retrieval, be more lenient with distance threshold
      if (distance > 3.0) { // Allow higher distance for mixed results
        continue;
      }

      // Check if chunk is relevant to the question
      if (this.isChunkRelevantToQuestion(chunk, question)) {
        relevantChunks.push({
          content: chunk,
          similarity,
          metadata: metadatas[i] || {},
          index: i,
          retrievalMethod: 'mixed' // Mark as mixed retrieval result
        });
      }
    }

    // Apply advanced re-ranking system
    const reRankedChunks = this.applyReRanking(relevantChunks, question);

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

    // Choose reasoning strategy based on question type and complexity
    let reasoningStrategy = 'standard';

    if (this.requiresChainOfThought(question, questionAnalysis)) {
      reasoningStrategy = 'chain_of_thought';
    } else if (this.requiresSelfConsistency(question, relevantChunks)) {
      reasoningStrategy = 'self_consistency';
    } else if (this.isComplexReasoningQuestion(question)) {
      reasoningStrategy = 'multi_step_reasoning';
    }

    console.log(`🧠 Applying ${reasoningStrategy} reasoning strategy`);

    let answer;
    let reasoningSteps = [];
    let confidence = 0;

    switch (reasoningStrategy) {
      case 'chain_of_thought':
        const cotResult = await this.applyChainOfThought(question, relevantChunks, questionAnalysis);
        answer = cotResult.answer;
        reasoningSteps = cotResult.steps;
        confidence = cotResult.confidence;
        break;

      case 'self_consistency':
        const scResult = await this.applySelfConsistency(question, relevantChunks);
        answer = scResult.answer;
        confidence = scResult.confidence;
        break;

      case 'multi_step_reasoning':
        const msResult = await this.applyMultiStepReasoning(question, relevantChunks, questionAnalysis);
        answer = msResult.answer;
        reasoningSteps = msResult.steps;
        confidence = msResult.confidence;
        break;

      default:
        answer = this.generateAnswer(question, relevantChunks, conversationHistory);
        confidence = 0.7; // Standard confidence
    }

    return {
      answer,
      reasoningStrategy,
      reasoningSteps,
      confidence,
      questionAnalysis
    };
  }

  /**
   * Determine if question requires chain-of-thought reasoning
   * @param {string} question - User's question
   * @param {Object} questionAnalysis - Question analysis
   * @returns {boolean} Whether CoT is needed
   */
  requiresChainOfThought(question, questionAnalysis) {
    const questionLower = question.toLowerCase();

    // Questions that benefit from step-by-step reasoning
    const cotIndicators = [
      'how to', 'why does', 'explain', 'analyze', 'compare',
      'what happens when', 'what if', 'solve', 'calculate',
      'reason', 'because', 'therefore', 'consequently'
    ];

    const hasCotIndicators = cotIndicators.some(indicator => questionLower.includes(indicator));

    // Complex question types that benefit from CoT
    const complexTypes = ['analysis', 'comparison', 'why_explain'];
    const isComplexType = complexTypes.includes(questionAnalysis.type);

    // Long questions or questions with multiple parts
    const isLongQuestion = question.split(' ').length > 12;
    const hasMultipleParts = (questionLower.match(/\?/) || []).length > 1;

    return hasCotIndicators || isComplexType || isLongQuestion || hasMultipleParts;
  }

  /**
   * Determine if question requires self-consistency checking
   * @param {string} question - User's question
   * @param {Array} relevantChunks - Relevant chunks
   * @returns {boolean} Whether self-consistency is needed
   */
  requiresSelfConsistency(question, relevantChunks) {
    // Use self-consistency for questions where multiple interpretations are possible
    const ambiguousTerms = ['best', 'better', 'optimal', 'recommended', 'preferred'];
    const hasAmbiguousTerms = ambiguousTerms.some(term =>
      question.toLowerCase().includes(term)
    );

    // Use self-consistency when we have many relevant chunks (potential for conflicting info)
    const hasManyChunks = relevantChunks.length > 5;

    return hasAmbiguousTerms || hasManyChunks;
  }

  /**
   * Check if question requires complex multi-step reasoning
   * @param {string} question - User's question
   * @returns {boolean} Whether multi-step reasoning is needed
   */
  isComplexReasoningQuestion(question) {
    const questionLower = question.toLowerCase();

    const complexPatterns = [
      'relationship between', 'interaction', 'impact of',
      'influence', 'effect', 'consequence', 'trade-off',
      'pros and cons', 'advantages and disadvantages'
    ];

    return complexPatterns.some(pattern => questionLower.includes(pattern));
  }

  /**
   * Apply chain-of-thought reasoning to generate answer
   * @param {string} question - User's question
   * @param {Array} relevantChunks - Relevant chunks
   * @param {Object} questionAnalysis - Question analysis
   * @returns {Object} Chain-of-thought result
   */
  async applyChainOfThought(question, relevantChunks, questionAnalysis) {
    console.log("🔗 Applying Chain-of-Thought reasoning");

    const steps = [];
    let currentAnswer = "";
    let confidence = 0.8;

    // Step 1: Understand the question
    steps.push({
      step: 1,
      type: 'understanding',
      content: `Understanding question: "${question}" - Type: ${questionAnalysis.type}, Complexity: ${questionAnalysis.complexity}`
    });

    // Step 2: Gather relevant information
    const keyInformation = this.extractKeyInformation(relevantChunks, question);
    steps.push({
      step: 2,
      type: 'information_gathering',
      content: `Found ${keyInformation.length} key pieces of information relevant to the question`
    });

    // Step 3: Analyze and synthesize information
    const analysis = this.analyzeInformation(keyInformation, question, questionAnalysis);
    steps.push({
      step: 3,
      type: 'analysis',
      content: `Analyzed information: ${analysis.mainPoints.length} main points identified`
    });

    // Step 4: Generate structured answer
    currentAnswer = this.generateStructuredAnswer(keyInformation, analysis, questionAnalysis);
    steps.push({
      step: 4,
      type: 'synthesis',
      content: `Synthesized comprehensive answer based on analysis`
    });

    // Step 5: Validate answer quality
    const validation = this.validateAnswerQuality(currentAnswer, question, relevantChunks);
    if (!validation.isValid) {
      console.log("⚠️ Answer validation failed, attempting correction");
      currentAnswer = this.correctAnswer(currentAnswer, validation.issues);
      confidence -= 0.1;
    }
    steps.push({
      step: 5,
      type: 'validation',
      content: `Validated answer quality: ${validation.isValid ? 'Passed' : 'Corrected'}`
    });

    return {
      answer: currentAnswer,
      steps,
      confidence
    };
  }

  /**
   * Apply self-consistency checking for reliable answers
   * @param {string} question - User's question
   * @param {Array} relevantChunks - Relevant chunks
   * @returns {Object} Self-consistency result
   */
  async applySelfConsistency(question, relevantChunks) {
    console.log("🔄 Applying Self-Consistency checking");

    // Generate multiple answer variations
    const answerVariations = [];
    const numVariations = Math.min(3, relevantChunks.length);

    for (let i = 0; i < numVariations; i++) {
      const subset = this.selectChunkSubset(relevantChunks, i);
      const variation = this.generateAnswer(question, subset, []);
      answerVariations.push(variation);
    }

    // Find the most consistent answer
    const consistencyResult = this.findMostConsistentAnswer(answerVariations);

    return {
      answer: consistencyResult.answer,
      confidence: consistencyResult.consistencyScore
    };
  }

  /**
   * Apply multi-step reasoning for complex questions
   * @param {string} question - User's question
   * @param {Array} relevantChunks - Relevant chunks
   * @param {Object} questionAnalysis - Question analysis
   * @returns {Object} Multi-step reasoning result
   */
  async applyMultiStepReasoning(question, relevantChunks, questionAnalysis) {
    console.log("🔀 Applying Multi-Step Reasoning");

    const steps = [];
    let currentContext = "";
    let confidence = 0.75;

    // Break down complex question into sub-questions
    const subQuestions = this.breakDownQuestion(question, questionAnalysis);

    steps.push({
      step: 0,
      type: 'decomposition',
      content: `Decomposed question into ${subQuestions.length} sub-questions`
    });

    // Answer each sub-question sequentially, building context
    for (let i = 0; i < subQuestions.length; i++) {
      const subQuestion = subQuestions[i];
      const subAnswer = this.generateAnswer(subQuestion, relevantChunks, []);

      steps.push({
        step: i + 1,
        type: 'sub_reasoning',
        content: `Sub-question ${i + 1}: ${subQuestion}`
      });

      currentContext += ` ${subAnswer}`;
    }

    // Synthesize final answer from sub-answers
    const finalAnswer = this.synthesizeMultiStepAnswer(subQuestions, currentContext, question);

    steps.push({
      step: subQuestions.length + 1,
      type: 'synthesis',
      content: 'Synthesized final answer from sub-question responses'
    });

    return {
      answer: finalAnswer,
      steps,
      confidence
    };
  }

  /**
   * Extract key information from chunks for reasoning
   * @param {Array} chunks - Relevant chunks
   * @param {string} question - Original question
   * @returns {Array} Key information pieces
   */
  extractKeyInformation(chunks, question) {
    const questionKeywords = this.extractKeywordsForAnalysis(question);
    const keyInfo = [];

    chunks.forEach(chunk => {
      const sentences = chunk.content.split(/[.!?]+/);
      sentences.forEach(sentence => {
        const trimmed = sentence.trim();
        if (trimmed.length > 10) {
          const matches = questionKeywords.filter(keyword =>
            trimmed.toLowerCase().includes(keyword.toLowerCase())
          );

          if (matches.length > 0) {
            keyInfo.push({
              text: trimmed,
              relevance: matches.length,
              source: chunk.metadata.documentName || 'Unknown'
            });
          }
        }
      });
    });

    return keyInfo.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Analyze information for patterns and relationships
   * @param {Array} keyInfo - Key information pieces
   * @param {string} question - Original question
   * @param {Object} questionAnalysis - Question analysis
   * @returns {Object} Analysis results
   */
  analyzeInformation(keyInfo, question, questionAnalysis) {
    const mainPoints = [];
    const relationships = [];
    const contradictions = [];

    // Extract main points
    keyInfo.slice(0, 5).forEach(info => {
      mainPoints.push(info.text);
    });

    // Look for relationships and contradictions
    for (let i = 0; i < keyInfo.length - 1; i++) {
      for (let j = i + 1; j < keyInfo.length; j++) {
        const relation = this.analyzeRelationship(keyInfo[i].text, keyInfo[j].text);
        if (relation.type !== 'unrelated') {
          relationships.push({
            items: [keyInfo[i].text, keyInfo[j].text],
            type: relation.type,
            description: relation.description
          });
        }
      }
    }

    return {
      mainPoints,
      relationships,
      contradictions,
      questionType: questionAnalysis.type
    };
  }

  /**
   * Analyze relationship between two pieces of information
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {Object} Relationship analysis
   */
  analyzeRelationship(text1, text2) {
    const text1Lower = text1.toLowerCase();
    const text2Lower = text2.toLowerCase();

    // Check for causal relationships
    if ((text1Lower.includes('because') || text1Lower.includes('therefore')) &&
        text2Lower.includes('because') || text2Lower.includes('therefore')) {
      return { type: 'causal', description: 'Causal relationship detected' };
    }

    // Check for comparative relationships
    if ((text1Lower.includes('better') || text1Lower.includes('worse')) &&
        (text2Lower.includes('better') || text2Lower.includes('worse'))) {
      return { type: 'comparative', description: 'Comparative relationship detected' };
    }

    // Check for sequential relationships
    if ((text1Lower.includes('first') || text1Lower.includes('then') || text1Lower.includes('next')) &&
        (text2Lower.includes('first') || text2Lower.includes('then') || text2Lower.includes('next'))) {
      return { type: 'sequential', description: 'Sequential relationship detected' };
    }

    return { type: 'unrelated', description: 'No clear relationship' };
  }

  /**
   * Generate structured answer from analysis
   * @param {Array} keyInfo - Key information
   * @param {Object} analysis - Analysis results
   * @param {Object} questionAnalysis - Question analysis
   * @returns {string} Structured answer
   */
  generateStructuredAnswer(keyInfo, analysis, questionAnalysis) {
    const sections = [];

    // Title section
    const title = this.generateAnswerTitle(question, questionAnalysis);
    if (title) {
      sections.push(`🔍 ${title}`);
    }

    // Main points section
    if (analysis.mainPoints.length > 0) {
      sections.push(`📋 **Key Information:**\n${analysis.mainPoints.map(point => `• ${point}`).join('\n')}`);
    }

    // Relationships section (if any found)
    if (analysis.relationships.length > 0) {
      const relationText = analysis.relationships.map(rel =>
        `• ${rel.description}: ${rel.items[0].substring(0, 50)}... ↔ ${rel.items[1].substring(0, 50)}...`
      ).join('\n');
      sections.push(`🔗 **Relationships Found:**\n${relationText}`);
    }

    // Conclusion based on question type
    const conclusion = this.generateReasoningConclusion(analysis, questionAnalysis);
    if (conclusion) {
      sections.push(`🔹 **Conclusion:** ${conclusion}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Generate conclusion based on reasoning analysis
   * @param {Object} analysis - Analysis results
   * @param {Object} questionAnalysis - Question analysis
   * @returns {string} Conclusion text
   */
  generateReasoningConclusion(analysis, questionAnalysis) {
    const conclusions = {
      definition: "This analysis provides a comprehensive understanding of the concept and its key characteristics.",
      how_to: "Based on the available information, this step-by-step approach provides a clear path forward.",
      comparison: "The analysis reveals distinct differences and similarities that should guide decision-making.",
      why_explain: "The reasoning shows clear causal relationships and contributing factors.",
      analysis: "This detailed analysis uncovers important insights and patterns in the information.",
      general: "The reasoning process has identified the most relevant and reliable information available."
    };

    return conclusions[questionAnalysis.type] || conclusions.general;
  }

  /**
   * Validate answer quality and identify issues
   * @param {string} answer - Generated answer
   * @param {string} question - Original question
   * @param {Array} chunks - Source chunks
   * @returns {Object} Validation result
   */
  validateAnswerQuality(answer, question, chunks) {
    const issues = [];
    let isValid = true;

    // Check if answer addresses the question
    const questionKeywords = this.extractKeywordsForAnalysis(question);
    const answerLower = answer.toLowerCase();
    const matchedKeywords = questionKeywords.filter(keyword =>
      answerLower.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length < questionKeywords.length * 0.5) {
      issues.push('Answer may not fully address the question');
      isValid = false;
    }

    // Check for hallucinations (content not in source chunks)
    const sentences = answer.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.trim().length > 20) {
        const foundInChunks = chunks.some(chunk =>
          chunk.content.toLowerCase().includes(sentence.toLowerCase().substring(0, 30))
        );
        if (!foundInChunks) {
          issues.push('Potential hallucination detected');
          isValid = false;
          break;
        }
      }
    }

    // Check answer length appropriateness
    if (answer.length < 50) {
      issues.push('Answer too short');
      isValid = false;
    }

    return { isValid, issues };
  }

  /**
   * Correct identified issues in the answer
   * @param {string} answer - Original answer
   * @param {Array} issues - Identified issues
   * @returns {string} Corrected answer
   */
  correctAnswer(answer, issues) {
    let correctedAnswer = answer;

    issues.forEach(issue => {
      if (issue === 'Answer too short') {
        correctedAnswer += '\n\nFor more detailed information, please provide additional context or ask follow-up questions.';
      }
    });

    return correctedAnswer;
  }

  /**
   * Select subset of chunks for self-consistency checking
   * @param {Array} chunks - All chunks
   * @param {number} index - Subset index
   * @returns {Array} Chunk subset
   */
  selectChunkSubset(chunks, index) {
    const subsetSize = Math.max(2, Math.floor(chunks.length * 0.6));
    const start = (index * subsetSize) % chunks.length;
    return chunks.slice(start, start + subsetSize);
  }

  /**
   * Find most consistent answer from variations
   * @param {Array} variations - Answer variations
   * @returns {Object} Most consistent answer
   */
  findMostConsistentAnswer(variations) {
    if (variations.length === 1) {
      return { answer: variations[0], consistencyScore: 0.8 };
    }

    // Simple consistency check based on text similarity
    let bestAnswer = variations[0];
    let bestConsistency = 0;

    for (let i = 0; i < variations.length; i++) {
      let consistency = 0;
      for (let j = 0; j < variations.length; j++) {
        if (i !== j) {
          const similarity = this.calculateTextSimilarity(variations[i], variations[j]);
          consistency += similarity;
        }
      }
      consistency /= (variations.length - 1);

      if (consistency > bestConsistency) {
        bestConsistency = consistency;
        bestAnswer = variations[i];
      }
    }

    return {
      answer: bestAnswer,
      consistencyScore: Math.min(bestConsistency + 0.3, 1.0) // Boost confidence for consistency
    };
  }

  /**
   * Break down complex question into sub-questions
   * @param {string} question - Complex question
   * @param {Object} questionAnalysis - Question analysis
   * @returns {Array} Sub-questions
   */
  breakDownQuestion(question, questionAnalysis) {
    const subQuestions = [];

    if (questionAnalysis.type === 'comparison') {
      // For comparison questions, create sub-questions for each item
      const items = this.extractComparisonItems(question);
      items.forEach(item => {
        subQuestions.push(`What are the characteristics of ${item}?`);
      });
      subQuestions.push(`How do these items compare in terms of key factors?`);
    } else if (questionAnalysis.type === 'analysis') {
      // For analysis questions, break into components
      subQuestions.push(`What are the main components involved?`);
      subQuestions.push(`How do these components interact?`);
      subQuestions.push(`What are the key outcomes or implications?`);
    } else {
      // General decomposition for complex questions
      const parts = question.split(/and|or|but|however|therefore/i);
      parts.forEach(part => {
        if (part.trim().length > 10) {
          subQuestions.push(part.trim());
        }
      });
    }

    return subQuestions.slice(0, 4); // Limit to 4 sub-questions
  }

  /**
   * Extract items being compared from comparison question
   * @param {string} question - Comparison question
   * @returns {Array} Items being compared
   */
  extractComparisonItems(question) {
    const questionLower = question.toLowerCase();
    const items = [];

    // Look for common comparison patterns
    const vsPattern = questionLower.split(/\bvs\b|\bversus\b|\bcompared to\b/i);
    if (vsPattern.length > 1) {
      vsPattern.forEach(part => {
        const words = part.trim().split(/\s+/);
        if (words.length > 0) {
          items.push(words.slice(-2).join(' ')); // Take last 2 words as item
        }
      });
    }

    return items.length > 0 ? items : ['item1', 'item2']; // Fallback
  }

  /**
   * Synthesize final answer from multi-step reasoning
   * @param {Array} subQuestions - Sub-questions
   * @param {string} context - Accumulated context
   * @param {string} originalQuestion - Original question
   * @returns {string} Synthesized answer
   */
  synthesizeMultiStepAnswer(subQuestions, context, originalQuestion) {
    return `Based on multi-step analysis addressing: ${subQuestions.join('; ')}\n\n${context}\n\nThis comprehensive analysis provides a complete answer to: "${originalQuestion}"`;
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

      // Get comprehensive information from chunks
      const answerComponents = this.extractAnswerComponents(relevantChunks, question, questionAnalysis);

      // Generate structured answer based on question type
      let answer = this.buildStructuredAnswer(question, answerComponents, questionAnalysis);

      // Fallback 1: If structured answer is too short or empty, try direct chunk content
      if (!answer || answer.trim().length < 50) {
        console.log("🔄 Structured answer too short, using fallback approach");
        answer = this.generateFallbackAnswer(relevantChunks, question);
      }

      // Fallback 2: If still no answer, use the most relevant chunk directly
      if (!answer || answer.trim().length < 20) {
        console.log("🔄 Fallback answer insufficient, using raw chunk content");
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
   * Perform comprehensive quality control on generated answer
   * @param {string} answer - Generated answer
   * @param {string} question - Original question
   * @param {Array} chunks - Source chunks
   * @returns {Object} Quality control results
   */
  async performQualityControl(answer, question, chunks) {
    const qualityMetrics = {
      hallucinationScore: 0,
      groundednessScore: 1.0,
      factualConsistency: 1.0,
      answerCompleteness: 0.8,
      overallQuality: 0.8
    };

    try {
      // 1. Hallucination Detection
      qualityMetrics.hallucinationScore = this.detectHallucinations(answer, chunks);

      // 2. Groundedness Check
      qualityMetrics.groundednessScore = this.checkGroundedness(answer, chunks);

      // 3. Factual Consistency
      qualityMetrics.factualConsistency = this.checkFactualConsistency(answer, chunks);

      // 4. Answer Completeness
      qualityMetrics.answerCompleteness = this.assessAnswerCompleteness(answer, question);

      // 5. Overall Quality Score
      qualityMetrics.overallQuality = this.calculateOverallQuality(qualityMetrics);

      console.log(`🛡️ Quality Control Results: Hallucination: ${(qualityMetrics.hallucinationScore * 100).toFixed(1)}%, Groundedness: ${(qualityMetrics.groundednessScore * 100).toFixed(1)}%, Overall: ${(qualityMetrics.overallQuality * 100).toFixed(1)}%`);

      return qualityMetrics;
    } catch (error) {
      console.warn("Quality control failed:", error.message);
      return qualityMetrics; // Return default scores on failure
    }
  }

  /**
   * Detect potential hallucinations in the answer
   * @param {string} answer - Generated answer
   * @param {Array} chunks - Source chunks
   * @returns {number} Hallucination score (0-1, higher = more hallucinations)
   */
  detectHallucinations(answer, chunks) {
    let hallucinationScore = 0;
    const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const allChunkText = chunks.map(chunk => chunk.content).join(' ').toLowerCase();

    for (const sentence of sentences) {
      const trimmed = sentence.trim().toLowerCase();

      // Skip very short sentences
      if (trimmed.length < 20) continue;

      // Check if sentence contains factual claims not supported by sources
      const hasFactualClaims = this.containsFactualClaims(trimmed);
      if (hasFactualClaims) {
        // Check if this factual claim exists in source chunks
        const claimSupported = this.isClaimSupported(trimmed, allChunkText);

        if (!claimSupported) {
          hallucinationScore += 0.2; // Increment for unsupported claims
        }
      }

      // Check for contradictory information
      const hasContradictions = this.detectContradictions(trimmed, allChunkText);
      if (hasContradictions) {
        hallucinationScore += 0.15;
      }
    }

    return Math.min(hallucinationScore, 1.0);
  }

  /**
   * Check if text contains factual claims
   * @param {string} text - Text to analyze
   * @returns {boolean} Whether text contains factual claims
   */
  containsFactualClaims(text) {
    const factualIndicators = [
      'is ', 'are ', 'was ', 'were ', 'has ', 'have ', 'contains ',
      'includes ', 'requires ', 'needs ', 'must ', 'should ', 'can ',
      'cannot ', 'will ', 'would ', 'does ', 'do ', 'did '
    ];

    const lowerText = text.toLowerCase();
    return factualIndicators.some(indicator => lowerText.includes(indicator));
  }

  /**
   * Check if a factual claim is supported by source text
   * @param {string} claim - Factual claim
   * @param {string} sourceText - Combined source text
   * @returns {boolean} Whether claim is supported
   */
  isClaimSupported(claim, sourceText) {
    // Extract key terms from the claim
    const claimWords = claim.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word))
      .slice(0, 5); // Take first 5 significant words

    if (claimWords.length === 0) return true; // Can't verify very short claims

    // Check if source contains similar wording
    const sourceWords = sourceText.split(/\s+/);
    let matches = 0;

    claimWords.forEach(claimWord => {
      if (sourceWords.some(sourceWord =>
        this.calculateLevenshteinDistance(claimWord, sourceWord.toLowerCase()) <= 2
      )) {
        matches++;
      }
    });

    return matches >= Math.ceil(claimWords.length * 0.6); // 60% of key terms should match
  }

  /**
   * Detect contradictions between answer and source text
   * @param {string} answerText - Answer text
   * @param {string} sourceText - Source text
   * @returns {boolean} Whether contradictions detected
   */
  detectContradictions(answerText, sourceText) {
    // Simple contradiction detection based on negations
    const negations = ['not', 'never', 'no', 'none', 'nothing', 'nobody', 'nowhere'];
    const answerWords = answerText.split(/\s+/);
    const sourceWords = sourceText.split(/\s+/);

    // Check for direct contradictions
    for (const negation of negations) {
      if (answerWords.includes(negation)) {
        // Look for the word being negated in source
        const negatedIndex = answerWords.indexOf(negation);
        if (negatedIndex > 0) {
          const negatedWord = answerWords[negatedIndex - 1];
          if (sourceWords.some(word => word.toLowerCase() === negatedWord.toLowerCase())) {
            return true; // Potential contradiction
          }
        }
      }
    }

    return false;
  }

  /**
   * Check how well the answer is grounded in source material
   * @param {string} answer - Generated answer
   * @param {Array} chunks - Source chunks
   * @returns {number} Groundedness score (0-1)
   */
  checkGroundedness(answer, chunks) {
    const answerLower = answer.toLowerCase();
    let totalGroundedWords = 0;
    let totalWords = 0;

    const answerWords = answerLower.split(/\s+/).filter(word => word.length > 2);
    totalWords = answerWords.length;

    // Check each answer word against all chunks
    answerWords.forEach(word => {
      let foundInChunk = false;
      for (const chunk of chunks) {
        if (chunk.content.toLowerCase().includes(word)) {
          foundInChunk = true;
          break;
        }
      }
      if (foundInChunk) {
        totalGroundedWords++;
      }
    });

    return totalWords > 0 ? totalGroundedWords / totalWords : 0;
  }

  /**
   * Check factual consistency across sources
   * @param {string} answer - Generated answer
   * @param {Array} chunks - Source chunks
   * @returns {number} Consistency score (0-1)
   */
  checkFactualConsistency(answer, chunks) {
    if (chunks.length <= 1) return 1.0; // No consistency issues with single source

    const facts = this.extractFactsFromAnswer(answer);
    let consistentFacts = 0;

    facts.forEach(fact => {
      let factSupported = 0;
      chunks.forEach(chunk => {
        if (this.isFactInChunk(fact, chunk.content)) {
          factSupported++;
        }
      });

      // Fact is consistent if supported by majority of chunks
      if (factSupported >= Math.ceil(chunks.length * 0.5)) {
        consistentFacts++;
      }
    });

    return facts.length > 0 ? consistentFacts / facts.length : 1.0;
  }

  /**
   * Extract factual statements from answer
   * @param {string} answer - Answer text
   * @returns {Array} Array of factual statements
   */
  extractFactsFromAnswer(answer) {
    const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 15);
    return sentences.filter(sentence => this.containsFactualClaims(sentence));
  }

  /**
   * Check if a fact is present in chunk content
   * @param {string} fact - Factual statement
   * @param {string} chunkContent - Chunk content
   * @returns {boolean} Whether fact is in chunk
   */
  isFactInChunk(fact, chunkContent) {
    const factWords = fact.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const chunkWords = chunkContent.toLowerCase().split(/\s+/);

    let matches = 0;
    factWords.forEach(word => {
      if (chunkWords.includes(word)) {
        matches++;
      }
    });

    return matches >= Math.ceil(factWords.length * 0.7);
  }

  /**
   * Assess answer completeness
   * @param {string} answer - Generated answer
   * @param {string} question - Original question
   * @returns {number} Completeness score (0-1)
   */
  assessAnswerCompleteness(answer, question) {
    const questionAnalysis = this.analyzeQuestionType(question);
    let completeness = 0.5; // Base score

    // Check answer length appropriateness
    const wordCount = answer.split(/\s+/).length;
    const expectedLength = this.getExpectedAnswerLength(questionAnalysis);

    if (wordCount >= expectedLength * 0.5 && wordCount <= expectedLength * 1.5) {
      completeness += 0.2;
    }

    // Check for structured elements based on question type
    if (questionAnalysis.needsStructure) {
      const hasStructure = this.hasStructuredElements(answer, questionAnalysis);
      if (hasStructure) {
        completeness += 0.2;
      }
    }

    // Check question coverage
    const questionKeywords = this.extractKeywordsForAnalysis(question);
    const answerLower = answer.toLowerCase();
    const coveredKeywords = questionKeywords.filter(keyword =>
      answerLower.includes(keyword.toLowerCase())
    );

    completeness += (coveredKeywords.length / questionKeywords.length) * 0.3;

    return Math.min(completeness, 1.0);
  }

  /**
   * Get expected answer length based on question type
   * @param {Object} questionAnalysis - Question analysis
   * @returns {number} Expected word count
   */
  getExpectedAnswerLength(questionAnalysis) {
    const lengthMap = {
      definition: 50,
      how_to: 100,
      comparison: 120,
      list_categories: 80,
      why_explain: 90,
      analysis: 150,
      general: 70
    };

    return lengthMap[questionAnalysis.type] || lengthMap.general;
  }

  /**
   * Check if answer has appropriate structured elements
   * @param {string} answer - Answer text
   * @param {Object} questionAnalysis - Question analysis
   * @returns {boolean} Whether answer has structure
   */
  hasStructuredElements(answer, questionAnalysis) {
    const lowerAnswer = answer.toLowerCase();

    switch (questionAnalysis.type) {
      case 'how_to':
        return /\d+\.|step|first|then|next|finally/i.test(lowerAnswer);
      case 'list_categories':
        return /•|-|\d+\./.test(answer) || /types|categories|kinds/i.test(lowerAnswer);
      case 'comparison':
        return /vs|versus|compared|difference|similar/i.test(lowerAnswer);
      case 'analysis':
        return /analysis|insights|findings|conclusion/i.test(lowerAnswer);
      default:
        return /\n\n|•|-/.test(answer); // Basic structure check
    }
  }

  /**
   * Calculate overall quality score from individual metrics
   * @param {Object} metrics - Individual quality metrics
   * @returns {number} Overall quality score (0-1)
   */
  calculateOverallQuality(metrics) {
    // Weighted combination of quality metrics
    const weights = {
      hallucinationScore: -0.3,    // Negative weight (lower hallucination = better)
      groundednessScore: 0.25,     // Positive weight
      factualConsistency: 0.25,    // Positive weight
      answerCompleteness: 0.2      // Positive weight
    };

    let score = 0;
    score += (1 - metrics.hallucinationScore) * Math.abs(weights.hallucinationScore); // Invert hallucination
    score += metrics.groundednessScore * weights.groundednessScore;
    score += metrics.factualConsistency * weights.factualConsistency;
    score += metrics.answerCompleteness * weights.answerCompleteness;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate enhanced confidence score with quality control
   * @param {Array} sources - Answer sources
   * @param {number} totalRelevantChunks - Total relevant chunks
   * @param {number} reasoningConfidence - Reasoning confidence
   * @param {Object} qualityCheck - Quality control results
   * @returns {number} Enhanced confidence score (0-1)
   */
  calculateEnhancedConfidence(sources, totalRelevantChunks, reasoningConfidence, qualityCheck) {
    // Base confidence from sources
    const baseConfidence = this.calculateConfidence(sources, totalRelevantChunks);

    // Combine with reasoning confidence and quality metrics
    const combinedConfidence = (
      baseConfidence * 0.4 +
      reasoningConfidence * 0.3 +
      qualityCheck.overallQuality * 0.3
    );

    // Apply quality penalties
    let finalConfidence = combinedConfidence;

    // Penalty for high hallucination risk
    if (qualityCheck.hallucinationScore > 0.3) {
      finalConfidence *= 0.8;
    }

    // Penalty for poor groundedness
    if (qualityCheck.groundednessScore < 0.5) {
      finalConfidence *= 0.9;
    }

    // Boost for high quality answers
    if (qualityCheck.overallQuality > 0.8) {
      finalConfidence = Math.min(1.0, finalConfidence * 1.1);
    }

    return Math.max(0, Math.min(1, finalConfidence));
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
