# MongoDB Migration Guide

## Overview

This guide provides a comprehensive step-by-step process for migrating your RAG pipeline from ChromaDB to MongoDB using the gradual migration approach. This migration maintains system availability during the transition and provides rollback capabilities.

## Prerequisites

### 1. MongoDB Setup

You need access to a MongoDB instance. Choose one of the following options:

#### Option A: Local MongoDB
```bash
# Install MongoDB locally
brew install mongodb-community  # macOS
sudo apt install mongodb        # Ubuntu

# Start MongoDB
brew services start mongodb-community  # macOS
sudo systemctl start mongod           # Ubuntu
```

#### Option B: MongoDB Atlas (Cloud)
1. Create account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a cluster
3. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/`

#### Option C: Docker
```bash
docker run -d --name mongodb -p 27017:27017 mongo:latest
```

### 2. Environment Configuration

Update your `.env` file with MongoDB settings:

```bash
# Vector Database Configuration
VECTOR_STORE_TYPE=chromadb  # Keep as chromadb initially

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/rag_pipeline
MONGODB_DATABASE=rag_pipeline
MONGODB_VECTOR_COLLECTION=vector_documents

# For MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/rag_pipeline
```

## Migration Process

### Phase 1: Preparation and Testing

#### Step 1: Install Dependencies
```bash
npm install
```

#### Step 2: Test MongoDB Connection
```bash
# Test MongoDB vector store functionality
npm run test:mongodb

# Verbose output for detailed testing
npm run test:mongodb:verbose

# Test with cleanup (removes test data)
npm run test:mongodb:cleanup
```

#### Step 3: Verify Current System
```bash
# Start the server
npm start

# Check migration status via API
curl http://localhost:3001/api/migration/status
```

### Phase 2: Data Migration

#### Step 4: Export ChromaDB Data
```bash
# Export all data from ChromaDB
npm run migration:export

# Export specific collection
npm run migration:export-collection my_collection

# Export with custom output file
node export-chromadb-data.js --output /path/to/export.json
```

This creates a JSON file in `data/processed/` containing all your ChromaDB data.

#### Step 5: Preview Import (Dry Run)
```bash
# Preview the import without actually inserting data
npm run migration:import-dry-run -- --input data/processed/chromadb_export_1234567890.json
```

#### Step 6: Import Data to MongoDB
```bash
# Import data into MongoDB
npm run migration:import -- --input data/processed/chromadb_export_1234567890.json

# Import with custom settings
node import-mongodb-data.js --input export.json --batch-size 50
```

#### Step 7: Verify Migration
```bash
# Compare vector stores
curl http://localhost:3001/api/migration/vector-stores

# Check migration status
curl http://localhost:3001/api/migration/status
```

### Phase 3: Runtime Switch

#### Step 8: Switch to MongoDB (Runtime)
```bash
# Switch primary vector store to MongoDB (temporary)
curl -X POST http://localhost:3001/api/migration/switch \
  -H "Content-Type: application/json" \
  -d '{"targetStore": "mongodb", "confirm": true}'
```

#### Step 9: Test MongoDB in Production
```bash
# Test QA functionality with MongoDB
curl -X POST http://localhost:3001/api/qa/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Test question about your documents"}'

# Verify document operations work
curl http://localhost:3001/api/documents
```

#### Step 10: Make Switch Permanent
Update your `.env` file:
```bash
VECTOR_STORE_TYPE=mongodb
```

Restart the server:
```bash
npm restart
```

### Phase 4: Cleanup and Optimization

#### Step 11: Final Verification
```bash
# Run comprehensive tests
npm run test:mongodb:verbose

# Verify all endpoints work
curl http://localhost:3001/health
```

#### Step 12: Performance Optimization
```bash
# MongoDB will automatically create indexes
# Monitor performance and adjust as needed
```

#### Step 13: Optional Cleanup
```bash
# Remove ChromaDB data if no longer needed
# Keep for rollback capability
```

## Rollback Procedure

If you need to rollback to ChromaDB:

### Emergency Rollback
```bash
# Switch back to ChromaDB
curl -X POST http://localhost:3001/api/migration/switch \
  -H "Content-Type: application/json" \
  -d '{"targetStore": "chromadb", "confirm": true}'

# Update environment
echo "VECTOR_STORE_TYPE=chromadb" > .env

# Restart server
npm restart
```

### Complete Rollback
1. Update `.env`: `VECTOR_STORE_TYPE=chromadb`
2. Restart server
3. Verify ChromaDB is working
4. Optionally clean up MongoDB data

## Troubleshooting

### Common Issues

#### 1. MongoDB Connection Failed
```bash
# Check MongoDB is running
docker ps | grep mongo
# or
brew services list | grep mongodb

# Test connection
mongosh "mongodb://localhost:27017"
```

#### 2. Import Fails
```bash
# Check export file exists and is valid
head -n 20 data/processed/chromadb_export_*.json

# Try with smaller batch size
node import-mongodb-data.js --input export.json --batch-size 10
```

#### 3. Search Not Working
```bash
# MongoDB Atlas Vector Search requires specific setup
# For local MongoDB, the system falls back to manual similarity
# This is slower but functional
```

#### 4. Memory Issues
```bash
# For large datasets, increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" npm run migration:import
```

### Performance Tuning

#### MongoDB Indexes
The system automatically creates necessary indexes:
- Document ID index
- Metadata field indexes
- Vector search index (Atlas only)

#### Batch Size Optimization
- Small datasets (< 1000 docs): batch size 100
- Medium datasets (1000-10000 docs): batch size 50
- Large datasets (> 10000 docs): batch size 25

## API Reference

### Migration Endpoints

#### GET /api/migration/status
Returns current migration status and vector store information.

#### POST /api/migration/switch
Switches primary vector store at runtime.

#### POST /api/migration/sync
Syncs data between vector stores (limited functionality).

#### GET /api/migration/vector-stores
Compares statistics between ChromaDB and MongoDB.

## Benefits of MongoDB Migration

1. **Better Scalability**: MongoDB handles larger datasets more efficiently
2. **Rich Querying**: Advanced filtering and aggregation capabilities
3. **ACID Transactions**: Better data consistency guarantees
4. **Cloud Integration**: Seamless integration with MongoDB Atlas
5. **Document Model**: More flexible data structure
6. **Enterprise Features**: Backup, monitoring, and security features

## Migration Timeline

- **Preparation**: 30 minutes - 2 hours
- **Testing**: 1-2 hours
- **Data Migration**: 30 minutes - 4 hours (depending on data size)
- **Verification**: 1-2 hours
- **Production Switch**: 15 minutes

## Support

If you encounter issues during migration:

1. Check the troubleshooting section above
2. Review server logs for detailed error messages
3. Test individual components before full migration
4. Consider running migration during low-traffic periods

The gradual migration approach ensures your system remains functional throughout the process.
