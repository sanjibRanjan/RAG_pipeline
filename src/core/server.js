import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { DocumentProcessor } from "../services/document-processor.js";
import { EmbeddingService } from "../services/embedding-service.js";
import { VectorStore } from "../services/vector-store.js";
// import { MongoVectorStore } from "../services/mongo-vector-store.js";
import { ConversationManager } from "../services/conversation-manager.js";
import { DocumentStore } from "../services/document-store.js";
import { QAService } from "../services/qa-service.js";
import EventManager from "./event-manager.js";
import SystemMonitor from "./system-monitor.js";
import logger, { requestLoggingMiddleware, serviceLogger, healthLogger, performanceLogger } from "../utils/logger.js";

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envResult = dotenv.config();
if (envResult.error) {
  console.warn("⚠️ Failed to load .env file:", envResult.error.message);
  console.warn("⚠️ Trying to load from current directory...");
  dotenv.config({ path: path.join(__dirname, '../../.env') });
}

console.log("🔧 Environment loaded:");
console.log("   - LLM_PROVIDER:", process.env.LLM_PROVIDER || 'not set');
console.log("   - GOOGLE_API_KEY:", process.env.GOOGLE_API_KEY ? 'set' : 'not set');
console.log("   - NODE_ENV:", process.env.NODE_ENV || 'not set');

// Validate required environment variables
function validateEnvironment() {
  const requiredVars = [];
  const optionalVars = ['HF_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY'];
  
  // Check for at least one LLM API key
  const hasLLMKey = optionalVars.some(key => process.env[key]);
  if (!hasLLMKey) {
    console.warn("⚠️ No LLM API key found. Set one of: HF_API_KEY, GOOGLE_API_KEY, or ANTHROPIC_API_KEY");
  }
  
  console.log("🔍 Environment validation:", {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3001,
    HOST: process.env.HOST || '0.0.0.0',
    hasLLMKey,
    hasHFKey: !!process.env.HF_API_KEY,
    hasGoogleKey: !!process.env.GOOGLE_API_KEY,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY
  });
}

