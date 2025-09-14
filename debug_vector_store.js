import { ChromaClient } from 'chromadb';
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import 'dotenv/config';

async function debugVectorStore() {
  try {
    console.log('🔍 Debugging Vector Store...');

    // Initialize ChromaDB client
    const chromaUrl = process.env.CHROMA_DB_URL || "http://localhost:8000";
    const collectionName = process.env.CHROMA_COLLECTION_NAME || "rag_documents";

    console.log(`Connecting to ChromaDB at: ${chromaUrl}`);

    const url = new URL(chromaUrl);
    const host = url.hostname;
    const port = parseInt(url.port) || 8000;

    const client = new ChromaClient({ host, port });

    // Get collection
    const collection = await client.getOrCreateCollection({
      name: collectionName,
    });

    console.log('✅ Connected to collection');

    // Check collection count
    const count = await collection.count();
    console.log(`📊 Collection has ${count} documents`);

    if (count > 0) {
      // Get some documents
      const docs = await collection.get({ limit: 5 });
      console.log('📄 Sample documents:');
      console.log(JSON.stringify(docs, null, 2));

      // Test search
      console.log('\n🔍 Testing search...');

      const embeddings = new HuggingFaceInferenceEmbeddings({
        model: process.env.HF_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
        apiKey: process.env.HF_API_KEY,
      });

      const testEmbedding = await embeddings.embedQuery("machine learning");
      console.log(`🤖 Generated embedding with ${testEmbedding.length} dimensions`);

      const results = await collection.query({
        queryEmbeddings: [testEmbedding],
        nResults: 3,
      });

      console.log('🔍 Search results:');
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log('⚠️ No documents found in collection');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error(error.stack);
  }
}

debugVectorStore();
