export class ConversationManager {
  constructor(options = {}) {
    this.conversations = new Map(); // sessionId -> messages[]
    this.maxMessagesPerConversation = options.maxMessagesPerConversation || 20;
    this.maxConversations = options.maxConversations || 1000;
    this.cleanupInterval = options.cleanupInterval || 30 * 60 * 1000; // 30 minutes

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Start a new conversation or get existing one
   * @param {string} sessionId - Unique session identifier
   * @returns {string} The session ID
   */
  startConversation(sessionId) {
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, []);
      console.log(`📝 Started new conversation: ${sessionId}`);
    }
    return sessionId;
  }

  /**
   * Add a message to a conversation
   * @param {string} sessionId - Session identifier
   * @param {Object} message - Message object with type and content
   * @returns {Array} Updated conversation messages
   */
  addMessage(sessionId, message) {
    if (!sessionId) {
      throw new Error("Session ID is required");
    }

    // Ensure conversation exists
    if (!this.conversations.has(sessionId)) {
      this.startConversation(sessionId);
    }

    const conversation = this.conversations.get(sessionId);

    // Validate message structure
    if (!message || typeof message !== 'object') {
      throw new Error("Message must be an object");
    }

    if (!message.type || !message.content) {
      throw new Error("Message must have 'type' and 'content' properties");
    }

    // Add timestamp if not provided
    const messageWithTimestamp = {
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
      id: message.id || this.generateMessageId(),
    };

    conversation.push(messageWithTimestamp);

    // Maintain maximum message limit
    if (conversation.length > this.maxMessagesPerConversation) {
      const removedCount = conversation.length - this.maxMessagesPerConversation;
      conversation.splice(0, removedCount);
      console.log(`🧹 Cleaned up ${removedCount} old messages from session: ${sessionId}`);
    }

    console.log(`💬 Added ${message.type} message to session: ${sessionId}`);
    return conversation;
  }

  /**
   * Get conversation history
   * @param {string} sessionId - Session identifier
   * @param {number} limit - Maximum number of messages to return
   * @returns {Array} Conversation messages
   */
  getConversation(sessionId, limit = null) {
    if (!sessionId) {
      throw new Error("Session ID is required");
    }

    const conversation = this.conversations.get(sessionId) || [];

    if (limit && limit > 0) {
      return conversation.slice(-limit);
    }

    return [...conversation]; // Return copy to prevent external modification
  }

  /**
   * Get recent messages from conversation
   * @param {string} sessionId - Session identifier
   * @param {number} count - Number of recent messages to get
   * @returns {Array} Recent conversation messages
   */
  getRecentMessages(sessionId, count = 5) {
    const conversation = this.getConversation(sessionId);
    return conversation.slice(-count);
  }

  /**
   * Clear a specific conversation
   * @param {string} sessionId - Session identifier
   * @returns {boolean} Success status
   */
  clearConversation(sessionId) {
    if (!sessionId) {
      throw new Error("Session ID is required");
    }

    const existed = this.conversations.has(sessionId);
    this.conversations.delete(sessionId);

    if (existed) {
      console.log(`🗑️ Cleared conversation: ${sessionId}`);
    }

    return existed;
  }

  /**
   * Clear all conversations (useful for maintenance)
   * @returns {number} Number of conversations cleared
   */
  clearAllConversations() {
    const count = this.conversations.size;
    this.conversations.clear();
    console.log(`🧹 Cleared all ${count} conversations`);
    return count;
  }

  /**
   * Get conversation statistics
   * @returns {Object} Statistics about conversations
   */
  getStats() {
    const conversations = Array.from(this.conversations.entries());
    const totalMessages = conversations.reduce((sum, [_, messages]) => sum + messages.length, 0);

    return {
      totalConversations: conversations.length,
      totalMessages,
      averageMessagesPerConversation: conversations.length > 0 ?
        (totalMessages / conversations.length).toFixed(2) : 0,
      oldestConversation: conversations.length > 0 ?
        conversations.reduce((oldest, [_, messages]) =>
          messages.length > 0 && (!oldest || messages[0].timestamp < oldest) ?
            messages[0].timestamp : oldest, null) : null,
      newestConversation: conversations.length > 0 ?
        conversations.reduce((newest, [_, messages]) =>
          messages.length > 0 && (!newest || messages[messages.length - 1].timestamp > newest) ?
            messages[messages.length - 1].timestamp : newest, null) : null,
    };
  }

  /**
   * Get all conversation IDs
   * @returns {Array} Array of session IDs
   */
  getAllConversationIds() {
    return Array.from(this.conversations.keys());
  }

  /**
   * Check if conversation exists
   * @param {string} sessionId - Session identifier
   * @returns {boolean} Whether conversation exists
   */
  conversationExists(sessionId) {
    return this.conversations.has(sessionId);
  }

  /**
   * Generate a unique message ID
   * @returns {string} Unique message identifier
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start automatic cleanup interval
   */
  startCleanupInterval() {
    setInterval(() => {
      this.performCleanup();
    }, this.cleanupInterval);
  }

  /**
   * Perform cleanup of old conversations
   */
  performCleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let cleaned = 0;

    for (const [sessionId, messages] of this.conversations.entries()) {
      if (messages.length > 0) {
        const lastMessageTime = new Date(messages[messages.length - 1].timestamp).getTime();
        if (now - lastMessageTime > maxAge) {
          this.conversations.delete(sessionId);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old conversations`);
    }
  }

  /**
   * Export conversation data (useful for debugging)
   * @param {string} sessionId - Session identifier (optional)
   * @returns {Object} Exported conversation data
   */
  exportConversations(sessionId = null) {
    if (sessionId) {
      return {
        [sessionId]: this.conversations.get(sessionId) || []
      };
    }

    const exportData = {};
    for (const [id, messages] of this.conversations.entries()) {
      exportData[id] = messages;
    }
    return exportData;
  }

  /**
   * Import conversation data
   * @param {Object} data - Conversation data to import
   * @returns {number} Number of conversations imported
   */
  importConversations(data) {
    let imported = 0;
    for (const [sessionId, messages] of Object.entries(data)) {
      if (Array.isArray(messages)) {
        this.conversations.set(sessionId, messages);
        imported++;
      }
    }
    console.log(`📥 Imported ${imported} conversations`);
    return imported;
  }
}

export default ConversationManager;