validateEnvironment();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `upload-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// File filter for PDF and TXT only
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["application/pdf", "text/plain"];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and TXT files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Initialize services (with error handling)
let documentProcessor, embeddingService, vectorStore, conversationManager, documentStore, qaService, eventManager, systemMonitor;

try {
  console.log("🔧 Creating service instances...");
  
  // Initialize system monitor first
  systemMonitor = new SystemMonitor();
  
  // Initialize event manager
  eventManager = new EventManager();
  
  // Initialize core services
  documentProcessor = new DocumentProcessor();
  embeddingService = new EmbeddingService(systemMonitor); // Pass system monitor for observability

  // Initialize vector store (MongoDB only)
  vectorStore = new VectorStore(); // MongoDB implementation

  conversationManager = new ConversationManager();
  documentStore = new DocumentStore(); // Phase 1: DocumentStore for parent chunks

  qaService = new QAService(embeddingService, vectorStore, documentStore);
  
  console.log("✅ Service instances created successfully");
} catch (error) {
  console.error("❌ Failed to create service instances:", error);
  // In production, continue with null services
  if (process.env.NODE_ENV === 'production') {
    console.warn("⚠️ Continuing with null services - some features will be disabled");
  } else {
    throw error;
  }
}

// Initialize services on startup
async function initializeServices() {
  const perfTracker = performanceLogger.start('service_initialization');

  try {
    console.log("🔧 Initializing RAG Pipeline services...");
    logger.info("🔧 Initializing RAG Pipeline services...");

    let servicesInitialized = 0;

    // Initialize embedding service
    if (embeddingService) {
      try {
        console.log("🤖 Initializing embedding service...");
        const embeddingPerf = performanceLogger.start('embedding_service_init');
        const initialized = await embeddingService.initialize();
        embeddingPerf.end();
        
        if (initialized) {
          healthLogger.service('EmbeddingService', 'healthy');
          servicesInitialized++;
          console.log("✅ Embedding service initialized");
          
          // Register health check for embedding service
          if (systemMonitor) {
            systemMonitor.registerHealthCheck('embedding-service', async () => {
              try {
                const isHealthy = await embeddingService.healthCheck();
                return {
                  healthy: isHealthy,
                  message: isHealthy ? 'Embedding service is healthy' : 'Embedding service health check failed',
                  metrics: embeddingService.getMetrics()
                };
              } catch (error) {
                return {
                  healthy: false,
                  message: `Embedding service health check error: ${error.message}`,
                  error: error.message
                };
              }
            });
          }
        } else {
          healthLogger.service('EmbeddingService', 'unhealthy');
          console.log("⚠️ Embedding service initialization failed - continuing without embedding service");
        }
      } catch (error) {
        console.error("❌ Embedding service failed:", error.message);
        logger.error("❌ Embedding service initialization failed:", error);
        healthLogger.service('EmbeddingService', 'error');
      }
    }

    // Initialize vector store (MongoDB only)
    if (vectorStore) {
      try {
        console.log("🍃 Initializing MongoDB vector store...");
        const vectorPerf = performanceLogger.start('mongodb_vector_store_init');
        await vectorStore.initialize();
        vectorPerf.end();
        healthLogger.service('MongoDBVectorStore', 'healthy');
        servicesInitialized++;
        console.log("✅ MongoDB vector store initialized");
      } catch (error) {
        console.error("❌ MongoDB vector store failed:", error.message);
        logger.error("❌ MongoDB vector store initialization failed:", error);
      }
    }

    // Initialize QA service
    if (qaService) {
      try {
        console.log("💬 Initializing QA service...");
        const qaPerf = performanceLogger.start('qa_service_init');
        await qaService.initialize();
        qaPerf.end();
        healthLogger.service('QAService', 'healthy');
        servicesInitialized++;
        console.log("✅ QA service initialized");
      } catch (error) {
        console.error("❌ QA service failed:", error.message);
        logger.error("❌ QA service initialization failed:", error);
      }
    }

    perfTracker.end({
      servicesInitialized,
      environment: process.env.NODE_ENV || 'development'
    });

    console.log(`✅ ${servicesInitialized} services initialized successfully`);
    logger.info(`✅ ${servicesInitialized} services initialized successfully`);
    serviceLogger.info('server', 'RAG Pipeline ready to accept requests');
  } catch (error) {
    perfTracker.fail(error);
    console.error("❌ Failed to initialize services:", error);
    logger.error("❌ Failed to initialize services:", {
      error: error.message,
      stack: error.stack
    });
    healthLogger.service('ServiceInitialization', 'failed', { error: error.message });
    
    // In production, don't exit - let the server start and handle errors gracefully
    if (process.env.NODE_ENV === 'production') {
      console.warn("⚠️ Continuing with degraded service - some features may not work");
      logger.warn("⚠️ Continuing with degraded service - some features may not work");
    } else {
      process.exit(1);
    }
  }
}

// Configure CORS whitelist
const corsWhitelist = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "https://rag-pipeline-front.vercel.app"
];

// Configure middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (corsWhitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging middleware
app.use(requestLoggingMiddleware);

// Request metrics middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Override res.end to capture response metrics
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const responseTime = Date.now() - startTime;
    
    // Record request metrics
    if (systemMonitor) {
      systemMonitor.recordRequest({
        success: res.statusCode < 400,
        responseTime,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode
      });
    }
    
    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
});

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));

// Simple startup check endpoint (for Railway healthcheck)
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "RAG Pipeline API is running",
    timestamp: new Date().toISOString()
  });
});

// Basic health check endpoint
app.get("/health", (req, res) => {
  try {
    // Basic health check - server is running
    const healthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "RAG Pipeline API",
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: "1.0.0"
    };

    // Add service status if available
    if (embeddingService && embeddingService.isInitialized) {
      healthStatus.services = {
        embedding: "healthy",
        vectorStore: vectorStore && vectorStore.isInitialized ? "healthy" : "unavailable",
        qaService: qaService ? "healthy" : "unknown"
      };
    }

    res.status(200).json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      service: "RAG Pipeline API",
      error: error.message
    });
  }
});

// Enhanced health check endpoint with system monitoring
app.get("/health/detailed", (req, res) => {
  try {
    const healthStatus = systemMonitor ? systemMonitor.getHealthStatus() : { status: 'unknown' };
    const metrics = systemMonitor ? systemMonitor.getMetrics() : {};
    
    res.json({
      status: healthStatus.status,
      timestamp: new Date().toISOString(),
      service: "RAG Pipeline API",
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: "1.0.0",
      health: healthStatus,
      metrics: {
        system: metrics.system,
        requests: metrics.requests,
        embeddings: metrics.embeddings,
        documents: metrics.documents,
        vectorStore: null
      }
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get detailed health status",
      error: error.message
    });
  }
});

// Metrics endpoint
app.get("/metrics", (req, res) => {
  try {
    const metrics = systemMonitor ? systemMonitor.getMetrics() : {};
    const performanceSummary = systemMonitor ? systemMonitor.getPerformanceSummary() : {};

    res.json({
      timestamp: new Date().toISOString(),
      metrics,
      performance: performanceSummary,
      embeddingService: embeddingService ? embeddingService.getMetrics() : null,
      eventManager: eventManager ? eventManager.getSystemMetrics() : null
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get metrics",
      error: error.message
    });
  }
});

// Usage endpoint
app.get("/api/usage", (req, res) => {
  try {
    const metrics = systemMonitor ? systemMonitor.getMetrics() : {};
    const performanceSummary = systemMonitor ? systemMonitor.getPerformanceSummary() : {};
    const conversationStats = conversationManager ? conversationManager.getStats() : {};

    const usageData = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        embeddingService: embeddingService ? 'available' : 'unavailable',
        vectorStore: vectorStore && vectorStore.isInitialized ? 'available' : 'unavailable',
        qaService: qaService ? 'available' : 'unavailable',
        conversationManager: conversationManager ? 'available' : 'unavailable'
      },
      requests: {
        total: metrics.requests?.total || 0,
        successful: metrics.requests?.successful || 0,
        failed: metrics.requests?.failed || 0,
        averageResponseTime: metrics.requests?.averageResponseTime || 0
      },
      conversations: {
        total: conversationStats.totalConversations || 0,
        active: conversationStats.activeConversations || 0,
        totalMessages: conversationStats.totalMessages || 0
      },
      documents: {
        totalProcessed: metrics.documents?.total || 0,
        totalChunks: metrics.documents?.totalChunks || 0
      },
      embeddings: {
        totalGenerated: metrics.embeddings?.total || 0,
        averageGenerationTime: metrics.embeddings?.averageGenerationTime || 0
      }
    };

    res.json({
      success: true,
      data: usageData,
      message: "Usage statistics retrieved successfully"
    });
  } catch (error) {
    console.error("Usage endpoint error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve usage statistics",
      error: error.message
    });
  }
});

// Processing status endpoint
app.get("/status/processing", (req, res) => {
  try {
    const processingStatuses = eventManager ? eventManager.getAllProcessingStatuses() : [];
    
    res.json({
      timestamp: new Date().toISOString(),
      processing: processingStatuses,
      summary: {
        total: processingStatuses.length,
        processing: processingStatuses.filter(s => s.status === 'processing').length,
        completed: processingStatuses.filter(s => s.status === 'completed').length,
        failed: processingStatuses.filter(s => s.status === 'failed').length
      }
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get processing status",
      error: error.message
    });
  }
});

// File upload endpoint
app.post("/api/documents/upload", upload.single("document"), (req, res) => {
  const uploadPerf = performanceLogger.start('file_upload');

  try {
    if (!req.file) {
      logger.warn("❌ File upload failed: No file provided", {
        requestId: req.requestId,
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const uploadTime = new Date().toISOString();
    const uploadData = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadPath: req.file.path,
      uploadTime,
    };

    uploadPerf.end({
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      originalName: req.file.originalname
    });

    serviceLogger.info('document_upload', `File uploaded successfully: ${req.file.originalname}`, {
      requestId: req.requestId,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      uploadPath: req.file.path
    });

    res.json({
      success: true,
      data: uploadData,
      message: "File uploaded successfully",
    });
  } catch (error) {
    uploadPerf.fail(error);
    logger.error("❌ Upload error:", {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId
    });
    res.status(500).json({
      success: false,
      message: "Upload failed",
      error: error.message,
    });
  }
});

// Document ingestion endpoint
app.post("/api/documents/ingest", async (req, res) => {
  const ingestionPerf = performanceLogger.start('document_ingestion');

  try {
    const { filePath, originalName } = req.body;

    if (!filePath || !originalName) {
      logger.warn("❌ Document ingestion failed: Missing required parameters", {
        requestId: req.requestId,
        hasFilePath: !!filePath,
        hasOriginalName: !!originalName
      });
      return res.status(400).json({
        success: false,
        message: "filePath and originalName are required",
      });
    }

    serviceLogger.info('document_ingestion', `Starting document ingestion: ${originalName}`, {
      requestId: req.requestId,
      filePath,
      originalName
    });

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      logger.warn("❌ Document ingestion failed: File not found", {
        requestId: req.requestId,
        filePath,
        originalName
      });
      return res.status(400).json({
        success: false,
        message: "File not found at specified path",
      });
    }

    // Process document
    const processPerf = performanceLogger.start('document_processing');
    const processedDoc = await documentProcessor.processFile(filePath, originalName);
    processPerf.end({
      chunksCreated: processedDoc.chunks.length,
      textLength: processedDoc.metadata.textLength
    });

    // Generate embeddings for chunks using batch processing
    const embedPerf = performanceLogger.start('embedding_generation');
    
    // Limit chunks for large documents to prevent API overload
    const maxChunks = parseInt(process.env.MAX_CHUNKS_PER_DOCUMENT) || 100;
    const chunksToProcess = processedDoc.chunks.slice(0, maxChunks);
    
    if (processedDoc.chunks.length > maxChunks) {
      console.log(`⚠️ Document has ${processedDoc.chunks.length} chunks, processing only first ${maxChunks} chunks`);
    }
    
    const texts = chunksToProcess.map((chunk) => chunk.content);
    
    // Check if embedding service is available
    if (!embeddingService.isInitialized) {
      throw new Error("Embedding service is not available. Please check your Google API quota and try again.");
    }
    
    // Generate document ID for event tracking
    const documentId = `doc_${Date.now()}_${originalName.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    // Emit document upload event for event-driven processing
    if (eventManager) {
      eventManager.emit('document.uploaded', {
        documentId,
        filePath,
        originalName
      });
    }
    
    // Use event-driven mini-batch processing with caching and rate limiting
    console.log(`🔄 Generating embeddings for ${texts.length} chunks using event-driven mini-batch processing...`);
    
    let embeddings;
    if (eventManager) {
      // Use event-driven mini-batch processing
      embeddings = await eventManager.processChunksInMiniBatches(
        documentId, 
        texts, 
        async (chunks) => await embeddingService.processChunksInQueue(chunks)
      );
    } else {
      // Fallback to direct processing
      embeddings = await embeddingService.processChunksInQueue(texts);
    }
    embedPerf.end({
      chunksEmbedded: embeddings.length,
      embeddingDimensions: embeddings[0]?.length || 0,
      batchSize: texts.length
    });

    // Record document processing metrics
    if (systemMonitor) {
      systemMonitor.recordDocument({
        success: true,
        processingTime: embedPerf.duration,
        chunks: chunksToProcess.length
      });
    }

    // Emit document processing completed event
    if (eventManager) {
      eventManager.emit('document.processing.completed', {
        documentId,
        chunks: chunksToProcess,
        embeddings
      });
    }

    // Generate unique IDs for processed chunks
    const baseId = `doc_${Date.now()}_${originalName.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const ids = chunksToProcess.map((_, index) => `${baseId}_chunk_${index}`);

    // Prepare metadata for processed chunks
    const metadatas = chunksToProcess.map((chunk, index) => ({
      ...chunk.metadata,
      documentName: originalName,
      chunkIndex: index,
      totalChunks: processedDoc.chunks.length,
      processedChunks: chunksToProcess.length,
      version: processedDoc.metadata.version,
      uploadedAt: processedDoc.metadata.processedAt,
      fileSize: processedDoc.metadata.fileSize,
      fileType: processedDoc.metadata.fileType,
      textLength: processedDoc.metadata.textLength,
      ingestionTime: new Date().toISOString(),
    }));

    // Store in primary vector database (MongoDB if configured)
    const storagePerf = performanceLogger.start('vector_storage');
    await vectorStore.addDocuments(texts, embeddings, metadatas, ids);
    storagePerf.end({
      chunksStored: texts.length,
      documentId: baseId
    });

    // Phase 1: Store parent chunks in DocumentStore
    if (processedDoc.parentChunks && processedDoc.parentChunks.length > 0) {
      const parentStoragePerf = performanceLogger.start('parent_chunk_storage');
      const parentChunkData = processedDoc.parentChunks.map(chunk => ({
        id: chunk.id,
        chunk: chunk
      }));
      
      const parentStoreResult = documentStore.storeParentChunksBatch(parentChunkData);
      parentStoragePerf.end({
        parentChunksStored: parentStoreResult.successful,
        documentId: baseId
      });
      
      console.log(`📦 Stored ${parentStoreResult.successful}/${parentStoreResult.total} parent chunks in DocumentStore`);
    }

    ingestionPerf.end({
      documentName: originalName,
      chunksProcessed: processedDoc.chunks.length,
      embeddingsGenerated: embeddings.length,
      documentId: baseId
    });

    serviceLogger.info('document_ingestion', `Document ingested successfully: ${originalName}`, {
      requestId: req.requestId,
      documentName: originalName,
      chunksProcessed: processedDoc.chunks.length,
      embeddingsGenerated: embeddings.length,
      documentId: baseId,
      processingTime: ingestionPerf.operation
    });

    res.json({
      success: true,
      data: {
        documentName: originalName,
        chunksProcessed: processedDoc.chunks.length,
        totalEmbeddings: embeddings.length,
        documentId: baseId,
        fileSize: processedDoc.metadata.fileSize,
        processingTime: new Date().toISOString(),
      },
      message: "Document ingested successfully",
    });
  } catch (error) {
    ingestionPerf.fail(error);
    logger.error("❌ Ingestion error:", {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      filePath: req.body?.filePath,
      originalName: req.body?.originalName
    });
    res.status(500).json({
      success: false,
      message: "Document ingestion failed",
      error: error.message,
    });
  }
});

// Question answering endpoint
app.post("/api/qa/ask", async (req, res) => {
  const qaPerf = performanceLogger.start('qa_request');

  try {
    const { question, sessionId } = req.body;

    if (!question) {
      logger.warn("❌ QA request failed: Question is required", {
        requestId: req.requestId,
        sessionId
      });
      return res.status(400).json({
        success: false,
        message: "Question is required",
      });
    }

    // Generate or use session ID
    const currentSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    serviceLogger.info('qa_service', `Processing question for session: ${currentSessionId}`, {
      requestId: req.requestId,
      sessionId: currentSessionId,
      questionLength: question.length
    });

    // Get conversation history
    const conversationHistory = conversationManager.getConversation(currentSessionId);

    // Get answer from QA service
    const qaServicePerf = performanceLogger.start('qa_service_processing');
    const result = await qaService.answerQuestion(question, conversationHistory);
    qaServicePerf.end({
      chunksSearched: result.metadata.totalChunksSearched,
      relevantChunks: result.metadata.relevantChunksFound,
      confidence: result.confidence
    });

    // Add question to conversation history
    conversationManager.addMessage(currentSessionId, {
      type: "question",
      content: question,
    });

    // Add answer to conversation history
    conversationManager.addMessage(currentSessionId, {
      type: "answer",
      content: result.answer,
      sources: result.sources,
      confidence: result.confidence,
    });

    qaPerf.end({
      sessionId: currentSessionId,
      questionLength: question.length,
      answerLength: result.answer.length,
      sourcesCount: result.sources.length,
      confidence: result.confidence,
      chunksSearched: result.metadata.totalChunksSearched
    });

    serviceLogger.info('qa_service', `Question answered successfully for session: ${currentSessionId}`, {
      requestId: req.requestId,
      sessionId: currentSessionId,
      confidence: (result.confidence * 100).toFixed(1) + '%',
      sourcesCount: result.sources.length,
      chunksSearched: result.metadata.totalChunksSearched
    });

    res.json({
      success: true,
      data: {
        sessionId: currentSessionId,
        answer: result.answer,
        sources: result.sources,
        confidence: result.confidence,
        conversationHistory: conversationManager.getConversation(currentSessionId, 10), // Last 10 messages
        metadata: result.metadata,
      },
      message: "Question answered successfully",
    });
  } catch (error) {
    qaPerf.fail(error);
    logger.error("❌ QA API error:", {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      question: req.body?.question?.substring(0, 100),
      sessionId: req.body?.sessionId
    });
    res.status(500).json({
      success: false,
      message: "Failed to answer question",
      error: error.message,
    });
  }
});

// Get conversation history endpoint
app.get("/api/conversations/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit } = req.query;

    const conversation = conversationManager.getConversation(sessionId, limit ? parseInt(limit) : null);

    res.json({
      success: true,
      data: {
        sessionId,
        messages: conversation,
        messageCount: conversation.length,
      },
      message: "Conversation retrieved successfully",
    });
  } catch (error) {
    console.error("Conversation retrieval error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve conversation",
      error: error.message,
    });
  }
});

// Clear conversation endpoint
app.delete("/api/conversations/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;

    const cleared = conversationManager.clearConversation(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        cleared,
      },
      message: cleared ? "Conversation cleared successfully" : "Conversation not found",
    });
  } catch (error) {
    console.error("Conversation clear error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear conversation",
      error: error.message,
    });
  }
});

// Conversation statistics endpoint
app.get("/api/conversations/stats", (req, res) => {
  try {
    const stats = conversationManager.getStats();

    res.json({
      success: true,
      data: stats,
      message: "Conversation statistics retrieved successfully",
    });
  } catch (error) {
    console.error("Conversation stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve conversation statistics",
      error: error.message,
    });
  }
});

// Document listing endpoints

// GET /api/documents - List all documents with pagination
app.get("/api/documents", async (req, res) => {
  try {
    const { limit = 10, offset = 0, search, fileType, minSize, maxSize } = req.query;

    let documents;

    if (search || fileType || minSize || maxSize) {
      // Use search functionality with filters
      const filters = {};
      if (fileType) filters.fileType = fileType;
      if (minSize) filters.minFileSize = parseInt(minSize);
      if (maxSize) filters.maxFileSize = parseInt(maxSize);

      documents = await vectorStore.searchDocuments(search || "", filters);
    } else {
      // Use basic listing
      documents = await vectorStore.listDocuments(parseInt(limit), parseInt(offset));
    }

    res.json({
      success: true,
      data: {
        documents,
        total: documents.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        filters: search ? { search, fileType, minSize, maxSize } : null,
      },
      message: "Documents retrieved successfully",
    });
  } catch (error) {
    console.error("Document listing error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve documents",
      error: error.message,
    });
  }
});

// GET /api/documents/summaries - Get document summaries
app.get("/api/documents/summaries", async (req, res) => {
  try {
    const summaries = await vectorStore.getDocumentSummaries();

    res.json({
      success: true,
      data: {
        summaries,
        totalDocuments: summaries.length,
        totalChunks: summaries.reduce((sum, doc) => sum + doc.chunks, 0),
        totalSize: summaries.reduce((sum, doc) => sum + doc.fileSize, 0),
      },
      message: "Document summaries retrieved successfully",
    });
  } catch (error) {
    console.error("Document summaries error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve document summaries",
      error: error.message,
    });
  }
});

// GET /api/documents/search - Search documents
app.get("/api/documents/search", async (req, res) => {
  try {
    const { q: query, fileType, minSize, maxSize, limit = 20 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query parameter 'q' is required",
      });
    }

    const filters = {};
    if (fileType) filters.fileType = fileType;
    if (minSize) filters.minFileSize = parseInt(minSize);
    if (maxSize) filters.maxFileSize = parseInt(maxSize);

    const results = await vectorStore.searchDocuments(query, filters);

    // Limit results if specified
    const limitedResults = results.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        query,
        results: limitedResults,
        totalFound: results.length,
        returned: limitedResults.length,
        filters,
      },
      message: "Document search completed successfully",
    });
  } catch (error) {
    console.error("Document search error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search documents",
      error: error.message,
    });
  }
});

// GET /api/documents/:name - Get details for a specific document
app.get("/api/documents/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const details = await vectorStore.getDocumentDetails(decodeURIComponent(name));

    res.json({
      success: true,
      data: details,
      message: "Document details retrieved successfully",
    });
  } catch (error) {
    console.error("Document details error:", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: `Document "${req.params.name}" not found`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to retrieve document details",
      error: error.message,
    });
  }
});

// GET /api/documents/stats/overview - Get overall document statistics
app.get("/api/documents/stats/overview", async (req, res) => {
  try {
    const summaries = await vectorStore.getDocumentSummaries();
    const totalStats = await vectorStore.getStats();

    const overview = {
      totalDocuments: summaries.length,
      totalChunks: summaries.reduce((sum, doc) => sum + doc.chunks, 0),
      totalEmbeddings: summaries.reduce((sum, doc) => sum + doc.totalEmbeddings, 0),
      totalSize: summaries.reduce((sum, doc) => sum + doc.fileSize, 0),
      averageDocumentSize: summaries.length > 0 ?
        summaries.reduce((sum, doc) => sum + doc.fileSize, 0) / summaries.length : 0,
      fileTypeDistribution: {},
      versionDistribution: {},
      recentUploads: summaries
        .filter(doc => doc.uploadedAt)
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
        .slice(0, 5)
        .map(doc => ({
          name: doc.name,
          uploadedAt: doc.uploadedAt,
          fileSize: doc.fileSize
        }))
    };

    // Calculate distributions
    summaries.forEach(doc => {
      // File type distribution
      overview.fileTypeDistribution[doc.fileType] =
        (overview.fileTypeDistribution[doc.fileType] || 0) + 1;

      // Version distribution
      overview.versionDistribution[doc.version] =
        (overview.versionDistribution[doc.version] || 0) + 1;
    });

    res.json({
      success: true,
      data: overview,
      message: "Document overview statistics retrieved successfully",
    });
  } catch (error) {
    console.error("Document overview stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve document overview statistics",
      error: error.message,
    });
  }
});

// Document versioning endpoints

// GET /api/documents/:name/versions - Get all versions of a document
app.get("/api/documents/:name/versions", async (req, res) => {
  try {
    const { name } = req.params;
    const versions = await vectorStore.getDocumentVersions(decodeURIComponent(name));

    res.json({
      success: true,
      data: {
        documentName: decodeURIComponent(name),
        versions,
        totalVersions: versions.length,
        currentVersion: versions.length > 0 ? versions[0].version : 0,
      },
      message: "Document versions retrieved successfully",
    });
  } catch (error) {
    console.error("Document versions error:", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: `Document "${req.params.name}" not found`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to retrieve document versions",
      error: error.message,
    });
  }
});

// GET /api/documents/:name/versions/:version - Get specific version of a document
app.get("/api/documents/:name/versions/:version", async (req, res) => {
  try {
    const { name, version } = req.params;
    const documentVersion = await vectorStore.getDocumentVersion(
      decodeURIComponent(name),
      parseInt(version)
    );

    res.json({
      success: true,
      data: documentVersion,
      message: "Document version retrieved successfully",
    });
  } catch (error) {
    console.error("Document version error:", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to retrieve document version",
      error: error.message,
    });
  }
});

// POST /api/documents/:name/versions/compare - Compare two versions
app.post("/api/documents/:name/versions/compare", async (req, res) => {
  try {
    const { name } = req.params;
    const { version1, version2 } = req.body;

    if (!version1 || !version2) {
      return res.status(400).json({
        success: false,
        message: "Both version1 and version2 are required",
      });
    }

    const comparison = await vectorStore.compareDocumentVersions(
      decodeURIComponent(name),
      parseInt(version1),
      parseInt(version2)
    );

    res.json({
      success: true,
      data: comparison,
      message: "Version comparison completed successfully",
    });
  } catch (error) {
    console.error("Version comparison error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to compare document versions",
      error: error.message,
    });
  }
});

// DELETE /api/documents/:name/versions/:version - Delete a specific version
app.delete("/api/documents/:name/versions/:version", async (req, res) => {
  try {
    const { name, version } = req.params;

    const deleted = await vectorStore.deleteDocumentVersion(
      decodeURIComponent(name),
      parseInt(version)
    );

    res.json({
      success: true,
      data: {
        documentName: decodeURIComponent(name),
        deletedVersion: parseInt(version),
        deleted,
      },
      message: `Document version ${version} deleted successfully`,
    });
  } catch (error) {
    console.error("Delete version error:", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to delete document version",
      error: error.message,
    });
  }
});

// POST /api/documents/:name/versions/:version/rollback - Rollback to a specific version
app.post("/api/documents/:name/versions/:version/rollback", async (req, res) => {
  try {
    const { name, version } = req.params;

    const rollbackResult = await vectorStore.rollbackDocumentVersion(
      decodeURIComponent(name),
      parseInt(version)
    );

    res.json({
      success: true,
      data: rollbackResult,
      message: `Document rolled back to version ${version} successfully`,
    });
  } catch (error) {
    console.error("Rollback error:", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to rollback document version",
      error: error.message,
    });
  }
});

// GET /api/documents/:name/history - Get version history
app.get("/api/documents/:name/history", async (req, res) => {
  try {
    const { name } = req.params;
    const history = await vectorStore.getVersionHistory(decodeURIComponent(name));

    res.json({
      success: true,
      data: history,
      message: "Version history retrieved successfully",
    });
  } catch (error) {
    console.error("Version history error:", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: `Document "${req.params.name}" not found`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to retrieve version history",
      error: error.message,
    });
  }
});

// POST /api/documents/ingest/versioned - Enhanced ingestion with versioning options
app.post("/api/documents/ingest/versioned", async (req, res) => {
  try {
    const { filePath, originalName, forceNewVersion = false } = req.body;

    if (!filePath || !originalName) {
      return res.status(400).json({
        success: false,
        message: "filePath and originalName are required",
      });
    }

    console.log(`🔄 Starting versioned document ingestion: ${originalName}`);

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({
        success: false,
        message: "File not found at specified path",
      });
    }

    // Get existing versions for this document
    let existingVersions = [];
    try {
      existingVersions = await vectorStore.getDocumentVersions(originalName);
    } catch (error) {
      // Document doesn't exist yet, that's fine
      console.log(`📄 New document: ${originalName}`);
    }

    // Process document with versioning
    const processedDoc = await documentProcessor.processFile(
      filePath,
      originalName,
      existingVersions,
      { forceNewVersion }
    );

    // If file is unchanged, don't re-ingest
    if (processedDoc.metadata.versionType === 'unchanged') {
      console.log(`⚠️ Document ${originalName} is unchanged, skipping ingestion`);

      return res.json({
        success: true,
        data: {
          documentName: originalName,
          version: processedDoc.metadata.version,
          versionType: processedDoc.metadata.versionType,
          message: "Document unchanged, no new version created",
        },
        message: "Document ingestion completed (no changes)",
      });
    }

    // Check if embedding service is available
    if (!embeddingService.isInitialized) {
      throw new Error("Embedding service is not available. Please check your Google API quota and try again.");
    }

    // Generate embeddings and store in vector database using robust queue processing
    const texts = processedDoc.chunks.map((chunk) => chunk.content);
    const embeddings = await embeddingService.processChunksInQueue(texts);

    // Generate unique IDs for this version
    const baseId = `doc_${Date.now()}_${originalName.replace(/[^a-zA-Z0-9]/g, '_')}_v${processedDoc.metadata.version}`;
    const ids = processedDoc.chunks.map((_, index) => `${baseId}_chunk_${index}`);

    // Prepare metadata with version information
    const metadatas = processedDoc.chunks.map((chunk, index) => ({
      ...chunk.metadata,
      documentName: originalName,
      chunkIndex: index,
      totalChunks: processedDoc.chunks.length,
      version: processedDoc.metadata.version,
      versionType: processedDoc.metadata.versionType,
      fileHash: processedDoc.metadata.fileHash,
      uploadedAt: processedDoc.metadata.processedAt,
      lastModified: processedDoc.metadata.lastModified,
      createdAt: processedDoc.metadata.createdAt,
      ingestionTime: new Date().toISOString(),
    }));

    // Store in primary vector database (MongoDB if configured)
    await vectorStore.addDocuments(texts, embeddings, metadatas, ids);

    console.log(`✅ Versioned document ingested: ${originalName} v${processedDoc.metadata.version} (${processedDoc.metadata.versionType}) - ${processedDoc.chunks.length} chunks`);

    res.json({
      success: true,
      data: {
        documentName: originalName,
        version: processedDoc.metadata.version,
        versionType: processedDoc.metadata.versionType,
        chunksProcessed: processedDoc.chunks.length,
        totalEmbeddings: embeddings.length,
        documentId: baseId,
        fileSize: processedDoc.metadata.fileSize,
        fileHash: processedDoc.metadata.fileHash,
        previousVersions: processedDoc.metadata.previousVersions?.length || 0,
        processingTime: new Date().toISOString(),
      },
      message: "Versioned document ingested successfully",
    });
  } catch (error) {
    console.error("Versioned ingestion error:", error);
    res.status(500).json({
      success: false,
      message: "Versioned document ingestion failed",
      error: error.message,
    });
  }
});

// Metadata management endpoints

// GET /api/documents/:name/metadata - Get document metadata
app.get("/api/documents/:name/metadata", async (req, res) => {
  try {
    const { name } = req.params;
    const versions = await vectorStore.getDocumentVersions(decodeURIComponent(name));

    if (versions.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Document "${name}" not found`,
      });
    }

    // Get the most recent version's metadata
    const latestVersion = versions[0];
    const metadata = latestVersion.metadata;

    res.json({
      success: true,
      data: {
        documentName: decodeURIComponent(name),
        metadata,
        version: latestVersion.version,
        lastUpdated: metadata.processedAt,
      },
      message: "Document metadata retrieved successfully",
    });
  } catch (error) {
    console.error("Document metadata error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve document metadata",
      error: error.message,
    });
  }
});

