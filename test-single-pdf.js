import { DocumentProcessor } from './src/services/document-processor.js';
import { EmbeddingService } from './src/services/embedding-service.js';
import { VectorStore } from './src/services/vector-store.js';
import 'dotenv/config';

async function testSinglePDF() {
  console.log('🚀 Testing single PDF processing...');

  try {
    // Initialize services
    console.log('🔧 Initializing services...');
    const documentProcessor = new DocumentProcessor();
    const embeddingService = new EmbeddingService();
    const vectorStore = new VectorStore();

    await embeddingService.initialize();
    await vectorStore.initialize();

    // Process one PDF file
    const filePath = './uploads/upload-1757846682492-642472150.pdf';
    const fileName = 'upload-1757846682492-642472150.pdf';

    console.log(`📄 Processing: ${fileName}`);

    // Validate file
    documentProcessor.validateFile(filePath, fileName);

    // Process document
    const processedDoc = await documentProcessor.processFile(filePath, fileName);
    console.log(`✅ Document processed: ${processedDoc.documentName} v${processedDoc.version} - ${processedDoc.childChunks.length} child chunks`);

    // Generate embeddings for child chunks only
    const childChunks = processedDoc.childChunks;
    console.log(`🤖 Generating embeddings for ${childChunks.length} child chunks...`);

    const embeddings = await embeddingService.generateEmbeddings(
      childChunks.map(chunk => chunk.content)
    );

    // Prepare data for vector store
    const documents = childChunks.map(chunk => chunk.content);
    const metadatas = childChunks.map(chunk => chunk.metadata);
    const ids = childChunks.map(chunk => chunk.id);

    // Store in vector database
    await vectorStore.addDocuments(documents, embeddings, metadatas, ids);
    console.log(`✅ Successfully stored ${documents.length} chunks in vector store`);

    // Test search
    console.log('🔍 Testing search for "sexual selection"...');
    const searchResults = await vectorStore.searchDocuments('sexual selection');
    console.log(`Found ${searchResults.length} results:`);
    searchResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.documentName} - ${result.contentPreview.substring(0, 100)}...`);
    });

    // Test semantic search
    console.log('🔍 Testing semantic search...');
    const queryEmbedding = await embeddingService.generateEmbedding('sexual selection and human reproductive behaviour');
    const semanticResults = await vectorStore.search(queryEmbedding, 5);
    
    if (semanticResults.documents && semanticResults.documents[0].length > 0) {
      console.log(`Found ${semanticResults.documents[0].length} semantic results:`);
      semanticResults.documents[0].forEach((doc, index) => {
        console.log(`${index + 1}. ${doc.substring(0, 200)}...`);
      });
    } else {
      console.log('No semantic results found');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testSinglePDF();
