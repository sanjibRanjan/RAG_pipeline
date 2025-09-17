#!/usr/bin/env node

/**
 * 🎼 RAG Pipeline Integration Test Runner
 * 
 * Simple runner script to execute the integration test with proper environment setup.
 * This script ensures all required environment variables are checked before running the test.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check for required environment variables
function checkEnvironment() {
  console.log("🔍 Checking environment configuration...");
  
  const requiredVars = [
    'HF_API_KEY',
    'GOOGLE_API_KEY',
    'CHROMA_DB_URL'
  ];
  
  const optionalVars = [
    'HF_MODEL',
    'LLM_PROVIDER',
    'LLM_MODEL',
    'LLM_TEMPERATURE',
    'LLM_MAX_TOKENS',
    'CHROMA_COLLECTION_NAME'
  ];
  
  const missing = [];
  const warnings = [];
  
  // Check required variables
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missing.push(varName);
    } else {
      console.log(`✅ ${varName}: Set`);
    }
  });
  
  // Check optional variables
  optionalVars.forEach(varName => {
    if (!process.env[varName]) {
      warnings.push(varName);
    } else {
      console.log(`✅ ${varName}: ${process.env[varName]}`);
    }
  });
  
  if (missing.length > 0) {
    console.error("\n❌ Missing required environment variables:");
    missing.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error("\nPlease set these variables in your .env file or environment.");
    return false;
  }
  
  if (warnings.length > 0) {
    console.log("\n⚠️  Optional environment variables not set (using defaults):");
    warnings.forEach(varName => {
      console.log(`   - ${varName}`);
    });
  }
  
  console.log("\n✅ Environment check passed!");
  return true;
}

// Load environment variables from .env file if it exists
function loadEnvFile() {
  const envPath = join(__dirname, '.env');
  
  if (fs.existsSync(envPath)) {
    console.log("📄 Loading environment variables from .env file...");
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    });
    
    console.log("✅ Environment variables loaded from .env");
  } else {
    console.log("⚠️  No .env file found, using system environment variables only");
  }
}

// Main execution
async function main() {
  console.log("🎼 RAG Pipeline Integration Test Runner");
  console.log("=" .repeat(50));
  
  try {
    // Load environment variables
    loadEnvFile();
    
    // Check environment
    if (!checkEnvironment()) {
      process.exit(1);
    }
    
    // Import and run the integration test
    console.log("\n🚀 Starting integration test...");
    const { default: IntegrationTest } = await import('./src/test_integration.js');
    
    const test = new IntegrationTest();
    await test.run();
    
  } catch (error) {
    console.error("\n💥 Integration test runner failed:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
