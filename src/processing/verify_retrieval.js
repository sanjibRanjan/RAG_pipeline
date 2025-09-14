import 'dotenv/config';
import { ChromaClient } from 'chromadb';
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";

const COLLECTION_NAME = process.env.CHROMA_COLLECTION_NAME || 'rag_documents';
const CHROMA_DB_URL = process.env.CHROMA_DB_URL || 'http://localhost:8000';

async function verifyRetrieval() {
    try {
        const embeddings = new HuggingFaceInferenceEmbeddings({
            model: process.env.HF_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
            apiKey: process.env.HF_API_KEY,
        });

        const chromaClient = new ChromaClient({
            host: CHROMA_DB_URL.split('://')[1].split(':')[0],
            port: parseInt(CHROMA_DB_URL.split(':')[2], 10),
        });

        const collection = await chromaClient.getOrCreateCollection({ name: COLLECTION_NAME, embeddingFunction: embeddings });

        const query = "What is the primary conclusion of the study?";
        console.log(`
Performing similarity search for query: "${query}"`);

        const queryEmbeddings = await embeddings.embedDocuments([query]);

        const results = await collection.query({
            queryTexts: [query],
            nResults: 3,
            queryEmbeddings: queryEmbeddings,
        });

        console.log("\n--- Retrieval Results ---");
        results.documents[0].forEach((doc, index) => {
            console.log(`Document ${index + 1}:`);
            console.log(`  Page Content: ${doc}`);
            console.log(`  Metadata: ${JSON.stringify(results.metadatas[0][index], null, 2)}\n`);
        });

    } catch (error) {
        console.error("Error during retrieval verification:", error);
    }
}

verifyRetrieval();
