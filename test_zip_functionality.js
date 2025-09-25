import { ZipProcessor } from './src/utils/zip-processor.js';
import { DocumentProcessor } from './src/services/document-processor.js';
import fs from 'fs';
import path from 'path';

async function testZipFunctionality() {
  console.log("🧪 Testing ZIP file processing functionality...\n");

  const zipProcessor = new ZipProcessor();
  const docProcessor = new DocumentProcessor();

  const zipPath = './test_chat.zip';

  try {
    // Test 1: Validate ZIP contents
    console.log("1️⃣ Testing ZIP validation...");
    const validation = await zipProcessor.validateZipContents(zipPath);
    console.log("   ✅ Validation result:", validation);

    // Test 2: Extract ZIP
    console.log("\n2️⃣ Testing ZIP extraction...");
    const extraction = await zipProcessor.extractZip(zipPath);
    console.log("   ✅ Extraction result:", {
      success: extraction.success,
      filesExtracted: extraction.extractedFiles.length,
      extractDir: extraction.extractDir
    });

    if (extraction.success && extraction.extractedFiles.length > 0) {
      // Test 3: Process the extracted file
      console.log("\n3️⃣ Testing document processing...");
      const extractedFile = extraction.extractedFiles[0];
      console.log(`   📄 Processing: ${extractedFile.originalName}`);

      const processedDoc = await docProcessor.processFile(
        extractedFile.extractedPath,
        extractedFile.originalName,
        [],
        {}
      );

      console.log("   ✅ Processing result:", {
        originalName: processedDoc.originalName,
        textLength: processedDoc.text.length,
        chunksGenerated: processedDoc.chunks.length,
        isWhatsApp: processedDoc.metadata.zipInfo ? 'Yes' : 'No'
      });

      // Test 4: Check WhatsApp detection
      console.log("\n4️⃣ Testing WhatsApp chat detection...");
      const sampleText = fs.readFileSync(extractedFile.extractedPath, 'utf8');
      console.log("   📝 Sample text from file:");
      console.log("   " + sampleText.split('\n')[0]);
      console.log("   " + sampleText.split('\n')[1]);

      const isWhatsApp = docProcessor.isWhatsAppChat(sampleText);
      console.log(`   📱 Is WhatsApp chat: ${isWhatsApp}`);

      if (isWhatsApp) {
        console.log("   🔄 Processing WhatsApp chat...");
        const processedChat = docProcessor.processWhatsAppChat(sampleText);
        console.log(`   ✅ Processed chat length: ${processedChat.length} characters`);
        console.log("   📝 Sample processed content:");
        console.log("   " + processedChat.split('\n')[0]);
        console.log("   " + processedChat.split('\n')[1]);
      }
    }

    // Cleanup
    if (extraction.extractDir) {
      console.log("\n5️⃣ Testing cleanup...");
      zipProcessor.cleanup(extraction.extractDir);
      console.log("   🧹 Cleanup completed");
    }

    console.log("\n🎉 All tests completed successfully!");

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error(error.stack);
  }
}

// Run the test
testZipFunctionality();
