import { DocumentProcessor } from '../services/document-processor.js';
import { EmbeddingService } from '../services/embedding-service.js';
import { VectorStore } from '../services/vector-store.js';
import 'dotenv/config';
import { readdir } from 'fs/promises';
import path from 'path';

const DATA_DIR = './uploads';
const COLLECTION_NAME = process.env.CHROMA_COLLECTION_NAME || 'rag_documents';

async function runIngestion() {
  console.log('🚀 Starting data ingestion process...');

  try {
    // Initialize services
    console.log('🔧 Initializing services...');
    const documentProcessor = new DocumentProcessor();
    const embeddingService = new EmbeddingService();
    const vectorStore = new VectorStore();

    await embeddingService.initialize();
    await vectorStore.initialize();

    // Get files from data directory
    let files;
    try {
      files = await readdir(DATA_DIR);
      console.log(`📂 Found ${files.length} files in ${DATA_DIR}`);
    } catch (error) {
      console.error(`❌ Error reading directory ${DATA_DIR}:`, error);
      return;
    }

    if (files.length === 0) {
      console.log('⚠️ No files found in data directory. Exiting.');
      return;
    }

    // Process each file
    const processedDocuments = [];
    let totalChunks = 0;

    for (const file of files) {
      const filePath = path.join(DATA_DIR, file);

      try {
        console.log(`\n📄 Processing: ${file}`);

        // Validate file
        documentProcessor.validateFile(filePath, file);

        // Process document
        const processedDoc = await documentProcessor.processFile(filePath, file);
        processedDocuments.push(processedDoc);
        totalChunks += processedDoc.chunks.length;

        console.log(`✅ ${file}: ${processedDoc.chunks.length} chunks created`);
      } catch (error) {
        console.error(`❌ Failed to process ${file}:`, error.message);
        continue; // Continue with other files
      }
    }

    console.log(`\n📊 Processing Summary:`);
    console.log(`   • Documents processed: ${processedDocuments.length}`);
    console.log(`   • Total chunks: ${totalChunks}`);

    if (processedDocuments.length === 0) {
      console.log('⚠️ No documents were successfully processed. Exiting.');
      return;
    }

    // Generate embeddings and store in vector database
    console.log('\n🤖 Generating embeddings and storing in vector database...');

    for (const doc of processedDocuments) {
      try {
        console.log(`🔄 Processing embeddings for: ${doc.originalName}`);

        // Generate embeddings for chunks
        const texts = doc.chunks.map(chunk => chunk.content);
        const embeddings = await embeddingService.generateEmbeddings(texts);

        // Generate unique IDs for this document
        const baseId = `doc_${Date.now()}_${doc.originalName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const ids = doc.chunks.map((_, index) => `${baseId}_chunk_${index}`);

        // Prepare metadata
        const metadatas = doc.chunks.map((chunk, index) => ({
          ...chunk.metadata,
          documentName: doc.originalName,
          chunkIndex: index,
          totalChunks: doc.chunks.length,
          version: doc.metadata.version,
          uploadedAt: doc.metadata.processedAt,
          fileSize: doc.metadata.fileSize,
          fileType: doc.metadata.fileType,
          textLength: doc.metadata.textLength,
        }));

        // Store in vector database
        await vectorStore.addDocuments(texts, embeddings, metadatas, ids);

        console.log(`✅ Stored ${doc.chunks.length} chunks for ${doc.originalName}`);
      } catch (error) {
        console.error(`❌ Failed to store ${doc.originalName}:`, error.message);
        continue;
      }
    }

    console.log('\n🎉 Data ingestion completed successfully!');
    console.log(`📈 Final Summary:`);
    console.log(`   • Documents processed: ${processedDocuments.length}`);
    console.log(`   • Total chunks stored: ${totalChunks}`);
    console.log(`   • Vector database: ${COLLECTION_NAME}`);

  } catch (error) {
    console.error('💥 Fatal error during ingestion process:', error);
    throw error;
  }
}

(async () => {
  try {
    await runIngestion();
  } catch (err) {
    console.error('Error during ingestion process:', err);
    process.exit(1);
  }
})();
