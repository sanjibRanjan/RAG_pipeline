/**
 * Firebase Authentication Middleware
 *
 * Provides authentication and authorization middleware for API endpoints
 *
 * @author RAG Pipeline Team
 * @version 1.0.0
 */

import FirebaseService from '../services/firebase-service.js';
import logger from '../utils/logger.js';

let firebaseService = null;

/**
 * Initialize Firebase service for middleware
 * @param {FirebaseService} service - Firebase service instance
 */
export function initializeAuthMiddleware(service) {
  firebaseService = service;
}

/**
 * Authentication middleware - verifies Firebase ID token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function authenticateToken(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      logger.warn("❌ Authentication failed: No token provided", {
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return res.status(401).json({
        success: false,
        message: "Access token required",
        error: "NO_TOKEN"
      });
    }

    if (!firebaseService || !firebaseService.isInitialized) {
      logger.error("❌ Authentication failed: Firebase service not initialized");
      return res.status(500).json({
        success: false,
        message: "Authentication service unavailable",
        error: "SERVICE_UNAVAILABLE"
      });
    }

    // Verify the token
    const decodedToken = await firebaseService.verifyIdToken(token);

    // Attach user information to request
    req.user = decodedToken;
    req.tenant = decodedToken.tenant;

    // Log successful authentication
    logger.info("✅ Authentication successful", {
      requestId: req.requestId,
      userId: decodedToken.uid,
      tenantId: decodedToken.tenant.id,
      email: decodedToken.email
    });

    next();
  } catch (error) {
    logger.error("❌ Authentication failed:", {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      ip: req.ip
    });

    // Handle specific Firebase errors
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        message: "Token has expired",
        error: "TOKEN_EXPIRED"
      });
    }

    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        success: false,
        message: "Token has been revoked",
        error: "TOKEN_REVOKED"
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid authentication token",
      error: "INVALID_TOKEN"
    });
  }
}

/**
 * Optional authentication middleware - allows both authenticated and anonymous access
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function optionalAuthentication(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      // No token provided - allow anonymous access
      req.user = null;
      req.tenant = { id: 'anonymous', type: 'anonymous' };
      return next();
    }

    if (!firebaseService || !firebaseService.isInitialized) {
      // Firebase not available - allow anonymous access
      req.user = null;
      req.tenant = { id: 'anonymous', type: 'anonymous' };
      return next();
    }

    // Try to verify token
    try {
      const decodedToken = await firebaseService.verifyIdToken(token);
      req.user = decodedToken;
      req.tenant = decodedToken.tenant;
    } catch (tokenError) {
      // Token verification failed - allow anonymous access
      req.user = null;
      req.tenant = { id: 'anonymous', type: 'anonymous' };
    }

    next();
  } catch (error) {
    // On error, allow anonymous access
    req.user = null;
    req.tenant = { id: 'anonymous', type: 'anonymous' };
    next();
  }
}

/**
 * Admin-only middleware - requires admin role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      error: "NO_AUTH"
    });
  }

  // Check for admin role (you can customize this based on your Firebase custom claims)
  const isAdmin = req.user.admin === true ||
                  req.user.role === 'admin' ||
                  req.user.customClaims?.admin === true;

  if (!isAdmin) {
    logger.warn("❌ Admin access denied", {
      requestId: req.requestId,
      userId: req.user.uid,
      email: req.user.email
    });

    return res.status(403).json({
      success: false,
      message: "Admin access required",
      error: "INSUFFICIENT_PERMISSIONS"
    });
  }

  next();
}

/**
 * Tenant ownership middleware - ensures user can only access their own tenant data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function requireTenantAccess(req, res, next) {
  if (!req.user || !req.tenant) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      error: "NO_AUTH"
    });
  }

  // For user-level isolation, user can only access their own data
  if (firebaseService && firebaseService.getTenantIsolationLevel() === 'user') {
    const requestedTenantId = req.params.tenantId || req.query.tenantId || req.body.tenantId;

    if (requestedTenantId && requestedTenantId !== req.tenant.id) {
      logger.warn("❌ Tenant access denied", {
        requestId: req.requestId,
        userId: req.user.uid,
        userTenantId: req.tenant.id,
        requestedTenantId
      });

      return res.status(403).json({
        success: false,
        message: "Access denied: Cannot access other tenant data",
        error: "TENANT_ACCESS_DENIED"
      });
    }
  }

  next();
}

/**
 * Rate limiting middleware based on tenant
 * @param {Object} options - Rate limiting options
 * @returns {Function} Middleware function
 */
export function tenantRateLimit(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
  const maxRequests = options.maxRequests || 100; // requests per window

  const requests = new Map();

  return (req, res, next) => {
    const tenantId = req.tenant?.id || 'anonymous';
    const key = `${tenantId}_${Math.floor(Date.now() / windowMs)}`;

    const currentRequests = requests.get(key) || 0;

    if (currentRequests >= maxRequests) {
      logger.warn("❌ Rate limit exceeded", {
        requestId: req.requestId,
        tenantId,
        currentRequests,
        maxRequests
      });

      return res.status(429).json({
        success: false,
        message: "Rate limit exceeded",
        error: "RATE_LIMIT_EXCEEDED",
        retryAfter: windowMs / 1000
      });
    }

    requests.set(key, currentRequests + 1);

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance to clean up
      const now = Math.floor(Date.now() / windowMs);
      for (const [k] of requests) {
        if (parseInt(k.split('_')[1]) < now - 1) {
          requests.delete(k);
        }
      }
    }

    next();
  };
}

/**
 * CORS middleware with tenant-aware origin validation
 * @param {Array} allowedOrigins - Array of allowed origins
 * @returns {Function} Middleware function
 */
export function tenantAwareCORS(allowedOrigins = []) {
  return (req, res, next) => {
    const origin = req.headers.origin;

    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return next();

    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }

    // Allow credentials
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  };
}

/**
 * Logging middleware with tenant information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function tenantLogging(req, res, next) {
  const startTime = Date.now();

  // Add tenant information to request for logging
  req.requestId = req.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    logger.info("📊 Request completed", {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.uid,
      tenantId: req.tenant?.id,
      tenantType: req.tenant?.type,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  });

  next();
}

export default {
  initializeAuthMiddleware,
  authenticateToken,
  optionalAuthentication,
  requireAdmin,
  requireTenantAccess,
  tenantRateLimit,
  tenantAwareCORS,
  tenantLogging
};
