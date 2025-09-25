/**
 * Firebase Service
 *
 * Handles Firebase Authentication, user management, and multi-tenancy features
 *
 * @author RAG Pipeline Team
 * @version 1.0.0
 */

import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FirebaseService {
  constructor() {
    this.adminApp = null;
    this.clientApp = null;
    this.isInitialized = false;
    this.enableMultiTenancy = process.env.ENABLE_MULTI_TENANCY === 'true';
    this.tenantIsolationLevel = process.env.TENANT_ISOLATION_LEVEL || 'user'; // 'user' or 'organization'
  }

  /**
   * Initialize Firebase Admin SDK and Client SDK
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      console.log("🔥 Initializing Firebase services...");

      // Initialize Firebase Admin SDK
      await this.initializeAdminSDK();

      // Initialize Firebase Client SDK (for client-side operations if needed)
      await this.initializeClientSDK();

      this.isInitialized = true;
      console.log("✅ Firebase services initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ Firebase initialization failed:", error);
      throw new Error(`Firebase initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize Firebase Admin SDK
   * @private
   */
  async initializeAdminSDK() {
    try {
      // Check if Firebase is already initialized
      if (admin.apps.length > 0) {
        this.adminApp = admin.apps[0];
        return;
      }

      let config = {};

      // Method 1: Use service account key file
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
      if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
        config = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      }
      // Method 2: Use environment variables
      else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
        config = {
          type: "service_account",
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
          token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
          client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
        };
      } else {
        throw new Error("Firebase configuration not found. Please set FIREBASE_SERVICE_ACCOUNT_KEY_PATH or Firebase environment variables.");
      }

      // Initialize Firebase Admin
      this.adminApp = admin.initializeApp({
        credential: admin.credential.cert(config),
        projectId: config.project_id
      });

      console.log("✅ Firebase Admin SDK initialized");
    } catch (error) {
      console.error("❌ Firebase Admin SDK initialization failed:", error);
      throw error;
    }
  }

  /**
   * Initialize Firebase Client SDK (for client-side operations)
   * @private
   */
  async initializeClientSDK() {
    try {
      // Client SDK configuration
      const clientConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID
      };

      // Only initialize if we have the required config
      if (clientConfig.apiKey && clientConfig.authDomain && clientConfig.projectId) {
        this.clientApp = initializeApp(clientConfig);
        console.log("✅ Firebase Client SDK initialized");
      } else {
        console.log("⚠️ Firebase Client SDK not initialized - missing configuration");
      }
    } catch (error) {
      console.warn("⚠️ Firebase Client SDK initialization failed:", error.message);
    }
  }

  /**
   * Verify Firebase ID token
   * @param {string} idToken - Firebase ID token from client
   * @returns {Promise<Object>} Decoded token data
   */
  async verifyIdToken(idToken) {
    try {
      if (!this.adminApp) {
        throw new Error("Firebase Admin SDK not initialized");
      }

      const decodedToken = await this.adminApp.auth().verifyIdToken(idToken);

      // Add tenant information based on isolation level
      const tenantInfo = await this.getTenantInfo(decodedToken);

      return {
        ...decodedToken,
        tenant: tenantInfo
      };
    } catch (error) {
      console.error("❌ Token verification failed:", error.message);
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  /**
   * Get tenant information based on isolation level
   * @param {Object} decodedToken - Decoded Firebase token
   * @returns {Object} Tenant information
   */
  async getTenantInfo(decodedToken) {
    if (!this.enableMultiTenancy) {
      return { id: 'global', type: 'global' };
    }

    switch (this.tenantIsolationLevel) {
      case 'user':
        return {
          id: decodedToken.uid,
          type: 'user',
          userId: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email
        };

      case 'organization':
        // For organization-level isolation, you would need custom claims or database lookup
        // This is a placeholder implementation
        const orgId = decodedToken.organizationId || decodedToken.uid;
        return {
          id: orgId,
          type: 'organization',
          organizationId: orgId,
          userId: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email
        };

      default:
        return {
          id: decodedToken.uid,
          type: 'user',
          userId: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email
        };
    }
  }

  /**
   * Get user information by UID
   * @param {string} uid - Firebase user ID
   * @returns {Promise<Object>} User record
   */
  async getUser(uid) {
    try {
      if (!this.adminApp) {
        throw new Error("Firebase Admin SDK not initialized");
      }

      const userRecord = await this.adminApp.auth().getUser(uid);
      const tenantInfo = await this.getTenantInfo(userRecord.toJSON());

      return {
        ...userRecord.toJSON(),
        tenant: tenantInfo
      };
    } catch (error) {
      console.error("❌ Failed to get user:", error.message);
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Create a custom token for client authentication
   * @param {string} uid - User ID
   * @param {Object} additionalClaims - Additional claims
   * @returns {Promise<string>} Custom token
   */
  async createCustomToken(uid, additionalClaims = {}) {
    try {
      if (!this.adminApp) {
        throw new Error("Firebase Admin SDK not initialized");
      }

      return await this.adminApp.auth().createCustomToken(uid, additionalClaims);
    } catch (error) {
      console.error("❌ Failed to create custom token:", error.message);
      throw new Error(`Failed to create custom token: ${error.message}`);
    }
  }

  /**
   * Revoke all refresh tokens for a user
   * @param {string} uid - User ID
   * @returns {Promise<void>}
   */
  async revokeUserTokens(uid) {
    try {
      if (!this.adminApp) {
        throw new Error("Firebase Admin SDK not initialized");
      }

      await this.adminApp.auth().revokeRefreshTokens(uid);
      console.log(`🔑 Tokens revoked for user: ${uid}`);
    } catch (error) {
      console.error("❌ Failed to revoke user tokens:", error.message);
      throw new Error(`Failed to revoke user tokens: ${error.message}`);
    }
  }

  /**
   * Get Firebase Auth instance
   * @returns {admin.auth.Auth} Firebase Auth instance
   */
  getAuth() {
    if (!this.adminApp) {
      throw new Error("Firebase Admin SDK not initialized");
    }
    return this.adminApp.auth();
  }

  /**
   * Get Firestore instance
   * @returns {admin.firestore.Firestore} Firestore instance
   */
  getFirestore() {
    if (!this.adminApp) {
      throw new Error("Firebase Admin SDK not initialized");
    }
    return this.adminApp.firestore();
  }

  /**
   * Check if multi-tenancy is enabled
   * @returns {boolean} Multi-tenancy status
   */
  isMultiTenancyEnabled() {
    return this.enableMultiTenancy;
  }

  /**
   * Get tenant isolation level
   * @returns {string} Isolation level ('user' or 'organization')
   */
  getTenantIsolationLevel() {
    return this.tenantIsolationLevel;
  }

  /**
   * Generate tenant-specific collection/database name
   * @param {string} baseName - Base collection name
   * @param {Object} tenant - Tenant information
   * @returns {string} Tenant-specific name
   */
  getTenantCollectionName(baseName, tenant) {
    if (!this.enableMultiTenancy || tenant.type === 'global') {
      return baseName;
    }

    // For user-level isolation, prefix with user ID
    if (this.tenantIsolationLevel === 'user') {
      return `${baseName}_user_${tenant.id}`;
    }

    // For organization-level isolation, prefix with organization ID
    if (this.tenantIsolationLevel === 'organization') {
      return `${baseName}_org_${tenant.id}`;
    }

    return baseName;
  }

  /**
   * Get health status of Firebase services
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const status = {
        initialized: this.isInitialized,
        adminSDK: !!this.adminApp,
        clientSDK: !!this.clientApp,
        multiTenancy: {
          enabled: this.enableMultiTenancy,
          isolationLevel: this.tenantIsolationLevel
        }
      };

      // Test Firebase connectivity if initialized
      if (this.adminApp) {
        try {
          await this.adminApp.auth().listUsers(1);
          status.connectivity = 'healthy';
        } catch (error) {
          status.connectivity = 'unhealthy';
          status.error = error.message;
        }
      }

      return status;
    } catch (error) {
      return {
        initialized: false,
        error: error.message
      };
    }
  }
}

export default FirebaseService;