// PUT /api/documents/:name/metadata - Update document metadata
app.put("/api/documents/:name/metadata", async (req, res) => {
  try {
    const { name } = req.params;
    const updates = req.body;

    // Validate allowed metadata fields
    const allowedFields = [
      'title', 'description', 'author', 'tags', 'categories',
      'language', 'summary', 'customFields'
    ];

    const validatedUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        validatedUpdates[key] = value;
      }
    }

    if (Object.keys(validatedUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid metadata fields provided for update",
      });
    }

    // Get current metadata to merge with updates
    const versions = await vectorStore.getDocumentVersions(decodeURIComponent(name));
    if (versions.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Document "${name}" not found`,
      });
    }

    const currentMetadata = versions[0].metadata;
    const updatedMetadata = {
      ...currentMetadata,
      ...validatedUpdates,
      lastMetadataUpdate: new Date().toISOString(),
    };

    // Note: In a real implementation, you might want to update this in the vector store
    // For now, we'll return the updated metadata structure
    console.log(`📝 Updated metadata for ${name}:`, validatedUpdates);

    res.json({
      success: true,
      data: {
        documentName: decodeURIComponent(name),
        metadata: updatedMetadata,
        updatedFields: Object.keys(validatedUpdates),
      },
      message: "Document metadata updated successfully",
    });
  } catch (error) {
    console.error("Update metadata error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update document metadata",
      error: error.message,
    });
  }
});

// POST /api/documents/metadata/search - Search documents by metadata
app.post("/api/documents/metadata/search", async (req, res) => {
  try {
    const { filters, limit = 20 } = req.body;

    if (!filters || Object.keys(filters).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Search filters are required",
      });
    }

    const summaries = await vectorStore.getDocumentSummaries();
    let filteredResults = summaries;

    // Apply filters
    if (filters.fileType) {
      filteredResults = filteredResults.filter(doc => doc.fileType === filters.fileType);
    }

    if (filters.language) {
      filteredResults = filteredResults.filter(doc => doc.language === filters.language);
    }

    if (filters.tags && filters.tags.length > 0) {
      filteredResults = filteredResults.filter(doc =>
        filters.tags.some(tag => doc.tags?.includes(tag))
      );
    }

    if (filters.categories && filters.categories.length > 0) {
      filteredResults = filteredResults.filter(doc =>
        filters.categories.some(cat => doc.categories?.includes(cat))
      );
    }

    if (filters.minComplexity !== undefined) {
      filteredResults = filteredResults.filter(doc => doc.complexity >= filters.minComplexity);
    }

    if (filters.maxComplexity !== undefined) {
      filteredResults = filteredResults.filter(doc => doc.complexity <= filters.maxComplexity);
    }

    if (filters.author) {
      filteredResults = filteredResults.filter(doc =>
        doc.author?.toLowerCase().includes(filters.author.toLowerCase())
      );
    }

    if (filters.title) {
      filteredResults = filteredResults.filter(doc =>
        doc.title?.toLowerCase().includes(filters.title.toLowerCase())
      );
    }

    // Apply limit
    const limitedResults = filteredResults.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        query: filters,
        results: limitedResults,
        totalFound: filteredResults.length,
        returned: limitedResults.length,
      },
      message: "Metadata search completed successfully",
    });
  } catch (error) {
    console.error("Metadata search error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search by metadata",
      error: error.message,
    });
  }
});

// GET /api/documents/metadata/schema - Get metadata schema
app.get("/api/documents/metadata/schema", (req, res) => {
  try {
    const metadataSchema = {
      basic: {
        fileName: { type: "string", description: "Original filename" },
        fileSize: { type: "number", description: "File size in bytes" },
        fileType: { type: "string", description: "File extension/type" },
        fileHash: { type: "string", description: "SHA-256 hash of file content" },
        mimeType: { type: "string", description: "MIME type" },
        createdAt: { type: "string", description: "File creation timestamp" },
        modifiedAt: { type: "string", description: "File modification timestamp" },
        processedAt: { type: "string", description: "Document processing timestamp" },
      },
      content: {
        textLength: { type: "number", description: "Total character count" },
        wordCount: { type: "number", description: "Total word count" },
        sentenceCount: { type: "number", description: "Total sentence count" },
        paragraphCount: { type: "number", description: "Total paragraph count" },
        pages: { type: "number", description: "Estimated page count" },
        readingTime: { type: "number", description: "Estimated reading time in minutes" },
      },
      quality: {
        language: { type: "string", description: "Detected language code" },
        complexity: { type: "number", description: "Text complexity score (0-1)", min: 0, max: 1 },
      },
      custom: {
        title: { type: "string", description: "Document title" },
        summary: { type: "string", description: "Document summary" },
        description: { type: "string", description: "Document description" },
        author: { type: "string", description: "Document author" },
        tags: { type: "array", description: "Document tags" },
        categories: { type: "array", description: "Document categories" },
      },
      processing: {
        chunkCount: { type: "number", description: "Number of text chunks" },
        averageChunkSize: { type: "number", description: "Average chunk size" },
        processingTime: { type: "number", description: "Processing time in milliseconds" },
        processor: { type: "string", description: "Processing software version" },
      },
      versioning: {
        version: { type: "number", description: "Document version number" },
        versionType: { type: "string", description: "Version type (new, updated, forced)" },
        previousVersions: { type: "array", description: "List of previous version numbers" },
      }
    };

    res.json({
      success: true,
      data: {
        schema: metadataSchema,
        version: "1.0",
        lastUpdated: new Date().toISOString(),
      },
      message: "Metadata schema retrieved successfully",
    });
  } catch (error) {
    console.error("Metadata schema error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve metadata schema",
      error: error.message,
    });
  }
});

// GET /api/documents/metadata/stats - Get metadata statistics
app.get("/api/documents/metadata/stats", async (req, res) => {
  try {
    const summaries = await vectorStore.getDocumentSummaries();

    if (summaries.length === 0) {
      return res.json({
        success: true,
        data: {
          totalDocuments: 0,
          stats: {},
        },
        message: "No documents found",
      });
    }

    // Calculate metadata statistics
    const stats = {
      fileTypes: {},
      languages: {},
      complexity: {
        min: Math.min(...summaries.map(doc => doc.complexity || 0)),
        max: Math.max(...summaries.map(doc => doc.complexity || 0)),
        average: summaries.reduce((sum, doc) => sum + (doc.complexity || 0), 0) / summaries.length,
      },
      wordCount: {
        total: summaries.reduce((sum, doc) => sum + (doc.wordCount || 0), 0),
        average: summaries.reduce((sum, doc) => sum + (doc.wordCount || 0), 0) / summaries.length,
      },
      readingTime: {
        total: summaries.reduce((sum, doc) => sum + (doc.readingTime || 0), 0),
        average: summaries.reduce((sum, doc) => sum + (doc.readingTime || 0), 0) / summaries.length,
      },
      tags: {},
      categories: {},
      authors: {},
    };

    // Count distributions
    summaries.forEach(doc => {
      // File types
      stats.fileTypes[doc.fileType] = (stats.fileTypes[doc.fileType] || 0) + 1;

      // Languages
      if (doc.language) {
        stats.languages[doc.language] = (stats.languages[doc.language] || 0) + 1;
      }

      // Tags
      if (doc.tags) {
        doc.tags.forEach(tag => {
          stats.tags[tag] = (stats.tags[tag] || 0) + 1;
        });
      }

      // Categories
      if (doc.categories) {
        doc.categories.forEach(cat => {
          stats.categories[cat] = (stats.categories[cat] || 0) + 1;
        });
      }

      // Authors
      if (doc.author) {
        stats.authors[doc.author] = (stats.authors[doc.author] || 0) + 1;
      }
    });

    res.json({
      success: true,
      data: {
        totalDocuments: summaries.length,
        stats,
        generatedAt: new Date().toISOString(),
      },
      message: "Metadata statistics retrieved successfully",
    });
  } catch (error) {
    console.error("Metadata stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve metadata statistics",
      error: error.message,
    });
  }
});


// GET /api/performance/mongodb - Get MongoDB performance metrics
app.get("/api/performance/mongodb", async (req, res) => {
  try {
    if (!vectorStore || !vectorStore.isInitialized) {
      return res.status(400).json({
        success: false,
        message: "Vector store is not available"
      });
    }

    const metrics = await vectorStore.getPerformanceMetrics();

    res.json({
      success: true,
      data: metrics,
      message: "MongoDB performance metrics retrieved successfully"
    });
  } catch (error) {
    console.error("MongoDB performance metrics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve MongoDB performance metrics",
      error: error.message
    });
  }
});

// POST /api/performance/mongodb/optimize - Optimize MongoDB collection
app.post("/api/performance/mongodb/optimize", async (req, res) => {
  try {
    if (!vectorStore || !vectorStore.isInitialized) {
      return res.status(400).json({
        success: false,
        message: "Vector store is not available"
      });
    }

    console.log("🔧 Starting collection optimization...");
    const results = await vectorStore.optimizeCollection();

    res.json({
      success: true,
      data: results,
      message: "MongoDB collection optimization completed successfully"
    });
  } catch (error) {
    console.error("MongoDB optimization error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to optimize MongoDB collection",
      error: error.message
    });
  }
});

// GET /api/performance/search-benchmark - Benchmark search performance
app.get("/api/performance/search-benchmark", async (req, res) => {
  try {
    const { iterations = 5 } = req.query;

    if (!vectorStore || !vectorStore.isInitialized) {
      return res.status(400).json({
        success: false,
        message: "Vector store is not available"
      });
    }

    console.log(`🏃 Starting search performance benchmark (${iterations} iterations)...`);

    const results = [];
    const testEmbedding = Array.from({ length: 384 }, () => Math.random()); // Mock embedding

    for (let i = 0; i < parseInt(iterations); i++) {
      const startTime = Date.now();

      try {
        const searchResults = await vectorStore.search(testEmbedding, 5);
        const duration = Date.now() - startTime;

        results.push({
          iteration: i + 1,
          duration,
          resultsFound: searchResults.ids[0]?.length || 0,
          success: true
        });

        console.log(`   Iteration ${i + 1}: ${duration}ms, ${searchResults.ids[0]?.length || 0} results`);
      } catch (error) {
        results.push({
          iteration: i + 1,
          duration: Date.now() - startTime,
          error: error.message,
          success: false
        });
      }

      // Small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successfulResults = results.filter(r => r.success);
    const avgDuration = successfulResults.length > 0
      ? successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length
      : 0;

    const benchmark = {
      summary: {
        totalIterations: parseInt(iterations),
        successfulIterations: successfulResults.length,
        failedIterations: results.length - successfulResults.length,
        averageDuration: Math.round(avgDuration),
        totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
      },
      results,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Benchmark completed: ${successfulResults.length}/${iterations} successful, avg ${Math.round(avgDuration)}ms`);

    res.json({
      success: true,
      data: benchmark,
      message: "Search performance benchmark completed"
    });
  } catch (error) {
    console.error("Search benchmark error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to run search benchmark",
      error: error.message
    });
  }
});

