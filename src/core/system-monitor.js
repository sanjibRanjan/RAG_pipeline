/**
 * System Monitor - Comprehensive Observability and Health Monitoring
 * Implements production-ready monitoring, metrics, and alerting
 */

import { EventEmitter } from 'events';
import { performanceLogger } from '../utils/logger.js';

export class SystemMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
        responseTimes: []
      },
      embeddings: {
        totalGenerated: 0,
        cacheHits: 0,
        cacheMisses: 0,
        apiCalls: 0,
        retries: 0,
        failures: 0,
        averageGenerationTime: 0
      },
      documents: {
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        averageProcessingTime: 0,
        averageChunksPerDocument: 0
      },
      system: {
        uptime: Date.now(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        activeConnections: 0,
        errorRate: 0
      }
    };
    
    this.healthChecks = new Map();
    this.alerts = [];
    this.alertCooldowns = new Map(); // Track alert cooldowns to prevent spam
    this.thresholds = {
      errorRate: 0.05, // 5% error rate threshold
      responseTime: 5000, // 5 second response time threshold
      memoryUsage: 0.95, // 95% memory usage threshold (more realistic for dev)
      embeddingFailureRate: 0.1 // 10% embedding failure rate threshold
    };
    
    this.startMonitoring();
  }

  /**
   * Start system monitoring
   */
  startMonitoring() {
    // Monitor system metrics every 30 seconds
    this.metricsInterval = setInterval(() => {
      this.updateSystemMetrics();
      this.checkHealthThresholds();
    }, 30000);

    // Monitor memory usage every 10 seconds
    this.memoryInterval = setInterval(() => {
      this.updateMemoryMetrics();
    }, 10000);

    // Clean up old metrics every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, 5 * 60 * 1000);

    console.log('📊 [MONITOR] System monitoring started');
  }

  /**
   * Stop system monitoring
   */
  stopMonitoring() {
    if (this.metricsInterval) clearInterval(this.metricsInterval);
    if (this.memoryInterval) clearInterval(this.memoryInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    
    console.log('📊 [MONITOR] System monitoring stopped');
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics() {
    this.metrics.system.uptime = Date.now() - this.metrics.system.uptime;
    this.metrics.system.memoryUsage = process.memoryUsage();
    this.metrics.system.cpuUsage = process.cpuUsage();
    
    // Calculate error rate
    const totalRequests = this.metrics.requests.total;
    if (totalRequests > 0) {
      this.metrics.system.errorRate = this.metrics.requests.failed / totalRequests;
    }
    
    // Calculate average response time
    if (this.metrics.requests.responseTimes.length > 0) {
      const sum = this.metrics.requests.responseTimes.reduce((a, b) => a + b, 0);
      this.metrics.requests.averageResponseTime = sum / this.metrics.requests.responseTimes.length;
    }
  }

  /**
   * Update memory metrics with intelligent monitoring
   */
  updateMemoryMetrics() {
    const memUsage = process.memoryUsage();
    const memUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
    
    // Only alert if memory usage is above threshold AND increasing
    if (memUsagePercent > this.thresholds.memoryUsage) {
      // Check if memory usage is increasing (not just stable high usage)
      const lastMemoryUsage = this.metrics.system.memoryUsage.heapUsed;
      const isIncreasing = memUsage.heapUsed > lastMemoryUsage;
      
      if (isIncreasing) {
        this.emitAlert('MEMORY_HIGH', {
          level: 'warning',
          message: `Memory usage is high and increasing: ${(memUsagePercent * 100).toFixed(1)}%`,
          value: memUsagePercent,
          threshold: this.thresholds.memoryUsage,
          trend: 'increasing'
        });
      }
    }
    
    // Update the stored memory usage for next comparison
    this.metrics.system.memoryUsage = memUsage;
  }

  /**
   * Check health thresholds and emit alerts
   */
  checkHealthThresholds() {
    // Check error rate
    if (this.metrics.system.errorRate > this.thresholds.errorRate) {
      this.emitAlert('ERROR_RATE_HIGH', {
        level: 'critical',
        message: `Error rate is high: ${(this.metrics.system.errorRate * 100).toFixed(1)}%`,
        value: this.metrics.system.errorRate,
        threshold: this.thresholds.errorRate
      });
    }

    // Check response time
    if (this.metrics.requests.averageResponseTime > this.thresholds.responseTime) {
      this.emitAlert('RESPONSE_TIME_HIGH', {
        level: 'warning',
        message: `Average response time is high: ${this.metrics.requests.averageResponseTime}ms`,
        value: this.metrics.requests.averageResponseTime,
        threshold: this.thresholds.responseTime
      });
    }

    // Check embedding failure rate
    const totalEmbeddingAttempts = this.metrics.embeddings.apiCalls + this.metrics.embeddings.failures;
    if (totalEmbeddingAttempts > 0) {
      const embeddingFailureRate = this.metrics.embeddings.failures / totalEmbeddingAttempts;
      if (embeddingFailureRate > this.thresholds.embeddingFailureRate) {
        this.emitAlert('EMBEDDING_FAILURE_RATE_HIGH', {
          level: 'critical',
          message: `Embedding failure rate is high: ${(embeddingFailureRate * 100).toFixed(1)}%`,
          value: embeddingFailureRate,
          threshold: this.thresholds.embeddingFailureRate
        });
      }
    }
  }

  /**
   * Emit an alert with intelligent throttling
   * @param {string} type - Alert type
   * @param {Object} alert - Alert data
   */
  emitAlert(type, alert) {
    const now = Date.now();
    const cooldownKey = `${type}_${alert.level}`;
    const cooldownPeriod = alert.level === 'critical' ? 30000 : 60000; // 30s for critical, 60s for warnings
    
    // Check if we're in cooldown period
    if (this.alertCooldowns.has(cooldownKey)) {
      const lastAlert = this.alertCooldowns.get(cooldownKey);
      if (now - lastAlert < cooldownPeriod) {
        return; // Skip this alert due to cooldown
      }
    }
    
    const alertData = {
      id: `${type}_${now}`,
      type,
      timestamp: now,
      ...alert
    };

    this.alerts.push(alertData);
    
    // Update cooldown
    this.alertCooldowns.set(cooldownKey, now);
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    console.log(`🚨 [ALERT] ${alert.level.toUpperCase()}: ${alert.message}`);
    this.emit('alert', alertData);
  }

  /**
   * Record a request
   * @param {Object} requestData - Request data
   */
  recordRequest(requestData) {
    this.metrics.requests.total++;
    
    if (requestData.success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }
    
    if (requestData.responseTime) {
      this.metrics.requests.responseTimes.push(requestData.responseTime);
      
      // Keep only last 1000 response times
      if (this.metrics.requests.responseTimes.length > 1000) {
        this.metrics.requests.responseTimes = this.metrics.requests.responseTimes.slice(-1000);
      }
    }
  }

  /**
   * Record embedding generation
   * @param {Object} embeddingData - Embedding data
   */
  recordEmbedding(embeddingData) {
    if (embeddingData.cacheHit) {
      this.metrics.embeddings.cacheHits++;
    } else {
      this.metrics.embeddings.cacheMisses++;
      this.metrics.embeddings.apiCalls++;
    }
    
    if (embeddingData.success) {
      this.metrics.embeddings.totalGenerated++;
    } else {
      this.metrics.embeddings.failures++;
    }
    
    if (embeddingData.retries) {
      this.metrics.embeddings.retries += embeddingData.retries;
    }
    
    if (embeddingData.generationTime) {
      // Update average generation time
      const currentAvg = this.metrics.embeddings.averageGenerationTime;
      const totalGenerated = this.metrics.embeddings.totalGenerated;
      this.metrics.embeddings.averageGenerationTime = 
        (currentAvg * (totalGenerated - 1) + embeddingData.generationTime) / totalGenerated;
    }
  }

  /**
   * Record document processing
   * @param {Object} documentData - Document data
   */
  recordDocument(documentData) {
    this.metrics.documents.totalProcessed++;
    
    if (documentData.success) {
      this.metrics.documents.successful++;
    } else {
      this.metrics.documents.failed++;
    }
    
    if (documentData.processingTime) {
      // Update average processing time
      const currentAvg = this.metrics.documents.averageProcessingTime;
      const totalProcessed = this.metrics.documents.totalProcessed;
      this.metrics.documents.averageProcessingTime = 
        (currentAvg * (totalProcessed - 1) + documentData.processingTime) / totalProcessed;
    }
    
    if (documentData.chunks) {
      // Update average chunks per document
      const currentAvg = this.metrics.documents.averageChunksPerDocument;
      const totalProcessed = this.metrics.documents.totalProcessed;
      this.metrics.documents.averageChunksPerDocument = 
        (currentAvg * (totalProcessed - 1) + documentData.chunks) / totalProcessed;
    }
  }

  /**
   * Register a health check
   * @param {string} name - Health check name
   * @param {Function} checkFunction - Health check function
   * @param {number} interval - Check interval in ms
   */
  registerHealthCheck(name, checkFunction, interval = 60000) {
    this.healthChecks.set(name, {
      function: checkFunction,
      interval,
      lastCheck: 0,
      lastResult: null
    });
    
    // Run the health check
    const runCheck = async () => {
      try {
        const result = await checkFunction();
        this.healthChecks.get(name).lastResult = result;
        this.healthChecks.get(name).lastCheck = Date.now();
        
        if (!result.healthy) {
          this.emitAlert(`HEALTH_CHECK_FAILED_${name.toUpperCase()}`, {
            level: 'critical',
            message: `Health check failed: ${name} - ${result.message}`,
            service: name,
            result
          });
        }
      } catch (error) {
        this.emitAlert(`HEALTH_CHECK_ERROR_${name.toUpperCase()}`, {
          level: 'critical',
          message: `Health check error: ${name} - ${error.message}`,
          service: name,
          error: error.message
        });
      }
    };
    
    // Run immediately
    runCheck();
    
    // Schedule recurring checks
    setInterval(runCheck, interval);
    
    console.log(`🏥 [MONITOR] Health check registered: ${name}`);
  }

  /**
   * Get comprehensive system metrics
   * @returns {Object} System metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      alerts: this.alerts.slice(-10), // Last 10 alerts
      healthChecks: this.getHealthCheckResults(),
      timestamp: Date.now()
    };
  }

  /**
   * Get health check results
   * @returns {Object} Health check results
   */
  getHealthCheckResults() {
    const results = {};
    for (const [name, check] of this.healthChecks) {
      results[name] = {
        lastCheck: check.lastCheck,
        result: check.lastResult,
        healthy: check.lastResult?.healthy ?? false
      };
    }
    return results;
  }

  /**
   * Get system health status
   * @returns {Object} Health status
   */
  getHealthStatus() {
    const metrics = this.getMetrics();
    const healthChecks = this.getHealthCheckResults();
    
    const overallHealth = {
      status: 'healthy',
      issues: [],
      metrics: {
        errorRate: metrics.system.errorRate,
        responseTime: metrics.requests.averageResponseTime,
        memoryUsage: metrics.system.memoryUsage.heapUsed / metrics.system.memoryUsage.heapTotal,
        uptime: metrics.system.uptime
      }
    };
    
    // Check for issues
    if (metrics.system.errorRate > this.thresholds.errorRate) {
      overallHealth.issues.push('High error rate');
      overallHealth.status = 'degraded';
    }
    
    if (metrics.requests.averageResponseTime > this.thresholds.responseTime) {
      overallHealth.issues.push('High response time');
      overallHealth.status = 'degraded';
    }
    
    if (metrics.system.memoryUsage.heapUsed / metrics.system.memoryUsage.heapTotal > this.thresholds.memoryUsage) {
      overallHealth.issues.push('High memory usage');
      overallHealth.status = 'degraded';
    }
    
    // Check health checks
    for (const [name, check] of Object.entries(healthChecks)) {
      if (!check.healthy) {
        overallHealth.issues.push(`Health check failed: ${name}`);
        overallHealth.status = 'unhealthy';
      }
    }
    
    return overallHealth;
  }

  /**
   * Clean up old metrics and cooldowns
   */
  cleanupOldMetrics() {
    // Clean up old alerts (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.alerts = this.alerts.filter(alert => alert.timestamp > oneHourAgo);
    
    // Clean up old cooldowns (older than 2 hours)
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    for (const [key, timestamp] of this.alertCooldowns) {
      if (timestamp < twoHoursAgo) {
        this.alertCooldowns.delete(key);
      }
    }
    
    console.log('🧹 [MONITOR] Cleaned up old metrics and cooldowns');
  }

  /**
   * Get performance summary
   * @returns {Object} Performance summary
   */
  getPerformanceSummary() {
    const metrics = this.getMetrics();
    
    return {
      requests: {
        total: metrics.requests.total,
        successRate: metrics.requests.total > 0 ? 
          (metrics.requests.successful / metrics.requests.total * 100).toFixed(2) + '%' : '0%',
        averageResponseTime: Math.round(metrics.requests.averageResponseTime) + 'ms'
      },
      embeddings: {
        totalGenerated: metrics.embeddings.totalGenerated,
        cacheHitRate: (metrics.embeddings.cacheHits + metrics.embeddings.cacheMisses) > 0 ?
          (metrics.embeddings.cacheHits / (metrics.embeddings.cacheHits + metrics.embeddings.cacheMisses) * 100).toFixed(2) + '%' : '0%',
        averageGenerationTime: Math.round(metrics.embeddings.averageGenerationTime) + 'ms',
        retryRate: metrics.embeddings.apiCalls > 0 ?
          (metrics.embeddings.retries / metrics.embeddings.apiCalls * 100).toFixed(2) + '%' : '0%'
      },
      documents: {
        totalProcessed: metrics.documents.totalProcessed,
        successRate: metrics.documents.totalProcessed > 0 ?
          (metrics.documents.successful / metrics.documents.totalProcessed * 100).toFixed(2) + '%' : '0%',
        averageProcessingTime: Math.round(metrics.documents.averageProcessingTime) + 'ms',
        averageChunksPerDocument: Math.round(metrics.documents.averageChunksPerDocument)
      },
      system: {
        uptime: Math.round(metrics.system.uptime / 1000) + 's',
        memoryUsage: Math.round(metrics.system.memoryUsage.heapUsed / 1024 / 1024) + 'MB',
        errorRate: (metrics.system.errorRate * 100).toFixed(2) + '%'
      }
    };
  }
}

export default SystemMonitor;
