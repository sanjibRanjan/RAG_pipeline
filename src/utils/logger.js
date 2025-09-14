import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for different levels
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;

    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ` | ${JSON.stringify(meta)}`;
    }

    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;

    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ` | ${JSON.stringify(meta, null, 2)}`;
    }

    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
try {
  const fs = await import('fs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (error) {
  console.error('Failed to create logs directory:', error);
}

// Create winston logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: logFormat,
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Request log file
    new winston.transports.File({
      filename: path.join(logsDir, 'requests.log'),
      level: 'http',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug',
  }));
}

// Create specialized loggers for different components
export const requestLogger = {
  info: (message, meta = {}) => logger.info(`[REQUEST] ${message}`, meta),
  error: (message, meta = {}) => logger.error(`[REQUEST] ${message}`, meta),
  warn: (message, meta = {}) => logger.warn(`[REQUEST] ${message}`, meta),
};

export const serviceLogger = {
  info: (service, message, meta = {}) => logger.info(`[${service.toUpperCase()}] ${message}`, meta),
  error: (service, message, meta = {}) => logger.error(`[${service.toUpperCase()}] ${message}`, meta),
  warn: (service, message, meta = {}) => logger.warn(`[${service.toUpperCase()}] ${message}`, meta),
  debug: (service, message, meta = {}) => logger.debug(`[${service.toUpperCase()}] ${message}`, meta),
};

export const apiLogger = {
  request: (method, url, statusCode, duration, meta = {}) => {
    const level = statusCode >= 400 ? 'error' : 'http';
    logger.log(level, `[API] ${method} ${url} ${statusCode} ${duration}ms`, {
      method,
      url,
      statusCode,
      duration,
      ...meta,
    });
  },
  response: (method, url, statusCode, responseSize, meta = {}) => {
    logger.http(`[API] ${method} ${url} -> ${statusCode} (${responseSize} bytes)`, {
      method,
      url,
      statusCode,
      responseSize,
      ...meta,
    });
  },
};

// Request ID generator
export const generateRequestId = () => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Middleware for request logging
export const requestLoggingMiddleware = (req, res, next) => {
  const start = Date.now();
  const requestId = generateRequestId();

  // Add request ID to request object
  req.requestId = requestId;

  // Log incoming request
  requestLogger.info(`${req.method} ${req.url}`, {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined,
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;

    apiLogger.request(req.method, req.url, res.statusCode, duration, {
      requestId,
      responseSize: res.get('Content-Length'),
      userAgent: req.get('User-Agent'),
    });

    originalEnd.apply(this, args);
  };

  next();
};

// Performance monitoring
export const performanceLogger = {
  start: (operation, meta = {}) => {
    const startTime = Date.now();
    const operationId = `${operation}_${Date.now()}`;

    logger.debug(`[PERF] Started: ${operation}`, {
      operationId,
      operation,
      startTime,
      ...meta,
    });

    return {
      operationId,
      operation,
      startTime,
      end: (additionalMeta = {}) => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        logger.info(`[PERF] Completed: ${operation} (${duration}ms)`, {
          operationId,
          operation,
          startTime,
          endTime,
          duration,
          ...meta,
          ...additionalMeta,
        });

        return duration;
      },
      fail: (error, additionalMeta = {}) => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        logger.error(`[PERF] Failed: ${operation} (${duration}ms)`, {
          operationId,
          operation,
          startTime,
          endTime,
          duration,
          error: error.message,
          stack: error.stack,
          ...meta,
          ...additionalMeta,
        });

        return duration;
      }
    };
  }
};

// Health monitoring
export const healthLogger = {
  service: (service, status, meta = {}) => {
    const level = status === 'healthy' ? 'info' : 'error';
    logger.log(level, `[HEALTH] ${service}: ${status}`, {
      service,
      status,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  },
  metrics: (metrics) => {
    logger.info('[METRICS] System metrics', {
      timestamp: new Date().toISOString(),
      ...metrics,
    });
  }
};

// Security logging
export const securityLogger = {
  auth: (action, success, meta = {}) => {
    const level = success ? 'info' : 'warn';
    logger.log(level, `[SECURITY] Auth ${action}: ${success ? 'success' : 'failed'}`, {
      action,
      success,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  },
  access: (resource, action, meta = {}) => {
    logger.info(`[SECURITY] Access: ${action} ${resource}`, {
      resource,
      action,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  },
  error: (message, meta = {}) => {
    logger.error(`[SECURITY] ${message}`, {
      timestamp: new Date().toISOString(),
      ...meta,
    });
  }
};

// Export default logger
export default logger;
