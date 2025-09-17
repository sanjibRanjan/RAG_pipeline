#!/bin/bash

# 🎼 RAG Pipeline Integration Test Demo Script
# This script demonstrates how to run the integration test with proper setup

echo "🎼 RAG Pipeline Integration Test Demo"
echo "===================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating a template..."
    cat > .env.template << EOF
# Required Environment Variables
HF_API_KEY=your_huggingface_api_key_here
GOOGLE_API_KEY=your_google_gemini_api_key_here
CHROMA_DB_URL=http://localhost:8000

# Optional Environment Variables
HF_MODEL=sentence-transformers/all-MiniLM-L6-v2
LLM_PROVIDER=google
LLM_MODEL=gemini-1.5-flash
LLM_TEMPERATURE=0.3
LLM_MAX_TOKENS=2000
CHROMA_COLLECTION_NAME=rag_documents
EOF
    echo "📄 Created .env.template file. Please copy it to .env and fill in your API keys."
    echo ""
    echo "To continue:"
    echo "1. Copy .env.template to .env: cp .env.template .env"
    echo "2. Edit .env with your actual API keys"
    echo "3. Run this script again"
    exit 1
fi

echo "✅ .env file found"

# Check if ChromaDB is running
echo "🔍 Checking ChromaDB connection..."
CHROMA_URL=$(grep CHROMA_DB_URL .env | cut -d'=' -f2)
if curl -s "$CHROMA_URL/api/v1/heartbeat" > /dev/null 2>&1; then
    echo "✅ ChromaDB is running at $CHROMA_URL"
else
    echo "⚠️  ChromaDB connection failed at $CHROMA_URL"
    echo "   Please ensure ChromaDB is running before proceeding."
    echo ""
    echo "   To start ChromaDB:"
    echo "   docker run -p 8000:8000 chromadb/chroma:latest"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "✅ Dependencies ready"

# Run the integration test
echo ""
echo "🚀 Starting Integration Test..."
echo "================================"
echo ""

node run-integration-test.js

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Integration test completed successfully!"
    echo "🚀 Your RAG pipeline is ready for production!"
else
    echo ""
    echo "❌ Integration test failed!"
    echo "🔧 Please check the errors above and fix them."
    exit 1
fi
