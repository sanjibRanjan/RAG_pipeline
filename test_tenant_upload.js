/**
 * Test script to upload a document with tenant isolation
 */

import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function testDocumentUpload() {
  console.log('🧪 Testing document upload with tenant isolation...');

  try {
    // Read the test file
    const filePath = 'sample_docs/machine-learning-intro.txt';
    const fileContent = fs.readFileSync(filePath);
    const fileName = 'machine-learning-intro.txt';

    console.log(`📄 Uploading file: ${fileName} (${fileContent.length} bytes)`);

    // Create form data
    const form = new FormData();
    form.append('document', fileContent, {
      filename: fileName,
      contentType: 'text/plain'
    });
    form.append('metadata', JSON.stringify({
      source: 'test',
      category: 'education'
    }));

    // Make the request (no auth header = anonymous)
    const response = await fetch('http://localhost:3001/api/documents/upload', {
      method: 'POST',
      body: form
    });

    const result = await response.json();
    console.log('📤 Upload response:', result);

    if (result.success) {
      console.log('✅ Document uploaded successfully!');
      console.log('📊 Document ID:', result.documentId);
      console.log('📊 Chunks processed:', result.chunksProcessed);
    } else {
      console.log('❌ Upload failed:', result.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testDocumentUpload();
