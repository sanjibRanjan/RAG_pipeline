import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';

// Extract text from PDF using pdf-parse library
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    console.error(`Error reading PDF: ${error.message}`);
    return '';
  }
}

// Search for text in extracted PDF content
function searchPDFForText(text, searchTerm) {
  try {
    // Convert to lowercase for case-insensitive search
    const lowerText = text.toLowerCase();
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // Look for the search term
    const index = lowerText.indexOf(lowerSearchTerm);
    
    if (index !== -1) {
      // Extract context around the match
      const start = Math.max(0, index - 200);
      const end = Math.min(text.length, index + 200);
      const context = text.substring(start, end);
      
      return {
        found: true,
        position: index,
        context: context.replace(/\s+/g, ' ').trim()
      };
    }
    
    return { found: false };
  } catch (error) {
    console.error(`Error searching PDF: ${error.message}`);
    return { found: false, error: error.message };
  }
}

async function checkPDFContent(filePath) {
  console.log(`🔍 Checking PDF content: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return;
  }
  
  const fileName = path.basename(filePath);
  console.log(`📄 File: ${fileName}`);
  
  // Extract text from PDF
  console.log(`📖 Extracting text from PDF...`);
  const text = await extractTextFromPDF(filePath);
  
  if (!text || text.trim().length === 0) {
    console.log(`❌ No text extracted from ${fileName}`);
    return { found: false };
  }
  
  console.log(`📊 Extracted ${text.length} characters of text`);
  
  // Search for "Sexual Selection" and related terms
  const searchTerms = [
    'sexual selection',
    'reproductive behaviour',
    'reproductive behavior',
    'human reproduction',
    'mate selection',
    'sexual dimorphism'
  ];
  
  console.log(`🔎 Searching for relevant terms...`);
  
  for (const term of searchTerms) {
    const result = searchPDFForText(text, term);
    
    if (result.found) {
      console.log(`✅ FOUND: "${term}"`);
      console.log(`📍 Context: ${result.context}`);
      console.log(`📊 Position: ${result.position}`);
      return { found: true, term, context: result.context, fileName };
    } else {
      console.log(`❌ Not found: "${term}"`);
    }
  }
  
  console.log(`❌ No relevant terms found in ${fileName}`);
  return { found: false };
}

// Main execution
async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.log('Usage: node check_pdf_content.js <path-to-pdf>');
    console.log('Example: node check_pdf_content.js uploads/upload-1757846682492-642472150.pdf');
    process.exit(1);
  }
  
  const result = await checkPDFContent(filePath);
  
  if (result.found) {
    console.log(`\n🎉 SUCCESS: Found relevant content in ${path.basename(filePath)}`);
    console.log(`📝 Term found: "${result.term}"`);
    console.log(`💡 This PDF should be processed for the RAG system`);
  } else {
    console.log(`\n😞 No relevant content found in ${path.basename(filePath)}`);
    console.log(`💡 Try checking other PDFs in the uploads directory`);
  }
}

main().catch(console.error);
