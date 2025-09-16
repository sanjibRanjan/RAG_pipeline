// Simple test server to verify basic functionality
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

console.log("🧪 Starting test server...");
console.log("📊 Environment:", {
  port: PORT,
  host: HOST,
  environment: process.env.NODE_ENV || 'development',
  nodeVersion: process.version
});

// Basic middleware
app.use(express.json());

// Simple health check
app.get('/', (req, res) => {
  res.json({
    status: "running",
    message: "Test server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`✅ Test server started successfully on ${HOST}:${PORT}`);
  console.log(`🌐 Health check available at http://${HOST}:${PORT}/health`);
});

server.on('error', (error) => {
  console.error("❌ Server error:", error);
});

export default app;
