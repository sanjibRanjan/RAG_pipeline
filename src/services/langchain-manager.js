import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export class LangChainManager {
  constructor(options = {}) {
    this.provider = options.provider || process.env.LLM_PROVIDER || 'openai';
    this.modelName = options.modelName || process.env.LLM_MODEL || this.getDefaultModelName();
    this.temperature = options.temperature || parseFloat(process.env.LLM_TEMPERATURE) || 0.3;
    this.maxTokens = options.maxTokens || parseInt(process.env.LLM_MAX_TOKENS) || 2000;
    this.isInitialized = false;
    this.llm = null;
  }

  getDefaultModelName() {
    switch (this.provider.toLowerCase()) {
      case 'openai':
        return 'gpt-3.5-turbo';
      case 'anthropic':
        return 'claude-3-haiku-20240307';
      case 'google':
      case 'gemini':
        return 'gemini-1.5-flash';
      default:
        return 'gpt-3.5-turbo';
    }
  }

  /**
   * Initialize the LLM client
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      console.log(`🤖 Initializing ${this.provider} LLM client...`);

      switch (this.provider.toLowerCase()) {
        case 'openai':
          this.initializeOpenAI();
          break;
        case 'anthropic':
          this.initializeAnthropic();
          break;
        case 'google':
        case 'gemini':
          this.initializeGemini();
          break;
        default:
          throw new Error(`Unsupported LLM provider: ${this.provider}`);
      }

      // Skip connection test in development to save API quota
      if (process.env.NODE_ENV === 'production' || process.env.TEST_CONNECTION === 'true') {
        await this.testConnection();
      } else {
        console.log(`⏭️ Skipping connection test in development mode (set TEST_CONNECTION=true to enable)`);
      }

      this.isInitialized = true;
      console.log(`✅ ${this.provider} LLM client initialized successfully`);
      return true;

    } catch (error) {
      console.error(`❌ LLM initialization failed:`, error);
      throw new Error(`Failed to initialize LLM: ${error.message}`);
    }
  }

  initializeOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    this.llm = new ChatOpenAI({
      openaiApiKey: apiKey,
      modelName: this.modelName,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    });
  }

  initializeAnthropic() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    this.llm = new ChatAnthropic({
      anthropicApiKey: apiKey,
      modelName: this.modelName,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    });
  }

  initializeGemini() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required");
    }

    // Use official Google Generative AI SDK
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.llm = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: this.maxTokens,
      }
    });

    console.log(`✅ Gemini model initialized: ${this.modelName}`);
  }

  async testConnection() {
    try {
      const testPrompt = "Hello, please respond with just 'OK' if you can read this.";

      if (this.provider === 'google' || this.provider === 'gemini') {
        // Use official Google SDK
        const chat = this.llm.startChat({
          history: [],
        });
        const result = await chat.sendMessage(testPrompt);
        const response = result.response.text();
        if (!response || response.trim() === '') {
          throw new Error("Empty response from Gemini");
        }
        console.log(`🧪 Gemini test successful: ${response.substring(0, 50)}...`);
      } else {
        // Use LangChain interface for other providers
        const response = await this.llm.invoke([new HumanMessage(testPrompt)]);
        if (!response.content || response.content.trim() === '') {
          throw new Error("Empty response from LLM");
        }
        console.log(`🧪 LLM test successful: ${response.content.substring(0, 50)}...`);
      }
    } catch (error) {
      throw new Error(`LLM connection test failed: ${error.message}`);
    }
  }

  /**
   * Generate an answer using retrieved chunks and question context
   * @param {string} question - User's question
   * @param {Array} relevantChunks - Retrieved relevant chunks
   * @param {Object} questionAnalysis - Question type analysis
   * @param {Array} conversationHistory - Previous conversation messages
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Generated answer with metadata
   */
  async generateAnswer(question, relevantChunks, questionAnalysis, conversationHistory = [], options = {}) {
    // Reduce retries to save API quota - use 0 for development, can be overridden
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : (process.env.NODE_ENV === 'production' ? 1 : 0);
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.isInitialized) {
          throw new Error("LangChainManager not initialized");
        }

        console.log(`🧠 Generating answer using ${this.provider} ${this.modelName} (attempt ${attempt}/${maxRetries})...`);

        // Prepare context from retrieved chunks
        const context = this.prepareContext(relevantChunks);

        // Create the prompt based on question type
        const prompt = this.createPrompt(question, context, questionAnalysis, conversationHistory);

        // Generate answer using LLM with timeout
        const response = await this.callLLMWithTimeout(prompt, options.timeout || 30000);

        const generatedAnswer = this.processLLMResponse(response);

        console.log(`✅ Answer generated successfully (${generatedAnswer.length} characters)`);

        return {
          answer: generatedAnswer,
          reasoningStrategy: 'llm_generation',
          model: `${this.provider}/${this.modelName}`,
          confidence: this.calculateLLMConfidence(generatedAnswer, relevantChunks),
          metadata: {
            provider: this.provider,
            model: this.modelName,
            contextChunks: relevantChunks.length,
            totalContextLength: context.length,
            attempt: attempt,
            retriesUsed: attempt - 1
          }
        };

      } catch (error) {
        console.error(`❌ LLM generation attempt ${attempt} failed:`, error.message);
        lastError = error;

        // Check if this is a retryable error
        if (this.isRetryableError(error) && attempt < maxRetries) {
          console.log(`🔄 Retrying LLM call in ${attempt * 1000}ms...`);
          await this.delay(attempt * 1000); // Exponential backoff
          continue;
        }

        // If this was the last attempt or non-retryable error, break
        break;
      }
    }

    // All attempts failed - provide fallback response
    console.error("❌ All LLM generation attempts failed, providing fallback");
    return this.generateFallbackAnswer(question, relevantChunks, questionAnalysis, lastError);
  }

  /**
   * Call LLM with timeout protection
   * @param {Object} prompt - Prompt object with system and user messages
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} LLM response
   */
  async callLLMWithTimeout(prompt, timeout) {
    if (this.provider === 'google' || this.provider === 'gemini') {
      // Use official Google SDK
      return Promise.race([
        this.callGeminiLLM(prompt),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini request timeout')), timeout)
        )
      ]);
    } else {
      // Use LangChain interface for other providers
      return Promise.race([
        this.llm.invoke([new SystemMessage(prompt.system), new HumanMessage(prompt.user)]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('LLM request timeout')), timeout)
        )
      ]);
    }
  }

  /**
   * Call Gemini LLM using official SDK
   * @param {Object} prompt - Prompt object
   * @returns {Promise<Object>} Gemini response
   */
  async callGeminiLLM(prompt) {
    const fullPrompt = `${prompt.system}\n\n${prompt.user}`;

    const chat = this.llm.startChat({
      history: [],
    });

    const result = await chat.sendMessage(fullPrompt);
    const responseText = result.response.text();

    // Wrap in LangChain-compatible format for consistency
    return {
      content: responseText,
      text: responseText
    };
  }

  /**
   * Process and validate LLM response
   * @param {Object} response - Raw LLM response
   * @returns {string} Processed answer
   */
  processLLMResponse(response) {
    if (!response || !response.content) {
      throw new Error('Empty response from LLM');
    }

    let answer = response.content.trim();

    // Basic validation
    if (answer.length < 10) {
      console.warn('⚠️ LLM response too short, may indicate issues');
    }

    // Clean up common LLM artifacts
    answer = this.cleanLLMResponse(answer);

    return answer;
  }

  /**
   * Clean up common LLM response artifacts
   * @param {string} response - Raw response
   * @returns {string} Cleaned response
   */
  cleanLLMResponse(response) {
    let cleaned = response;

    // Remove common prefixes that LLMs sometimes add
    const prefixesToRemove = [
      /^Assistant: /i,
      /^AI: /i,
      /^Answer: /i,
      /^Response: /i
    ];

    for (const prefix of prefixesToRemove) {
      cleaned = cleaned.replace(prefix, '');
    }

    // Remove excessive whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  }

  /**
   * Check if an error is retryable
   * @param {Error} error - Error object
   * @returns {boolean} Whether the error can be retried
   */
  isRetryableError(error) {
    const message = error.message.toLowerCase();

    // Network and rate limiting errors are retryable
    const retryablePatterns = [
      'timeout',
      'rate limit',
      '429',
      '502',
      '503',
      '504',
      'network',
      'connection',
      'timeout',
      'server error'
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
  }

  /**
   * Generate fallback answer when LLM fails
   * @param {string} question - Original question
   * @param {Array} chunks - Retrieved chunks
   * @param {Object} questionAnalysis - Question analysis
   * @param {Error} lastError - Last error encountered
   * @returns {Object} Fallback answer
   */
  generateFallbackAnswer(question, chunks, questionAnalysis, lastError) {
    console.log(`🔄 Generating fallback answer after LLM failure: ${lastError?.message}`);

    // Create a basic answer from the most relevant chunks
    let fallbackAnswer = "I encountered an issue generating a detailed answer. ";

    if (chunks && chunks.length > 0) {
      const topChunk = chunks[0];
      const preview = topChunk.content.substring(0, 300);

      fallbackAnswer += `Based on the available information:\n\n${preview}`;
      if (topChunk.content.length > 300) {
        fallbackAnswer += "...";
      }
    } else {
      fallbackAnswer += "However, I couldn't find sufficient information in the documents to answer your question.";
    }

    return {
      answer: fallbackAnswer,
      reasoningStrategy: 'llm_fallback',
      model: 'fallback',
      confidence: 0.3, // Low confidence for fallback
      metadata: {
        provider: this.provider,
        model: this.modelName,
        error: lastError?.message,
        fallback: true,
        contextChunks: chunks?.length || 0
      }
    };
  }

  /**
   * Utility function for delays
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Delay promise
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Prepare context text from retrieved chunks with intelligent selection
   * @param {Array} chunks - Retrieved chunks
   * @returns {string} Formatted context
   */
  prepareContext(chunks) {
    if (!chunks || chunks.length === 0) {
      return "No relevant context available.";
    }

    // Sort chunks by relevance score (prioritize finalScore, then similarity)
    const sortedChunks = chunks.sort((a, b) => {
      const scoreA = a.finalScore || a.similarity || 0;
      const scoreB = b.finalScore || b.similarity || 0;
      return scoreB - scoreA;
    });

    // Calculate dynamic context limits based on model
    const maxContextLength = this.getMaxContextLength();
    let context = "";
    let chunkCount = 0;
    const maxChunks = 8; // Limit to top 8 most relevant chunks

    // Add chunks while staying within limits
    for (const chunk of sortedChunks) {
      if (chunkCount >= maxChunks) break;

      const chunkText = this.formatChunkForContext(chunk, chunkCount + 1);
      if (context.length + chunkText.length > maxContextLength) {
        break;
      }

      context += chunkText;
      chunkCount++;
    }

    // If we have very little context, add more chunks with lower priority
    if (context.length < 1000 && sortedChunks.length > chunkCount) {
      for (let i = chunkCount; i < Math.min(sortedChunks.length, chunkCount + 3); i++) {
        const chunk = sortedChunks[i];
        const chunkText = this.formatChunkForContext(chunk, i + 1);
        if (context.length + chunkText.length <= maxContextLength * 1.2) { // Allow slight overflow for completeness
          context += chunkText;
        }
      }
    }

    return context.trim() || "Limited context available from documents.";
  }

  /**
   * Get maximum context length based on model
   * @returns {number} Maximum context length in characters
   */
  getMaxContextLength() {
    // Reserve space for system prompt, question, and response
    const reservedSpace = 2000; // For prompts and response buffer

    switch (this.provider.toLowerCase()) {
      case 'openai':
        if (this.modelName.includes('gpt-4')) {
          return 6000; // Conservative limit for GPT-4
        }
        return 3000; // Conservative limit for GPT-3.5
      case 'anthropic':
        return 4000; // Conservative limit for Claude
      case 'google':
      case 'gemini':
        if (this.modelName.includes('gemini-1.5-pro')) {
          return 8000; // Higher limit for Gemini 1.5 Pro
        }
        return 5000; // Conservative limit for Gemini 1.5 Flash and others
      default:
        return 2000; // Safe default
    }
  }

  /**
   * Format a chunk for inclusion in context
   * @param {Object} chunk - Chunk object
   * @param {number} index - Chunk index for labeling
   * @returns {string} Formatted chunk text
   */
  formatChunkForContext(chunk, index) {
    const sourceInfo = chunk.metadata?.documentName ?
      ` (from: ${chunk.metadata.documentName})` : '';

    const relevanceScore = chunk.finalScore || chunk.similarity || 0;
    const scoreIndicator = relevanceScore > 0.8 ? '⭐' : relevanceScore > 0.6 ? '●' : '○';

    return `[${scoreIndicator} Source ${index}${sourceInfo}]\n${chunk.content}\n\n`;
  }

  /**
   * Create sophisticated prompt based on question type and context
   * @param {string} question - User's question
   * @param {string} context - Prepared context
   * @param {Object} questionAnalysis - Question analysis
   * @param {Array} conversationHistory - Conversation history
   * @returns {Object} System and user prompts
   */
  createPrompt(question, context, questionAnalysis, conversationHistory) {
    const systemPrompt = this.buildSystemPrompt(questionAnalysis);
    const userPrompt = this.buildUserPrompt(question, context, questionAnalysis, conversationHistory);

    return {
      system: systemPrompt,
      user: userPrompt
    };
  }

  /**
   * Build comprehensive system prompt
   * @param {Object} questionAnalysis - Question analysis
   * @returns {string} System prompt
   */
  buildSystemPrompt(questionAnalysis) {
    const baseInstructions = `You are an expert AI assistant specializing in answering questions based on provided document context.

CORE PRINCIPLES:
- Always answer based ONLY on the provided context
- Be truthful and accurate - if information is not in the context, say so
- Cite sources when possible using the format [Source X]
- Provide comprehensive but concise answers
- Use clear, professional language

RESPONSE GUIDELINES:
- Structure answers logically with appropriate formatting
- Use bullet points, numbered lists, or sections when helpful
- Explain technical terms when they appear in context
- Maintain context from previous conversation when relevant`;

    const typeSpecificInstructions = this.getTypeSpecificInstructions(questionAnalysis);

    const contextInstructions = `
CONTEXT USAGE:
- Sources are ranked by relevance (⭐ = highest, ● = medium, ○ = lower)
- Consider all provided sources for comprehensive answers
- If sources conflict, note the differences
- Use source names to distinguish between documents`;

    return baseInstructions + typeSpecificInstructions + contextInstructions;
  }

  /**
   * Get question type specific instructions
   * @param {Object} questionAnalysis - Question analysis
   * @returns {string} Type-specific instructions
   */
  getTypeSpecificInstructions(questionAnalysis) {
    const instructions = {
      definition: `
For definition/explanation questions:
- Provide clear, comprehensive definitions
- Include key characteristics and components
- Explain relationships between concepts
- Give practical examples when available in context`,

      how_to: `
For procedural questions:
- Provide step-by-step instructions
- Include prerequisites and requirements
- Note important warnings or considerations
- Explain the rationale behind steps when available`,

      comparison: `
For comparison questions:
- Analyze similarities and differences objectively
- Use clear criteria for comparison
- Provide balanced analysis with evidence
- Highlight trade-offs and implications`,

      list_categories: `
For categorization questions:
- Organize information into logical groups
- Use clear category names and descriptions
- Provide examples for each category when available
- Explain the categorization criteria`,

      why_explain: `
For explanatory questions:
- Provide clear reasoning and causal relationships
- Explain underlying principles and mechanisms
- Connect different pieces of information
- Address root causes and implications`,

      analysis: `
For analysis questions:
- Break down complex topics systematically
- Identify key patterns and relationships
- Provide evidence-based insights
- Consider multiple perspectives from sources`,

      general: `
For general questions:
- Provide comprehensive, well-structured answers
- Organize information logically
- Highlight key takeaways
- Connect related concepts`
    };

    return instructions[questionAnalysis.type] || instructions.general;
  }

  /**
   * Build comprehensive user prompt
   * @param {string} question - User's question
   * @param {string} context - Prepared context
   * @param {Object} questionAnalysis - Question analysis
   * @param {Array} conversationHistory - Conversation history
   * @returns {string} User prompt
   */
  buildUserPrompt(question, context, questionAnalysis, conversationHistory) {
    let prompt = `QUESTION: ${question}\n\n`;

    // Add conversation context for follow-up questions
    if (conversationHistory && conversationHistory.length > 0) {
      const recentContext = this.extractRelevantConversationContext(question, conversationHistory);
      if (recentContext) {
        prompt += `CONVERSATION CONTEXT:\n${recentContext}\n\n`;
      }
    }

    // Add context with clear instructions
    prompt += `DOCUMENT CONTEXT:\n${context}\n\n`;

    // Add specific instructions based on question complexity
    if (questionAnalysis.complexity === 'detailed') {
      prompt += `INSTRUCTIONS: Provide a detailed, comprehensive answer using all relevant information from the context. Include examples and explanations where appropriate.\n\n`;
    } else {
      prompt += `INSTRUCTIONS: Provide a clear, focused answer based on the most relevant information in the context.\n\n`;
    }

    prompt += `Please answer the question above using only the provided document context.`;

    return prompt;
  }

  /**
   * Extract relevant conversation context for the current question
   * @param {string} question - Current question
   * @param {Array} conversationHistory - Full conversation history
   * @returns {string|null} Relevant context or null
   */
  extractRelevantConversationContext(question, conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) return null;

    // Get recent exchanges (last 6 messages)
    const recentHistory = conversationHistory.slice(-6);

    // Extract keywords from current question
    const questionWords = question.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word))
      .slice(0, 5);

    // Find related previous messages
    const relevantMessages = [];
    for (const msg of recentHistory) {
      const content = msg.content.toLowerCase();
      const hasOverlap = questionWords.some(word => content.includes(word));

      if (hasOverlap || this.isFollowUpQuestion(question, msg.content)) {
        relevantMessages.push(`${msg.type === 'question' ? 'Previous Question' : 'Previous Answer'}: ${msg.content}`);
      }
    }

    if (relevantMessages.length === 0) return null;

    return relevantMessages.join('\n');
  }

  /**
   * Check if current question is a follow-up to previous content
   * @param {string} currentQuestion - Current question
   * @param {string} previousContent - Previous message content
   * @returns {boolean} Whether it's a follow-up
   */
  isFollowUpQuestion(currentQuestion, previousContent) {
    const followUpIndicators = ['that', 'this', 'it', 'those', 'these', 'them', 'they'];
    const currentLower = currentQuestion.toLowerCase();

    return followUpIndicators.some(word => currentLower.includes(` ${word} `));
  }

  /**
   * Check if word is a stop word
   * @param {string} word - Word to check
   * @returns {boolean} Whether word is a stop word
   */
  isStopWord(word) {
    const stopWords = ['what', 'when', 'where', 'which', 'that', 'this', 'these', 'those', 'with', 'from'];
    return stopWords.includes(word.toLowerCase());
  }


  /**
   * Calculate confidence score for LLM-generated answer
   * @param {string} answer - Generated answer
   * @param {Array} chunks - Source chunks
   * @returns {number} Confidence score (0-1)
   */
  calculateLLMConfidence(answer, chunks) {
    if (!chunks || chunks.length === 0) return 0.3; // Low confidence without sources

    // Base confidence from source quality and quantity
    let confidence = 0.6; // Base LLM confidence

    // Boost confidence based on number of sources
    if (chunks.length >= 3) confidence += 0.1;
    else if (chunks.length >= 5) confidence += 0.2;

    // Boost confidence based on average relevance score
    const avgRelevance = chunks.reduce((sum, chunk) =>
      sum + (chunk.finalScore || chunk.similarity || 0.5), 0) / chunks.length;

    if (avgRelevance > 0.8) confidence += 0.1;
    else if (avgRelevance > 0.6) confidence += 0.05;

    // Check answer length as indicator of completeness
    if (answer.length > 100) confidence += 0.05;
    if (answer.length > 300) confidence += 0.05;

    return Math.min(confidence, 0.95); // Cap at 95% since LLM can still make mistakes
  }

  /**
   * Health check for LLM service
   * @returns {Promise<boolean>} Health status
   */
  async healthCheck() {
    try {
      if (!this.isInitialized) return false;

      await this.testConnection();
      return true;
    } catch (error) {
      console.error("LLM health check failed:", error);
      return false;
    }
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      initialized: this.isInitialized,
      provider: this.provider,
      model: this.modelName,
      temperature: this.temperature,
      maxTokens: this.maxTokens
    };
  }
}

export default LangChainManager;
    