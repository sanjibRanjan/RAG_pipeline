import fetch from "node-fetch";
import fs from "fs";
import pdf from "pdf-parse";

// 🔑 Replace with your Hugging Face API key
const HF_API_KEY = "YOUR_API_KEY";

// 1. Load PDF and extract text
async function loadPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdf(dataBuffer);
  return pdfData.text;
}

// 2. Embed text using Hugging Face
async function embedText(text) {
  const response = await fetch("https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: text })
  });

  const data = await response.json();
  return data[0].embedding; // embedding vector
}

// 3. Store documents (array of objects)
let documents = [];

// 4. Add document to collection
async function addDocument(filePath) {
  const content = await loadPDF(filePath);
  const embedding = await embedText(content);
  documents.push({ content, embedding });
  console.log("✅ Document added with embedding!");
}

// 5. Cosine similarity function
function cosineSimilarity(a, b) {
  let dot = 0.0, normA = 0.0, normB = 0.0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 6. Search function
async function search(query) {
  const queryEmbedding = await embedText(query);

  // Compare query with each document
  let results = documents.map(doc => {
    return {
      content: doc.content,
      score: cosineSimilarity(queryEmbedding, doc.embedding)
    };
  });

  // Sort by highest score
  results.sort((a, b) => b.score - a.score);

  return results[0]; // best match
}

// 7. Demo
async function runDemo() {
  // Add your PDF (put sample.pdf in same folder)
  await addDocument("./Documents/sample-local pdf.pdf");

  // Ask a question
  const query = "What is the document about?";
  const result = await search(query);

  console.log("❓ Question:", query);
  console.log("📄 Best Match (score):", result.score);
  console.log("📑 Content snippet:", result.content.slice(0, 200) + "...");
}

runDemo();
