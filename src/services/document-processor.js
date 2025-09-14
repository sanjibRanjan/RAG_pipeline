import fs from "fs";
import pdf from "pdf-parse";
import crypto from "crypto";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

export class DocumentProcessor {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || CHUNK_SIZE;
    this.chunkOverlap = options.chunkOverlap || CHUNK_OVERLAP;
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
    });
  }

  /**
   * Process a file and return chunks with metadata
   * @param {string} filePath - Path to the file
   * @param {string} originalName - Original filename
   * @param {Array} existingVersions - Existing versions for versioning
   * @param {Object} versionOptions - Version-specific options
   * @returns {Object} Processed document with chunks and metadata
   */
  async processFile(filePath, originalName, existingVersions = [], versionOptions = {}) {
    try {
      console.log(`🔄 Processing document: ${originalName}`);

      const fileStats = fs.statSync(filePath);
      const fileContent = fs.readFileSync(filePath);
      const fileHash = this.generateFileHash(fileContent);

      let text = "";

      // Extract text based on file type
      if (originalName.toLowerCase().endsWith(".pdf")) {
        text = await this.extractPdfText(filePath);
      } else if (originalName.toLowerCase().endsWith(".txt")) {
        text = await this.extractTxtText(filePath);
      } else {
        throw new Error("Unsupported file type. Only PDF and TXT files are supported.");
      }

      // Determine version number
      let currentVersion = 1;
      let versionType = 'new';

      if (existingVersions.length > 0) {
        // Check if this is a new version or update
        const latestVersion = existingVersions[existingVersions.length - 1];

        if (versionOptions.forceNewVersion) {
          currentVersion = existingVersions.length + 1;
          versionType = 'forced';
        } else if (fileStats.size !== latestVersion.fileSize ||
                   fileHash !== latestVersion.fileHash) {
          currentVersion = existingVersions.length + 1;
          versionType = 'updated';
        } else {
          // File is identical, return existing version info
          console.log(`⚠️ Document ${originalName} is identical to version ${latestVersion.version}`);
          return {
            originalName,
            text: "",
            chunks: [],
            metadata: {
              ...latestVersion,
              versionType: 'unchanged',
              processedAt: new Date().toISOString(),
            },
          };
        }
      }

      // Split text into chunks
      const chunks = await this.splitTextIntoChunks(text);

      // Extract comprehensive metadata
      const comprehensiveMetadata = await this.extractMetadata(filePath, originalName, text);

      const processedDoc = {
        originalName,
        text,
        chunks,
        metadata: {
          ...comprehensiveMetadata,
          chunkCount: chunks.length,
          version: currentVersion,
          versionType,
          previousVersions: existingVersions,
          fileHash,
          processing: {
            ...comprehensiveMetadata.processing,
            chunkCount: chunks.length,
            averageChunkSize: chunks.length > 0 ?
              chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length : 0,
            processingTime: Date.now() - new Date(comprehensiveMetadata.processedAt).getTime(),
            processor: 'DocumentProcessor v1.0'
          }
        },
      };

      console.log(`✅ Document processed: ${originalName} v${currentVersion} (${versionType}) - ${chunks.length} chunks, ${text.length} characters`);

      return processedDoc;
    } catch (error) {
      console.error("❌ Document processing failed:", error);
      throw new Error(`Document processing failed: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF file
   * @param {string} filePath - Path to PDF file
   * @returns {string} Extracted text
   */
  async extractPdfText(filePath) {
    try {
      console.log("📄 Extracting text from PDF...");
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);
      return pdfData.text;
    } catch (error) {
      throw new Error(`PDF text extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from TXT file
   * @param {string} filePath - Path to TXT file
   * @returns {string} File content
   */
  async extractTxtText(filePath) {
    try {
      console.log("📝 Reading text file...");
      return fs.readFileSync(filePath, "utf8");
    } catch (error) {
      throw new Error(`TXT file reading failed: ${error.message}`);
    }
  }

  /**
   * Split text into chunks using LangChain text splitter
   * @param {string} text - Text to split
   * @returns {Array} Array of chunk objects with content and metadata
   */
  async splitTextIntoChunks(text) {
    try {
      console.log("✂️ Splitting text into chunks...");
      const docs = await this.textSplitter.createDocuments([text]);

      return docs.map((doc, index) => ({
        content: doc.pageContent,
        metadata: {
          ...doc.metadata,
          chunkIndex: index,
          contentLength: doc.pageContent.length,
        },
      }));
    } catch (error) {
      throw new Error(`Text chunking failed: ${error.message}`);
    }
  }

  /**
   * Validate file before processing
   * @param {string} filePath - Path to file
   * @param {string} originalName - Original filename
   * @returns {boolean} True if file is valid
   */
  validateFile(filePath, originalName) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error("File does not exist");
      }

      // Check file size (max 10MB)
      const stats = fs.statSync(filePath);
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (stats.size > maxSize) {
        throw new Error("File size exceeds 10MB limit");
      }

      // Check file extension
      const allowedExtensions = [".pdf", ".txt"];
      const extension = originalName.toLowerCase().substring(originalName.lastIndexOf("."));

      if (!allowedExtensions.includes(extension)) {
        throw new Error("Unsupported file type. Only PDF and TXT files are allowed.");
      }

      return true;
    } catch (error) {
      throw new Error(`File validation failed: ${error.message}`);
    }
  }

  /**
   * Get file statistics
   * @param {string} filePath - Path to file
   * @returns {Object} File statistics
   */
  getFileStats(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return {
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        isFile: stats.isFile(),
      };
    } catch (error) {
      throw new Error(`Failed to get file stats: ${error.message}`);
    }
  }

  /**
   * Generate SHA-256 hash of file content for versioning
   * @param {Buffer} fileContent - File content buffer
   * @returns {string} SHA-256 hash
   */
  generateFileHash(fileContent) {
    try {
      return crypto.createHash('sha256').update(fileContent).digest('hex');
    } catch (error) {
      console.warn("Failed to generate file hash:", error);
      return null;
    }
  }

  /**
   * Extract comprehensive metadata from document
   * @param {string} filePath - Path to the file
   * @param {string} originalName - Original filename
   * @param {string} text - Extracted text content
   * @returns {Object} Comprehensive metadata
   */
  async extractMetadata(filePath, originalName, text) {
    try {
      const fileStats = fs.statSync(filePath);
      const fileContent = fs.readFileSync(filePath);

      const metadata = {
        // Basic file information
        fileName: originalName,
        fileSize: fileStats.size,
        fileType: originalName.split('.').pop().toLowerCase(),
        fileExtension: originalName.split('.').pop().toLowerCase(),
        fileHash: this.generateFileHash(fileContent),
        mimeType: this.detectMimeType(originalName),

        // Timestamps
        createdAt: fileStats.birthtime.toISOString(),
        modifiedAt: fileStats.mtime.toISOString(),
        processedAt: new Date().toISOString(),

        // Content information
        textLength: text.length,
        wordCount: this.countWords(text),
        sentenceCount: this.countSentences(text),
        paragraphCount: this.countParagraphs(text),

        // Document structure
        pages: this.estimatePages(text, originalName),
        readingTime: this.estimateReadingTime(text),

        // Quality metrics
        language: this.detectLanguage(text),
        complexity: this.calculateComplexity(text),

        // Custom metadata fields
        tags: [],
        categories: [],
        description: '',
        author: '',
        title: this.extractTitle(text),
        summary: this.generateSummary(text),

        // Processing metadata
        processing: {
          chunkCount: 0,
          averageChunkSize: 0,
          processingTime: 0,
          processor: 'DocumentProcessor v1.0'
        }
      };

      return metadata;
    } catch (error) {
      console.warn("Failed to extract comprehensive metadata:", error);
      return this.getBasicMetadata(filePath, originalName, text);
    }
  }

  /**
   * Get basic metadata as fallback
   * @param {string} filePath - Path to the file
   * @param {string} originalName - Original filename
   * @param {string} text - Extracted text content
   * @returns {Object} Basic metadata
   */
  getBasicMetadata(filePath, originalName, text) {
    const fileStats = fs.statSync(filePath);
    return {
      fileName: originalName,
      fileSize: fileStats.size,
      fileType: originalName.split('.').pop().toLowerCase(),
      createdAt: fileStats.birthtime.toISOString(),
      modifiedAt: fileStats.mtime.toISOString(),
      processedAt: new Date().toISOString(),
      textLength: text.length
    };
  }

  /**
   * Detect MIME type from filename
   * @param {string} filename - Filename
   * @returns {string} MIME type
   */
  detectMimeType(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'rtf': 'application/rtf',
      'html': 'text/html',
      'htm': 'text/html'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Count words in text
   * @param {string} text - Text content
   * @returns {number} Word count
   */
  countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Count sentences in text
   * @param {string} text - Text content
   * @returns {number} Sentence count
   */
  countSentences(text) {
    return text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0).length;
  }

  /**
   * Count paragraphs in text
   * @param {string} text - Text content
   * @returns {number} Paragraph count
   */
  countParagraphs(text) {
    return text.split(/\n\s*\n/).filter(paragraph => paragraph.trim().length > 0).length;
  }

  /**
   * Estimate number of pages
   * @param {string} text - Text content
   * @param {string} filename - Filename
   * @returns {number} Estimated page count
   */
  estimatePages(text, filename) {
    const extension = filename.split('.').pop().toLowerCase();

    if (extension === 'pdf') {
      // For PDFs, estimate based on content length
      // Average PDF page has about 300-500 words
      const wordsPerPage = 400;
      return Math.max(1, Math.ceil(this.countWords(text) / wordsPerPage));
    } else {
      // For text files, estimate based on characters
      // Average page has about 2000-3000 characters
      const charsPerPage = 2500;
      return Math.max(1, Math.ceil(text.length / charsPerPage));
    }
  }

  /**
   * Estimate reading time in minutes
   * @param {string} text - Text content
   * @returns {number} Reading time in minutes
   */
  estimateReadingTime(text) {
    const wordsPerMinute = 200; // Average reading speed
    const wordCount = this.countWords(text);
    return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
  }

  /**
   * Detect language (basic implementation)
   * @param {string} text - Text content
   * @returns {string} Detected language
   */
  detectLanguage(text) {
    // Simple language detection based on common words
    const englishWords = ['the', 'and', 'is', 'in', 'to', 'of', 'a', 'that', 'it', 'with'];
    const sample = text.toLowerCase().substring(0, 500);
    const englishMatches = englishWords.filter(word => sample.includes(word)).length;

    return englishMatches >= 3 ? 'en' : 'unknown';
  }

  /**
   * Calculate text complexity score
   * @param {string} text - Text content
   * @returns {number} Complexity score (0-1)
   */
  calculateComplexity(text) {
    const words = text.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    const uniqueWords = new Set(words.map(word => word.toLowerCase())).size;
    const vocabularyRichness = uniqueWords / words.length;

    // Complexity based on average word length and vocabulary richness
    const complexity = (avgWordLength / 10) * 0.6 + vocabularyRichness * 0.4;

    return Math.min(1, Math.max(0, complexity));
  }

  /**
   * Extract title from text
   * @param {string} text - Text content
   * @returns {string} Extracted title
   */
  extractTitle(text) {
    // Try to find title in first few lines
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      // Look for lines that might be titles (shorter, capitalized)
      if (line.length > 10 && line.length < 100 && line === line.toUpperCase()) {
        return line;
      }
    }

    // Fallback: use first line or filename-derived title
    return lines[0]?.substring(0, 50) || '';
  }

  /**
   * Generate text summary
   * @param {string} text - Text content
   * @returns {string} Summary
   */
  generateSummary(text) {
    // Extract first meaningful paragraph or first 200 characters
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);

    if (paragraphs.length > 0) {
      const firstParagraph = paragraphs[0].trim();
      return firstParagraph.length > 200 ?
        firstParagraph.substring(0, 200) + '...' :
        firstParagraph;
    }

    return text.substring(0, 200) + (text.length > 200 ? '...' : '');
  }

  /**
   * Compare two document versions
   * @param {Object} version1 - First version metadata
   * @param {Object} version2 - Second version metadata
   * @returns {Object} Comparison result
   */
  compareVersions(version1, version2) {
    const changes = {
      hasChanges: false,
      sizeChanged: version1.fileSize !== version2.fileSize,
      contentChanged: version1.fileHash !== version2.fileHash,
      textLengthChanged: version1.textLength !== version2.textLength,
      chunkCountChanged: version1.chunkCount !== version2.chunkCount,
      differences: []
    };

    if (changes.sizeChanged) {
      changes.differences.push(`File size: ${version1.fileSize} → ${version2.fileSize}`);
      changes.hasChanges = true;
    }

    if (changes.contentChanged) {
      changes.differences.push("File content changed");
      changes.hasChanges = true;
    }

    if (changes.textLengthChanged) {
      changes.differences.push(`Text length: ${version1.textLength} → ${version2.textLength}`);
      changes.hasChanges = true;
    }

    if (changes.chunkCountChanged) {
      changes.differences.push(`Chunk count: ${version1.chunkCount} → ${version2.chunkCount}`);
      changes.hasChanges = true;
    }

    return changes;
  }
}

export default DocumentProcessor;
