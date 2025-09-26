/**
 * User Management Service
 *
 * Handles user-specific operations, tenant management, and user statistics
 *
 * @author RAG Pipeline Team
 * @version 1.0.0
 */

export class UserService {
  constructor(vectorStore, documentStore, conversationManager, qaService) {
    this.vectorStore = vectorStore;
    this.documentStore = documentStore;
    this.conversationManager = conversationManager;
    this.qaService = qaService;
  }

  /**
   * Get user profile information
   * @param {Object} user - Authenticated user object
   * @returns {Promise<Object>} User profile
   */
  async getUserProfile(user) {
    try {
      return {
        uid: user.uid,
        email: user.email,
        displayName: user.name || user.displayName,
        tenant: user.tenant,
        createdAt: user.iat ? new Date(user.iat * 1000).toISOString() : null,
        lastLogin: user.auth_time ? new Date(user.auth_time * 1000).toISOString() : null
      };
    } catch (error) {
      console.error("❌ Failed to get user profile:", error);
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  /**
   * Get user statistics
   * @param {Object} tenant - Tenant information
   * @returns {Promise<Object>} User statistics
   */
  async getUserStats(tenant) {
    try {
      const stats = {
        tenant: tenant,
        documents: await this.getUserDocumentStats(tenant),
        conversations: await this.getUserConversationStats(tenant),
        usage: await this.getUserUsageStats(tenant),
        generatedAt: new Date().toISOString()
      };

      return stats;
    } catch (error) {
      console.error("❌ Failed to get user stats:", error);
      throw new Error(`Failed to get user stats: ${error.message}`);
    }
  }

  /**
   * Get user's document statistics
   * @param {Object} tenant - Tenant information
   * @returns {Promise<Object>} Document statistics
   */
  async getUserDocumentStats(tenant) {
    try {
      // Get documents for this tenant
      const documents = await this.vectorStore.listDocumentsByTenant(tenant.id);

      const stats = {
        total: documents.length,
        totalSize: documents.reduce((sum, doc) => sum + (doc.fileSize || 0), 0),
        totalChunks: documents.reduce((sum, doc) => sum + (doc.chunks || 0), 0),
        totalEmbeddings: documents.reduce((sum, doc) => sum + (doc.totalEmbeddings || 0), 0),
        fileTypes: {},
        recentUploads: []
      };

      // Calculate file type distribution
      documents.forEach(doc => {
        stats.fileTypes[doc.fileType] = (stats.fileTypes[doc.fileType] || 0) + 1;
      });

      // Get recent uploads (last 5)
      stats.recentUploads = documents
        .filter(doc => doc.uploadedAt)
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
        .slice(0, 5)
        .map(doc => ({
          name: doc.name,
          uploadedAt: doc.uploadedAt,
          fileSize: doc.fileSize,
          fileType: doc.fileType
        }));

      return stats;
    } catch (error) {
      console.error("❌ Failed to get user document stats:", error);
      return {
        total: 0,
        totalSize: 0,
        totalChunks: 0,
        totalEmbeddings: 0,
        fileTypes: {},
        recentUploads: []
      };
    }
  }

  /**
   * Get user's conversation statistics
   * @param {Object} tenant - Tenant information
   * @returns {Promise<Object>} Conversation statistics
   */
  async getUserConversationStats(tenant) {
    try {
      if (!this.conversationManager) {
        return { total: 0, active: 0, totalMessages: 0 };
      }

      // Get conversations for this tenant (you'll need to modify ConversationManager to support tenant filtering)
      const conversations = await this.conversationManager.getConversationsByTenant(tenant.id);

      const stats = {
        total: conversations.length,
        active: conversations.filter(c => c.active).length,
        totalMessages: conversations.reduce((sum, c) => sum + (c.messageCount || 0), 0),
        recentConversations: conversations
          .sort((a, b) => new Date(b.lastActivity || b.createdAt) - new Date(a.lastActivity || a.createdAt))
          .slice(0, 3)
          .map(c => ({
            id: c.id,
            messageCount: c.messageCount,
            lastActivity: c.lastActivity || c.createdAt
          }))
      };

      return stats;
    } catch (error) {
      console.error("❌ Failed to get user conversation stats:", error);
      return { total: 0, active: 0, totalMessages: 0, recentConversations: [] };
    }
  }

  /**
   * Get user's usage statistics
   * @param {Object} tenant - Tenant information
   * @returns {Promise<Object>} Usage statistics
   */
  async getUserUsageStats(tenant) {
    try {
      // This would typically come from a usage tracking system
      // For now, return basic stats
      const stats = {
        questionsAsked: 0, // Would need to track this
        answersGenerated: 0, // Would need to track this
        documentsProcessed: 0, // Would need to track this
        totalTokensUsed: 0, // Would need to track this
        averageResponseTime: 0 // Would need to track this
      };

      // Try to get some basic stats from QA service cache or history
      if (this.qaService && this.qaService.answerCache) {
        // This is a simplified implementation
        // In a real system, you'd have proper usage tracking
        stats.questionsAsked = this.qaService.answerCache.size;
      }

      return stats;
    } catch (error) {
      console.error("❌ Failed to get user usage stats:", error);
      return {
        questionsAsked: 0,
        answersGenerated: 0,
        documentsProcessed: 0,
        totalTokensUsed: 0,
        averageResponseTime: 0
      };
    }
  }

  /**
   * List user's documents
   * @param {Object} tenant - Tenant information
   * @param {Object} options - Query options
   * @returns {Promise<Array>} User's documents
   */
  async listUserDocuments(tenant, options = {}) {
    try {
      const { limit = 10, offset = 0, search, fileType, sortBy = 'uploadedAt', sortOrder = 'desc' } = options;

      let documents = await this.vectorStore.listDocumentsByTenant(tenant.id, { limit: 1000 }); // Get more to filter

      // Apply search filter
      if (search) {
        documents = documents.filter(doc =>
          doc.name.toLowerCase().includes(search.toLowerCase()) ||
          (doc.description && doc.description.toLowerCase().includes(search.toLowerCase()))
        );
      }

      // Apply file type filter
      if (fileType) {
        documents = documents.filter(doc => doc.fileType === fileType);
      }

      // Apply sorting
      documents.sort((a, b) => {
        let aVal, bVal;

        switch (sortBy) {
          case 'name':
            aVal = a.name.toLowerCase();
            bVal = b.name.toLowerCase();
            break;
          case 'fileSize':
            aVal = a.fileSize || 0;
            bVal = b.fileSize || 0;
            break;
          case 'uploadedAt':
          default:
            aVal = new Date(a.uploadedAt || 0);
            bVal = new Date(b.uploadedAt || 0);
            break;
        }

        if (sortOrder === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });

      // Apply pagination
      const paginatedDocuments = documents.slice(offset, offset + limit);

      return {
        documents: paginatedDocuments,
        total: documents.length,
        limit,
        offset,
        hasMore: offset + limit < documents.length
      };
    } catch (error) {
      console.error("❌ Failed to list user documents:", error);
      throw new Error(`Failed to list user documents: ${error.message}`);
    }
  }

  /**
   * Delete user's document
   * @param {Object} tenant - Tenant information
   * @param {string} documentId - Document ID to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteUserDocument(tenant, documentId) {
    try {
      // Verify document belongs to tenant
      const document = await this.vectorStore.getDocumentByTenant(tenant.id, documentId);

      if (!document) {
        throw new Error("Document not found or access denied");
      }

      // Delete from vector store
      await this.vectorStore.deleteDocumentByTenant(tenant.id, documentId);

      // Delete from document store if it exists
      if (this.documentStore) {
        await this.documentStore.deleteDocumentByTenant(tenant.id, documentId);
      }

      console.log(`🗑️ Deleted document ${documentId} for tenant ${tenant.id}`);
      return true;
    } catch (error) {
      console.error("❌ Failed to delete user document:", error);
      throw new Error(`Failed to delete user document: ${error.message}`);
    }
  }

  /**
   * Clear all user data (for GDPR compliance or account deletion)
   * @param {Object} tenant - Tenant information
   * @returns {Promise<Object>} Deletion summary
   */
  async clearUserData(tenant) {
    try {
      console.log(`🗑️ Clearing all data for tenant: ${tenant.id}`);

      const summary = {
        documentsDeleted: 0,
        conversationsCleared: 0,
        vectorStoreCleared: false,
        documentStoreCleared: false,
        conversationsCleared: false
      };

      // Clear documents from vector store
      try {
        const deletedDocs = await this.vectorStore.clearDocumentsByTenant(tenant.id);
        summary.documentsDeleted = deletedDocs;
        summary.vectorStoreCleared = true;
      } catch (error) {
        console.warn("⚠️ Failed to clear vector store data:", error.message);
      }

      // Clear document store data
      if (this.documentStore) {
        try {
          await this.documentStore.clearDocumentsByTenant(tenant.id);
          summary.documentStoreCleared = true;
        } catch (error) {
          console.warn("⚠️ Failed to clear document store data:", error.message);
        }
      }

      // Clear conversations
      if (this.conversationManager) {
        try {
          await this.conversationManager.clearConversationsByTenant(tenant.id);
          summary.conversationsCleared = true;
        } catch (error) {
          console.warn("⚠️ Failed to clear conversations:", error.message);
        }
      }

      console.log(`✅ Cleared user data for tenant ${tenant.id}:`, summary);
      return summary;
    } catch (error) {
      console.error("❌ Failed to clear user data:", error);
      throw new Error(`Failed to clear user data: ${error.message}`);
    }
  }

  /**
   * Export user data (for GDPR compliance or data portability)
   * @param {Object} tenant - Tenant information
   * @returns {Promise<Object>} User data export
   */
  async exportUserData(tenant) {
    try {
      console.log(`📤 Exporting data for tenant: ${tenant.id}`);

      const exportData = {
        tenant: tenant,
        profile: await this.getUserProfile({ uid: tenant.userId, email: tenant.email, name: tenant.name }),
        documents: await this.listUserDocuments(tenant, { limit: 10000 }), // Get all documents
        conversations: await this.getUserConversationStats(tenant),
        usage: await this.getUserUsageStats(tenant),
        exportedAt: new Date().toISOString()
      };

      console.log(`✅ Exported user data for tenant ${tenant.id}`);
      return exportData;
    } catch (error) {
      console.error("❌ Failed to export user data:", error);
      throw new Error(`Failed to export user data: ${error.message}`);
    }
  }
}

export default UserService;