// POST /api/admin/clear-documents - Clear all documents from vector store
app.post("/api/admin/clear-documents", async (req, res) => {
  try {
    if (!vectorStore || !vectorStore.isInitialized) {
      return res.status(400).json({
        success: false,
        message: "Vector store is not available"
      });
    }

    console.log("🗑️ Clearing all documents from vector store...");
    const result = await vectorStore.clearAllDocuments();

    res.json({
      success: true,
      data: result,
      message: "All documents cleared successfully"
    });
  } catch (error) {
    console.error("❌ Failed to clear documents:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear documents",
      error: error.message
    });
  }
});

// GET /api/performance/system - Get system performance metrics
app.get("/api/performance/system", async (req, res) => {
  try {
    const systemMetrics = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };

    // Format memory values
    systemMetrics.memory.formatted = {
      rss: `${Math.round(systemMetrics.memory.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(systemMetrics.memory.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(systemMetrics.memory.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(systemMetrics.memory.external / 1024 / 1024)} MB`
    };

    res.json({
      success: true,
      data: systemMetrics,
      message: "System performance metrics retrieved successfully"
    });
  } catch (error) {
    console.error("System metrics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve system metrics",
      error: error.message
    });
  }
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);

  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size allowed is 10MB.",
        error: err.message
      });
    }
  }

  // Handle other errors
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : "Something went wrong"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Start server
const startServer = async () => {
  const serverPerfTracker = performanceLogger.start('server_startup');

  try {
    console.log("🚀 Starting RAG Pipeline API server...");
    console.log("📊 Environment:", {
      port: PORT,
      host: HOST,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version
    });

    logger.info("🚀 Starting RAG Pipeline API server...", {
      port: PORT,
      host: HOST,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version
    });

    console.log("🔧 Initializing services...");
    // Initialize services first
    await initializeServices();
    console.log("✅ Services initialized successfully");

    console.log(`🌐 Starting server on ${HOST}:${PORT}...`);
    // Start the server
    const server = app.listen(PORT, HOST, () => {
      const startupTime = serverPerfTracker.end({
        port: PORT,
        environment: process.env.NODE_ENV || 'development'
      });

      logger.info(`✅ RAG Pipeline API server started successfully`, {
        port: PORT,
        host: HOST,
        startupTime: `${startupTime}ms`,
        endpoints: [
          `http://${HOST}:${PORT}/health`,
          `http://${HOST}:${PORT}/api/documents/upload`,
          `http://${HOST}:${PORT}/api/qa/ask`
        ]
      });

      serviceLogger.info('server', `Server listening on port ${PORT}`);
      healthLogger.service('APIServer', 'healthy', { port: PORT });
    });

    // Handle server errors
    server.on('error', (error) => {
      logger.error("❌ Server error:", {
        error: error.message,
        stack: error.stack,
        port: PORT
      });
      healthLogger.service('APIServer', 'error', { error: error.message });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info("🛑 Received SIGTERM, shutting down gracefully...");
      server.close(() => {
        logger.info("✅ Server closed successfully");
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info("🛑 Received SIGINT, shutting down gracefully...");
      server.close(() => {
        logger.info("✅ Server closed successfully");
        process.exit(0);
      });
    });

  } catch (error) {
    serverPerfTracker.fail(error);
    console.error("❌ Failed to start server:", error);
    logger.error("❌ Failed to start server:", {
      error: error.message,
      stack: error.stack,
      port: PORT,
      host: HOST
    });
    
    // In production, don't exit immediately - let Railway handle it
    if (process.env.NODE_ENV === 'production') {
      console.error("⚠️ Server failed to start, but continuing for Railway healthcheck...");
      // Start a minimal server for healthcheck
      const minimalApp = express();
      minimalApp.get('/', (req, res) => {
        res.status(500).json({
          status: "error",
          message: "Server failed to start properly",
          error: error.message,
          timestamp: new Date().toISOString()
        });
      });
      minimalApp.listen(PORT, HOST, () => {
        console.log(`⚠️ Minimal server started on ${HOST}:${PORT} for healthcheck`);
      });
    } else {
      process.exit(1);
    }
  }
};

startServer();

export default app;
