#!/usr/bin/env node

/**
 * Comprehensive Test Suite for RAG Pipeline API
 *
 * This test suite covers all API endpoints and functionality:
 * - Document upload and ingestion
 * - Question answering
 * - Document discovery and search
 * - Version management
 * - Metadata management
 * - Conversation management
 * - Error handling and edge cases
 * - Performance testing
 * - Load testing
 *
 * Usage:
 *   node tests/test-suite.js [options]
 *
 * Options:
 *   --verbose        Enable verbose output
 *   --performance    Run performance tests
 *   --load           Run load tests
 *   --integration    Run integration tests only
 *   --unit          Run unit tests only
 *   --report         Generate detailed report
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const CONFIG = {
  baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000/api',
  timeout: 30000,
  testFiles: {
    small: path.join(__dirname, '../data/docs/sample-local-pdf.pdf'),
    text: path.join(__dirname, '../README.md')
  },
  performance: {
    concurrentUsers: 5,
    requestsPerUser: 10,
    rampUpTime: 1000
  },
  load: {
    duration: 60000, // 1 minute
    users: 10
  }
};

// Test results storage
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: [],
  performance: {
    tests: [],
    averageResponseTime: 0,
    minResponseTime: Infinity,
    maxResponseTime: 0
  },
  load: {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    errorRate: 0
  }
};

// Utility functions
class TestUtils {
  static async makeRequest(method, endpoint, data = null, options = {}) {
    const startTime = performance.now();
    const url = `${CONFIG.baseURL}${endpoint}`;

    try {
      let response;
      const config = {
        method,
        url,
        timeout: CONFIG.timeout,
        ...options
      };

      if (data && (method === 'post' || method === 'put')) {
        config.data = data;
        config.headers = {
          'Content-Type': 'application/json',
          ...config.headers
        };
      }

      response = await axios(config);
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      return {
        success: true,
        status: response.status,
        data: response.data,
        responseTime,
        headers: response.headers
      };
    } catch (error) {
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        responseTime
      };
    }
  }

  static async uploadFile(filePath, endpoint = '/documents/upload') {
    const form = new FormData();
    form.append('document', fs.createReadStream(filePath));

    return this.makeRequest('post', endpoint, null, {
      headers: form.getHeaders(),
      data: form
    });
  }

  static log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      error: '\x1b[31m',
      warning: '\x1b[33m',
      reset: '\x1b[0m'
    };

    if (global.verbose || level === 'error') {
      console.log(`${colors[level]}[${timestamp}] ${message}${colors.reset}`);
    }
  }

  static assert(condition, message, testName) {
    results.total++;

    if (condition) {
      results.passed++;
      this.log(`✅ ${testName}: PASSED`, 'success');
      return true;
    } else {
      results.failed++;
      results.errors.push({
        test: testName,
        message,
        timestamp: new Date().toISOString()
      });
      this.log(`❌ ${testName}: FAILED - ${message}`, 'error');
      return false;
    }
  }

  static skip(testName, reason) {
    results.total++;
    results.skipped++;
    this.log(`⏭️  ${testName}: SKIPPED - ${reason}`, 'warning');
  }

  static measurePerformance(testName, responseTime) {
    results.performance.tests.push({
      name: testName,
      responseTime,
      timestamp: new Date().toISOString()
    });

    results.performance.averageResponseTime =
      results.performance.tests.reduce((sum, test) => sum + test.responseTime, 0) /
      results.performance.tests.length;

    results.performance.minResponseTime = Math.min(
      results.performance.minResponseTime,
      responseTime
    );

    results.performance.maxResponseTime = Math.max(
      results.performance.maxResponseTime,
      responseTime
    );
  }
}

// Test suites
class TestSuites {
  static async runHealthCheck() {
    TestUtils.log('🏥 Running Health Check Tests...');

    // Test health endpoint
    const result = await TestUtils.makeRequest('get', '/health');
    TestUtils.assert(result.success, 'Health check should succeed', 'Health Check');
    TestUtils.assert(result.status === 200, 'Health check should return 200', 'Health Status');

    if (result.success) {
      TestUtils.assert(result.data.status === 'healthy', 'Service should be healthy', 'Service Status');
    }

    TestUtils.measurePerformance('Health Check', result.responseTime);
  }

  static async runDocumentUploadTests() {
    TestUtils.log('📄 Running Document Upload Tests...');

    // Check if test file exists
    if (!fs.existsSync(CONFIG.testFiles.small)) {
      TestUtils.skip('Document Upload Test', 'Test file not found');
      return;
    }

    // Test file upload
    const uploadResult = await TestUtils.uploadFile(CONFIG.testFiles.small);
    TestUtils.assert(uploadResult.success, 'File upload should succeed', 'File Upload');
    TestUtils.assert(uploadResult.status === 200, 'Upload should return 200', 'Upload Status');

    if (uploadResult.success) {
      TestUtils.assert(uploadResult.data.success, 'Upload response should be successful', 'Upload Response');
      TestUtils.assert(uploadResult.data.data.filename, 'Should return filename', 'Upload Filename');
      TestUtils.assert(uploadResult.data.data.originalName, 'Should return original name', 'Upload Original Name');
    }

    TestUtils.measurePerformance('Document Upload', uploadResult.responseTime);

    // Store upload data for later tests
    this.uploadData = uploadResult.success ? uploadResult.data.data : null;
  }

  static async runDocumentIngestionTests() {
    TestUtils.log('🔄 Running Document Ingestion Tests...');

    if (!this.uploadData) {
      TestUtils.skip('Document Ingestion Test', 'Upload data not available');
      return;
    }

    // Test document ingestion
    const ingestResult = await TestUtils.makeRequest('post', '/documents/ingest', {
      filePath: this.uploadData.uploadPath,
      originalName: this.uploadData.originalName
    });

    TestUtils.assert(ingestResult.success, 'Document ingestion should succeed', 'Document Ingestion');
    TestUtils.assert(ingestResult.status === 200, 'Ingestion should return 200', 'Ingestion Status');

    if (ingestResult.success) {
      TestUtils.assert(ingestResult.data.success, 'Ingestion response should be successful', 'Ingestion Response');
      TestUtils.assert(ingestResult.data.data.chunksProcessed > 0, 'Should process chunks', 'Chunks Processed');
      TestUtils.assert(ingestResult.data.data.documentId, 'Should return document ID', 'Document ID');
    }

    TestUtils.measurePerformance('Document Ingestion', ingestResult.responseTime);

    // Store ingestion data
    this.ingestionData = ingestResult.success ? ingestResult.data.data : null;
  }

  static async runQuestionAnsweringTests() {
    TestUtils.log('💬 Running Question Answering Tests...');

    // Test QA without documents
    const emptyQAResult = await TestUtils.makeRequest('post', '/qa/ask', {
      question: 'What is machine learning?'
    });

    // This might fail if no documents are ingested, which is expected
    TestUtils.log('Note: QA test may fail if no documents are available', 'warning');

    // Test QA with valid question
    const qaResult = await TestUtils.makeRequest('post', '/qa/ask', {
      question: 'What is this document about?',
      sessionId: 'test-session-123'
    });

    // QA should at least return a response structure
    TestUtils.assert(typeof qaResult.data === 'object', 'QA should return object', 'QA Response Type');

    if (qaResult.success) {
      TestUtils.assert(qaResult.data.success !== undefined, 'QA response should have success field', 'QA Success Field');
    }

    TestUtils.measurePerformance('Question Answering', qaResult.responseTime);

    // Store QA data
    this.qaData = qaResult.data;
  }

  static async runDocumentDiscoveryTests() {
    TestUtils.log('🔍 Running Document Discovery Tests...');

    // Test document listing
    const listResult = await TestUtils.makeRequest('get', '/documents');
    TestUtils.assert(listResult.success, 'Document listing should succeed', 'Document Listing');
    TestUtils.assert(Array.isArray(listResult.data?.data?.documents), 'Should return documents array', 'Documents Array');

    // Test document summaries
    const summariesResult = await TestUtils.makeRequest('get', '/documents/summaries');
    TestUtils.assert(summariesResult.success, 'Document summaries should succeed', 'Document Summaries');
    TestUtils.assert(summariesResult.data?.data?.summaries, 'Should return summaries', 'Summaries Data');

    // Test document search
    const searchResult = await TestUtils.makeRequest('get', '/documents/search?q=test');
    TestUtils.assert(searchResult.success, 'Document search should succeed', 'Document Search');
    TestUtils.assert(searchResult.data?.data?.results, 'Should return search results', 'Search Results');

    TestUtils.measurePerformance('Document Discovery', listResult.responseTime);
  }

  static async runVersionManagementTests() {
    TestUtils.log('🔄 Running Version Management Tests...');

    if (!this.uploadData) {
      TestUtils.skip('Version Management Tests', 'Upload data not available');
      return;
    }

    // Test getting document versions
    const versionsResult = await TestUtils.makeRequest('get', `/documents/${this.uploadData.originalName}/versions`);
    TestUtils.assert(versionsResult.success || versionsResult.status === 404, 'Version retrieval should work', 'Version Retrieval');

    if (versionsResult.success) {
      TestUtils.assert(Array.isArray(versionsResult.data?.data?.versions), 'Should return versions array', 'Versions Array');
    }

    // Test versioned ingestion
    const versionedIngestResult = await TestUtils.makeRequest('post', '/documents/ingest/versioned', {
      filePath: this.uploadData.uploadPath,
      originalName: this.uploadData.originalName,
      forceNewVersion: true
    });

    TestUtils.assert(versionedIngestResult.success, 'Versioned ingestion should succeed', 'Versioned Ingestion');

    TestUtils.measurePerformance('Version Management', versionsResult.responseTime);
  }

  static async runMetadataManagementTests() {
    TestUtils.log('📊 Running Metadata Management Tests...');

    if (!this.uploadData) {
      TestUtils.skip('Metadata Management Tests', 'Upload data not available');
      return;
    }

    // Test metadata retrieval
    const metadataResult = await TestUtils.makeRequest('get', `/documents/${this.uploadData.originalName}/metadata`);
    TestUtils.assert(metadataResult.success || metadataResult.status === 404, 'Metadata retrieval should work', 'Metadata Retrieval');

    // Test metadata schema
    const schemaResult = await TestUtils.makeRequest('get', '/documents/metadata/schema');
    TestUtils.assert(schemaResult.success, 'Metadata schema should be available', 'Metadata Schema');
    TestUtils.assert(schemaResult.data?.data?.schema, 'Should return schema', 'Schema Data');

    // Test metadata statistics
    const statsResult = await TestUtils.makeRequest('get', '/documents/metadata/stats');
    TestUtils.assert(statsResult.success, 'Metadata stats should be available', 'Metadata Stats');

    TestUtils.measurePerformance('Metadata Management', metadataResult.responseTime);
  }

  static async runConversationManagementTests() {
    TestUtils.log('💬 Running Conversation Management Tests...');

    // Test conversation statistics
    const statsResult = await TestUtils.makeRequest('get', '/conversations/stats');
    TestUtils.assert(statsResult.success, 'Conversation stats should be available', 'Conversation Stats');

    TestUtils.measurePerformance('Conversation Management', statsResult.responseTime);
  }

  static async runErrorHandlingTests() {
    TestUtils.log('⚠️  Running Error Handling Tests...');

    // Test invalid endpoint
    const invalidEndpointResult = await TestUtils.makeRequest('get', '/invalid/endpoint');
    TestUtils.assert(invalidEndpointResult.status === 404, 'Invalid endpoint should return 404', 'Invalid Endpoint');

    // Test missing required parameters
    const missingParamsResult = await TestUtils.makeRequest('post', '/qa/ask', {});
    TestUtils.assert(!missingParamsResult.success || missingParamsResult.status === 400,
      'Missing parameters should return 400', 'Missing Parameters');

    // Test invalid file upload
    const invalidFileResult = await TestUtils.makeRequest('post', '/documents/upload');
    TestUtils.assert(!invalidFileResult.success || invalidFileResult.status === 400,
      'Invalid file upload should fail', 'Invalid File Upload');

    TestUtils.measurePerformance('Error Handling', invalidEndpointResult.responseTime);
  }

  static async runPerformanceTests() {
    TestUtils.log('⚡ Running Performance Tests...');

    const performanceTests = [
      { endpoint: '/health', method: 'get', name: 'Health Check Performance' },
      { endpoint: '/documents', method: 'get', name: 'Document Listing Performance' },
      { endpoint: '/documents/summaries', method: 'get', name: 'Document Summaries Performance' }
    ];

    for (const test of performanceTests) {
      const results = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const result = await TestUtils.makeRequest(test.method, test.endpoint);
        if (result.success) {
          results.push(result.responseTime);
        }
      }

      if (results.length > 0) {
        const avgTime = results.reduce((sum, time) => sum + time, 0) / results.length;
        const minTime = Math.min(...results);
        const maxTime = Math.max(...results);

        TestUtils.log(`${test.name}: Avg: ${avgTime.toFixed(2)}ms, Min: ${minTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);

        TestUtils.assert(avgTime < 1000, `${test.name} should be under 1000ms`, `${test.name} Response Time`);
      }
    }
  }

  static async runLoadTests() {
    TestUtils.log('🔥 Running Load Tests...');

    const loadTest = async (userId) => {
      const userResults = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalResponseTime: 0
      };

      for (let i = 0; i < CONFIG.performance.requestsPerUser; i++) {
        const result = await TestUtils.makeRequest('get', '/health');
        userResults.totalRequests++;

        if (result.success) {
          userResults.successfulRequests++;
          userResults.totalResponseTime += result.responseTime;
        } else {
          userResults.failedRequests++;
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return userResults;
    };

    const userPromises = [];
    for (let i = 0; i < CONFIG.performance.concurrentUsers; i++) {
      userPromises.push(loadTest(i));
    }

    const userResults = await Promise.all(userPromises);

    // Aggregate results
    const aggregatedResults = userResults.reduce((acc, user) => {
      acc.totalRequests += user.totalRequests;
      acc.successfulRequests += user.successfulRequests;
      acc.failedRequests += user.failedRequests;
      acc.totalResponseTime += user.totalResponseTime;
      return acc;
    }, {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0
    });

    results.load = {
      totalRequests: aggregatedResults.totalRequests,
      successfulRequests: aggregatedResults.successfulRequests,
      failedRequests: aggregatedResults.failedRequests,
      averageResponseTime: aggregatedResults.totalResponseTime / aggregatedResults.successfulRequests,
      errorRate: (aggregatedResults.failedRequests / aggregatedResults.totalRequests) * 100
    };

    TestUtils.log(`Load Test Results:`, 'info');
    TestUtils.log(`Total Requests: ${results.load.totalRequests}`, 'info');
    TestUtils.log(`Successful: ${results.load.successfulRequests}`, 'info');
    TestUtils.log(`Failed: ${results.load.failedRequests}`, 'info');
    TestUtils.log(`Average Response Time: ${results.load.averageResponseTime.toFixed(2)}ms`, 'info');
    TestUtils.log(`Error Rate: ${results.load.errorRate.toFixed(2)}%`, 'info');

    TestUtils.assert(results.load.errorRate < 5, 'Error rate should be less than 5%', 'Load Test Error Rate');
    TestUtils.assert(results.load.averageResponseTime < 500, 'Average response time should be under 500ms', 'Load Test Response Time');
  }

  static async runIntegrationTests() {
    TestUtils.log('🔗 Running Integration Tests...');

    // Full workflow test
    if (!fs.existsSync(CONFIG.testFiles.small)) {
      TestUtils.skip('Integration Test', 'Test file not found');
      return;
    }

    try {
      // 1. Upload document
      TestUtils.log('Step 1: Uploading document...');
      const upload = await TestUtils.uploadFile(CONFIG.testFiles.small);
      TestUtils.assert(upload.success, 'Integration upload should succeed', 'Integration Upload');

      if (!upload.success) return;

      // 2. Ingest document
      TestUtils.log('Step 2: Ingesting document...');
      const ingest = await TestUtils.makeRequest('post', '/documents/ingest', {
        filePath: upload.data.data.uploadPath,
        originalName: upload.data.data.originalName
      });
      TestUtils.assert(ingest.success, 'Integration ingestion should succeed', 'Integration Ingestion');

      if (!ingest.success) return;

      // 3. Wait for processing
      TestUtils.log('Step 3: Waiting for processing...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 4. Ask question
      TestUtils.log('Step 4: Asking question...');
      const qa = await TestUtils.makeRequest('post', '/qa/ask', {
        question: 'What is this document about?',
        sessionId: 'integration-test-session'
      });

      // QA might not find relevant content, but should return proper structure
      TestUtils.assert(typeof qa.data === 'object', 'Integration QA should return object', 'Integration QA');

      // 5. Check document listing
      TestUtils.log('Step 5: Checking document listing...');
      const listing = await TestUtils.makeRequest('get', '/documents');
      TestUtils.assert(listing.success, 'Integration listing should succeed', 'Integration Listing');

      TestUtils.log('✅ Integration test completed successfully!', 'success');

    } catch (error) {
      TestUtils.log(`❌ Integration test failed: ${error.message}`, 'error');
      results.errors.push({
        test: 'Integration Test',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Main test runner
class TestRunner {
  static async run(options = {}) {
    const startTime = performance.now();
    global.verbose = options.verbose || false;

    TestUtils.log('🚀 Starting RAG Pipeline API Test Suite...', 'info');
    TestUtils.log(`Base URL: ${CONFIG.baseURL}`, 'info');
    TestUtils.log(`Test File: ${CONFIG.testFiles.small}`, 'info');

    try {
      // Check if server is running
      const healthCheck = await TestUtils.makeRequest('get', '/health');
      if (!healthCheck.success) {
        TestUtils.log('❌ Server is not running or accessible', 'error');
        TestUtils.log(`Please ensure the server is running on ${CONFIG.baseURL}`, 'error');
        return;
      }

      TestUtils.log('✅ Server is running and accessible', 'success');

      // Run test suites based on options
      const testSuites = [];

      if (options.unit || (!options.integration && !options.performance && !options.load)) {
        testSuites.push(
          TestSuites.runHealthCheck,
          TestSuites.runDocumentUploadTests,
          TestSuites.runDocumentIngestionTests,
          TestSuites.runQuestionAnsweringTests,
          TestSuites.runDocumentDiscoveryTests,
          TestSuites.runVersionManagementTests,
          TestSuites.runMetadataManagementTests,
          TestSuites.runConversationManagementTests,
          TestSuites.runErrorHandlingTests
        );
      }

      if (options.integration || (!options.unit && !options.performance && !options.load)) {
        testSuites.push(TestSuites.runIntegrationTests);
      }

      if (options.performance) {
        testSuites.push(TestSuites.runPerformanceTests);
      }

      if (options.load) {
        testSuites.push(TestSuites.runLoadTests);
      }

      // Execute test suites
      for (const testSuite of testSuites) {
        try {
          await testSuite();
        } catch (error) {
          TestUtils.log(`❌ Test suite failed: ${error.message}`, 'error');
          results.errors.push({
            test: testSuite.name,
            message: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

    } catch (error) {
      TestUtils.log(`❌ Test execution failed: ${error.message}`, 'error');
    }

    // Generate final report
    const endTime = performance.now();
    const totalTime = (endTime - startTime) / 1000;

    this.generateReport(totalTime, options.report);
  }

  static generateReport(totalTime, generateDetailed = false) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST EXECUTION REPORT');
    console.log('='.repeat(60));

    console.log(`\n⏱️  Total Execution Time: ${totalTime.toFixed(2)} seconds`);
    console.log(`📈 Total Tests: ${results.total}`);
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⏭️  Skipped: ${results.skipped}`);

    const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;
    console.log(`📊 Pass Rate: ${passRate}%`);

    if (results.performance.tests.length > 0) {
      console.log('\n⚡ PERFORMANCE METRICS');
      console.log(`Average Response Time: ${results.performance.averageResponseTime.toFixed(2)}ms`);
      console.log(`Min Response Time: ${results.performance.minResponseTime.toFixed(2)}ms`);
      console.log(`Max Response Time: ${results.performance.maxResponseTime.toFixed(2)}ms`);
    }

    if (results.load.totalRequests > 0) {
      console.log('\n🔥 LOAD TEST RESULTS');
      console.log(`Total Requests: ${results.load.totalRequests}`);
      console.log(`Successful Requests: ${results.load.successfulRequests}`);
      console.log(`Failed Requests: ${results.load.failedRequests}`);
      console.log(`Error Rate: ${results.load.errorRate.toFixed(2)}%`);
      console.log(`Average Response Time: ${results.load.averageResponseTime.toFixed(2)}ms`);
    }

    if (results.errors.length > 0) {
      console.log('\n❌ ERRORS');
      results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.test}: ${error.message}`);
      });
    }

    if (generateDetailed) {
      this.generateDetailedReport();
    }

    console.log('\n' + '='.repeat(60));

    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
  }

  static generateDetailedReport() {
    const reportPath = path.join(__dirname, '../test-report.json');
    const detailedReport = {
      timestamp: new Date().toISOString(),
      summary: {
        total: results.total,
        passed: results.passed,
        failed: results.failed,
        skipped: results.skipped,
        passRate: results.total > 0 ? (results.passed / results.total) * 100 : 0
      },
      performance: results.performance,
      load: results.load,
      errors: results.errors,
      configuration: CONFIG
    };

    try {
      fs.writeFileSync(reportPath, JSON.stringify(detailedReport, null, 2));
      console.log(`📄 Detailed report saved to: ${reportPath}`);
    } catch (error) {
      console.log(`❌ Failed to save detailed report: ${error.message}`);
    }
  }
}

// CLI interface
function parseArguments() {
  const args = process.argv.slice(2);
  const options = {};

  args.forEach(arg => {
    switch (arg) {
      case '--verbose':
        options.verbose = true;
        break;
      case '--performance':
        options.performance = true;
        break;
      case '--load':
        options.load = true;
        break;
      case '--integration':
        options.integration = true;
        break;
      case '--unit':
        options.unit = true;
        break;
      case '--report':
        options.report = true;
        break;
      case '--help':
        showHelp();
        process.exit(0);
        break;
    }
  });

  return options;
}

function showHelp() {
  console.log(`
RAG Pipeline API Test Suite

Usage: node tests/test-suite.js [options]

Options:
  --verbose        Enable verbose output
  --performance    Run performance tests
  --load           Run load tests
  --integration    Run integration tests only
  --unit          Run unit tests only
  --report         Generate detailed JSON report
  --help          Show this help message

Examples:
  node tests/test-suite.js                    # Run all tests
  node tests/test-suite.js --verbose          # Run with verbose output
  node tests/test-suite.js --performance      # Run performance tests only
  node tests/test-suite.js --integration      # Run integration tests only
  node tests/test-suite.js --load --report    # Run load tests with report

Environment Variables:
  TEST_BASE_URL    Base URL for API (default: http://localhost:3000/api)
`);
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArguments();
  TestRunner.run(options).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { TestRunner, TestSuites, TestUtils };
