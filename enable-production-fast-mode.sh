#!/bin/bash

# Enable Production Fast Mode for RAG Pipeline
# This script configures the system to minimize API usage while maintaining functionality

echo "🚀 Enabling Production Fast Mode for RAG Pipeline..."
echo "This will disable expensive LLM features to save API quota."
echo ""

# Set environment variables for fast mode
export DISABLE_QUERY_REWRITING=true
export DISABLE_MODEL_TIERING=true
export DISABLE_HYDE=true
export LLM_MAX_REQUESTS_PER_MINUTE=5
export LLM_MAX_REQUESTS_PER_DAY=50
export NODE_ENV=production

echo "✅ Fast Mode Configuration:"
echo "   - Query rewriting: DISABLED"
echo "   - Model tiering: DISABLED (uses only synthesis model)"
echo "   - HyDE search: DISABLED"
echo "   - Max requests/minute: 5"
echo "   - Max requests/day: 50"
echo "   - Environment: production"
echo ""

echo "💡 Benefits:"
echo "   - Reduces API calls per question from 4-6 to 1"
echo "   - Uses only the synthesis model (gemini-1.5-pro)"
echo "   - Better fallback answers when quota is exceeded"
echo "   - Maintains core RAG functionality"
echo ""

echo "🔄 To apply these settings permanently, add them to your .env file:"
echo "DISABLE_QUERY_REWRITING=true"
echo "DISABLE_MODEL_TIERING=true"
echo "DISABLE_HYDE=true"
echo "LLM_MAX_REQUESTS_PER_MINUTE=5"
echo "LLM_MAX_REQUESTS_PER_DAY=50"
echo ""

echo "⚠️  Note: With fast mode enabled, answers may be less comprehensive"
echo "    but the system will be much more quota-efficient."
echo ""

# Optionally start the server with these settings
if [ "$1" = "start" ]; then
    echo "🚀 Starting server with fast mode settings..."
    npm start
fi



