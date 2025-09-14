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
    const allText = relevantChunks.map(chunk => chunk.content).join(" ");

    // Extract different types of content based on question type
    const components = {
      mainDefinition: this.extractMainDefinition(allText, question),
      categories: this.extractCategories(allText, questionAnalysis),
      examples: this.extractExamples(allText, questionAnalysis),
      applications: this.extractApplications(allText, questionAnalysis),
      keyPoints: this.extractKeyPoints(allText, question, questionAnalysis),
      supportingDetails: this.extractSupportingDetails(relevantChunks, questionAnalysis),
      conclusion: this.generateConclusion(questionAnalysis)
    };

    return components;
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

    // Title/Header
    sections.push(`🔍 ${this.generateAnswerTitle(question, questionAnalysis)}`);

    // Main definition/introduction
    if (components.mainDefinition) {
      sections.push(`📖 **Definition & Purpose**\n${components.mainDefinition}`);
    }

    // Categories/Types section
    if (components.categories.length > 0) {
      sections.push(`🔸 **${this.getCategoriesTitle(questionAnalysis)}**\n${
        components.categories.map((cat, i) => `${i + 1}. ${cat}`).join('\n')
      }`);
    }

    // Key points section
    if (components.keyPoints.length > 0) {
      sections.push(`📋 **Key Points**\n${
        components.keyPoints.map(point => `• ${point}`).join('\n')
      }`);
    }

    // Examples section
    if (components.examples.length > 0) {
      sections.push(`💡 **Examples**\n${
        components.examples.map(example => `• ${example}`).join('\n')
      }`);
    }

    // Applications section
    if (components.applications.length > 0) {
      sections.push(`🎯 **Applications**\n${
        components.applications.map(app => `• ${app}`).join('\n')
      }`);
    }

    // Conclusion
    if (components.conclusion) {
      sections.push(`🔹 **Conclusion**\n${components.conclusion}`);
    }

    // Add source information
    if (components.supportingDetails.sources > 0) {
      sections.push(`\n📚 *Information sourced from ${components.supportingDetails.sources} relevant sections across ${components.supportingDetails.topDocuments.length} documents*`);
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
   * Generate comprehensive, structured answer based on retrieved chunks
   * @param {string} question - User's question
   * @param {Array} relevantChunks - Relevant document chunks
   * @param {Array} conversationHistory - Previous conversation messages
   * @returns {string} Generated comprehensive answer
   */
  generateAnswer(question, relevantChunks, conversationHistory) {
    // Analyze question type and content depth
    const questionAnalysis = this.analyzeQuestionType(question);

    // Get comprehensive information from chunks
    const answerComponents = this.extractAnswerComponents(relevantChunks, question, questionAnalysis);

    // Generate structured answer based on question type
    let answer = this.buildStructuredAnswer(question, answerComponents, questionAnalysis);

    // Add conversation context if available
    if (conversationHistory.length > 0) {
      answer = this.enhanceWithConversationContext(answer, conversationHistory, question);
    }

    // Ensure answer is not too long but comprehensive
    if (answer.length > this.maxContextLength * 2) { // Allow longer answers for comprehensive responses
      answer = this.smartTruncateAnswer(answer, this.maxContextLength * 1.5);
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
