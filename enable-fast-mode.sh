#!/bin/bash

# Enable Fast Mode for RAG Pipeline QA Service
# This script sets environment variables to disable expensive LLM operations
# for faster response times at the cost of some accuracy

echo "🚀 Enabling QA Fast Mode..."
echo "This will disable:"
echo "  - Query rewriting"
echo "  - LLM-based re-ranking"
echo "  - Narrative context building"
echo ""
echo "Benefits: ~5-10x faster response times"
echo "Trade-off: Slightly reduced accuracy"
echo ""

# Set environment variables for fast mode
export QA_FAST_MODE=true
export DISABLE_QUERY_REWRITING=true
export DISABLE_LLM_RERANKING=true
export DISABLE_NARRATIVE_CONTEXT=true

echo "✅ Fast Mode enabled!"
echo ""
echo "To make this permanent, add these lines to your .env file:"
echo "QA_FAST_MODE=true"
echo "DISABLE_QUERY_REWRITING=true"
echo "DISABLE_LLM_RERANKING=true"
echo "DISABLE_NARRATIVE_CONTEXT=true"
echo ""
echo "To disable fast mode, restart without these variables or set QA_FAST_MODE=false"
