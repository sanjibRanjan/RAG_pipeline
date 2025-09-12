import { Chroma } from '@langchain/community/vectorstores/chroma';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { HuggingFaceInferenceEmbeddings } from '@langchain/community/embeddings/hf';
import { ChromaClient } from 'chromadb'; // Import ChromaClient

import 'dotenv/config';
import { readdir } from 'fs/promises';

const DATA_DIR = './data/docs';
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const COLLECTION_NAME = process.env.CHROMA_COLLECTION_NAME || 'rag_documents';
const CHROMA_DB_URL = process.env.CHROMA_DB_URL || 'http://localhost:8000';

async function runIngestion() {
  console.log('Starting data ingestion...');

  const allChunks = [];
  let files;
  try {
    files = await readdir(DATA_DIR);
    console.log(`Found ${files.length} files in ${DATA_DIR}`);
  } catch (error) {
    console.error(`Error reading directory ${DATA_DIR}:`, error);
    return;
  }

  for (const file of files) {
    const filePath = `${DATA_DIR}/${file}`;
    let loader;

    if (file.endsWith('.pdf')) {
      loader = new PDFLoader(filePath);
    } else if (file.endsWith('.txt')) {
      loader = new TextLoader(filePath);
    } else {
      console.warn(`Skipping unsupported file type: ${file}`);
      continue;
    }

    const docs = await loader.load();

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });

    const fileChunks = await splitter.splitDocuments(docs);
    allChunks.push(...fileChunks);
  }

  console.log(`Total chunks created: ${allChunks.length}`);

  if (allChunks.length === 0) {
    console.log('No documents to process. Exiting.');
    return;
  }

  // Cleanse metadata to ensure all values are string, number, boolean, or null
  allChunks.forEach(chunk => {
    if (chunk.metadata) {
      for (const key in chunk.metadata) {
        const val = chunk.metadata[key];
        if (!['string', 'number', 'boolean'].includes(typeof val) && val !== null) {
          chunk.metadata[key] = String(val); // Convert invalid metadata to string
        }
      }
    }
  });

  if (!process.env.HF_API_KEY) {
    throw new Error('HF_API_KEY is required for Hugging Face embeddings');
  }

  const embeddingsGenerator = new HuggingFaceInferenceEmbeddings({
    model: process.env.HF_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
    apiKey: process.env.HF_API_KEY,
  });

  console.log('Initializing ChromaDB with server connection...');

  try {
    const chromaClient = new ChromaClient({
      host: CHROMA_DB_URL.split('://')[1].split(':')[0],
      port: parseInt(CHROMA_DB_URL.split(':')[2], 10),
    });

    const collection = await chromaClient.getOrCreateCollection({
      name: COLLECTION_NAME,
      embeddingFunction: embeddingsGenerator, // Pass embeddingsGenerator directly
    });

    // Generate embeddings for all chunks
    const texts = allChunks.map(chunk => chunk.pageContent);
    const embeddings = await embeddingsGenerator.embedDocuments(texts);

    // Prepare metadatas and ids
    const metadatas = allChunks.map(chunk => chunk.metadata);
    const ids = allChunks.map((_, i) => `doc-${i}`); // Simple ID generation

    await collection.add({
      ids: ids,
      embeddings: embeddings,
      metadatas: metadatas,
      documents: texts,
    });

    console.log('Data ingestion complete!');
  } catch (error) {
    console.error('Error during ChromaDB initialization or document addition:', error);
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
