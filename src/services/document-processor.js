import fs from "fs";
import pdf from "pdf-parse";
import crypto from "crypto";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import AdmZip from "adm-zip";

// Phase 1: Hierarchical chunking configuration
const CHILD_CHUNK_SIZE = 256;
const CHILD_CHUNK_OVERLAP = 32;
const PARENT_CHUNK_SIZE = 1024;
const PARENT_CHUNK_OVERLAP = 128;

// Legacy configuration (kept for backward compatibility)
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

// Advanced chunking configuration
const ADVANCED_CHUNK_CONFIG = {
  // Sliding window sizes for different content types
  small: { size: 512, overlap: 128 },      // Code, definitions
  medium: { size: 1024, overlap: 256 },    // Normal paragraphs
  large: { size: 2048, overlap: 512 },     // Complex topics, tables

  // Semantic boundaries
  sectionMarkers: ['##', '###', '####', 'Chapter', 'Section', 'Part'],
  listMarkers: ['•', '-', '*', '1.', '2.', '3.'],
  codeMarkers: ['```', 'function', 'class', 'def ', 'const ', 'let '],

  // Content type detection
  contentTypes: {
    code: ['function', 'class', 'import', 'export', 'const', 'let', 'var'],
    list: ['•', '-', '*', /^\d+\./],
    heading: ['#', 'Chapter', 'Section', 'Part', 'Title:'],
    table: ['|', '---', 'Column'],
  }
};

export class DocumentProcessor {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || CHUNK_SIZE;
    this.chunkOverlap = options.chunkOverlap || CHUNK_OVERLAP;
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
    });
    
    // Phase 1: Hierarchical chunking splitters
    this.childSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHILD_CHUNK_SIZE,
      chunkOverlap: CHILD_CHUNK_OVERLAP,
    });
    
    this.parentSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: PARENT_CHUNK_SIZE,
      chunkOverlap: PARENT_CHUNK_OVERLAP,
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
      } else if (originalName.toLowerCase().endsWith(".zip")) {
        text = await this.extractZipText(filePath);
      } else {
        throw new Error("Unsupported file type. Only PDF, TXT, and ZIP files are supported.");
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

      // Phase 1: Generate hierarchical chunks (child and parent)
      const hierarchicalChunks = await this.generateHierarchicalChunks(text);
      const chunks = hierarchicalChunks.childChunks; // Use child chunks for backward compatibility

      // Extract comprehensive metadata
      const comprehensiveMetadata = await this.extractMetadata(filePath, originalName, text);

      const processedDoc = {
        originalName,
        text,
        chunks,
        metadata: {
          ...comprehensiveMetadata,
          chunkCount: chunks.length,
          parentChunkCount: hierarchicalChunks.parentChunks.length,
          version: currentVersion,
          versionType,
          previousVersions: existingVersions,
          fileHash,
          processing: {
            ...comprehensiveMetadata.processing,
            chunkCount: chunks.length,
            parentChunkCount: hierarchicalChunks.parentChunks.length,
            averageChunkSize: chunks.length > 0 ?
              chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length : 0,
            averageParentChunkSize: hierarchicalChunks.parentChunks.length > 0 ?
              hierarchicalChunks.parentChunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / hierarchicalChunks.parentChunks.length : 0,
            processingTime: Date.now() - new Date(comprehensiveMetadata.processedAt).getTime(),
            processor: 'DocumentProcessor v2.0 (Hierarchical)'
          }
        },
        // Phase 1: Include parent chunks in response
        parentChunks: hierarchicalChunks.parentChunks,
      };

      console.log(`✅ Document processed: ${originalName} v${currentVersion} (${versionType}) - ${chunks.length} child chunks, ${hierarchicalChunks.parentChunks.length} parent chunks, ${text.length} characters`);

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
   * Extract text from ZIP files (processes all PDF/TXT files inside)
   * @param {string} filePath - Path to the ZIP file
   * @returns {string} Combined text from all processable files in the ZIP
   */
  async extractZipText(filePath) {
    try {
      console.log("📦 Extracting ZIP file...");
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();
      let combinedText = "";

      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;

        const fileName = entry.entryName.toLowerCase();

        // Only process PDF and TXT files within the ZIP
        if (fileName.endsWith('.pdf') || fileName.endsWith('.txt')) {
          console.log(`📄 Processing ${entry.entryName} from ZIP...`);

          try {
            const fileContent = entry.getData();

            if (fileName.endsWith('.pdf')) {
              // For PDF files, save temporarily and process
              const tempPath = `/tmp/${Date.now()}-${entry.entryName}`;
              fs.writeFileSync(tempPath, fileContent);
              const pdfText = await this.extractPdfText(tempPath);
              combinedText += `\n\n--- ${entry.entryName} ---\n\n${pdfText}`;
              fs.unlinkSync(tempPath); // Clean up temp file
            } else if (fileName.endsWith('.txt')) {
              // For TXT files, just decode the content
              const textContent = fileContent.toString('utf8');
              combinedText += `\n\n--- ${entry.entryName} ---\n\n${textContent}`;
            }
          } catch (fileError) {
            console.warn(`⚠️ Failed to process ${entry.entryName} from ZIP: ${fileError.message}`);
          }
        }
      }

      if (combinedText.trim().length === 0) {
        throw new Error("No processable files (PDF/TXT) found in ZIP archive");
      }

      console.log(`✅ Extracted text from ${combinedText.split('---').length - 1} files in ZIP`);
      return combinedText;
    } catch (error) {
      throw new Error(`ZIP file extraction failed: ${error.message}`);
    }
  }

  /**
   * Phase 1: Generate hierarchical chunks (child and parent)
   * @param {string} text - Text to split
   * @returns {Object} Object containing childChunks and parentChunks arrays
   */
  async generateHierarchicalChunks(text) {
    try {
      console.log("🔧 Generating hierarchical chunks (child + parent)...");
      
      // Generate parent chunks first
      const parentChunks = await this.generateParentChunks(text);
      
      // Generate child chunks with parent_id references
      const childChunks = await this.generateChildChunks(text, parentChunks);
      
      // Phase 3: Add linked list functionality to chunks
      console.log("🔗 Adding linked list metadata to chunks...");
      const linkedChildChunks = this.addChunkLinking(childChunks);
      const linkedParentChunks = this.addChunkLinking(parentChunks);
      
      console.log(`📋 Hierarchical chunking complete: ${linkedChildChunks.length} child chunks, ${linkedParentChunks.length} parent chunks (with linked list metadata)`);
      
      return {
        childChunks: linkedChildChunks,
        parentChunks: linkedParentChunks
      };
    } catch (error) {
      console.warn("Hierarchical chunking failed, falling back to basic chunking:", error.message);
      // Fallback to basic chunking
      const basicChunks = await this.basicChunking(text);
      const linkedBasicChunks = this.addChunkLinking(basicChunks);
      return {
        childChunks: linkedBasicChunks,
        parentChunks: []
      };
    }
  }

  /**
   * Generate parent chunks (1024 chars, 128 overlap)
   * @param {string} text - Text to split
   * @returns {Array} Array of parent chunk objects
   */
  async generateParentChunks(text) {
    try {
      const docs = await this.parentSplitter.createDocuments([text]);
      return docs.map((doc, index) => ({
        id: `parent_${Date.now()}_${index}`,
        content: doc.pageContent,
        metadata: {
          ...doc.metadata,
          chunkIndex: index,
          contentLength: doc.pageContent.length,
          chunkingStrategy: 'parent_hierarchical',
          chunkType: 'parent',
          contentType: this.detectContentType(doc.pageContent),
          windowSize: PARENT_CHUNK_SIZE,
          windowOverlap: PARENT_CHUNK_OVERLAP,
          // Phase 3: Prepare for linked list (will be enhanced by addChunkLinking)
          linked_list_ready: true,
        },
      }));
    } catch (error) {
      throw new Error(`Parent chunk generation failed: ${error.message}`);
    }
  }

  /**
   * Generate child chunks (256 chars, 32 overlap) with parent_id references
   * @param {string} text - Text to split
   * @param {Array} parentChunks - Array of parent chunks
   * @returns {Array} Array of child chunk objects with parent_id metadata
   */
  async generateChildChunks(text, parentChunks) {
    try {
      const docs = await this.childSplitter.createDocuments([text]);
      
      return docs.map((doc, index) => {
        // Find the parent chunk that contains this child chunk
        const parentId = this.findParentChunkForChild(doc.pageContent, parentChunks);
        
        return {
          id: `child_${Date.now()}_${index}`,
          content: doc.pageContent,
          metadata: {
            ...doc.metadata,
            chunkIndex: index,
            contentLength: doc.pageContent.length,
            chunkingStrategy: 'child_hierarchical',
            chunkType: 'child',
            contentType: this.detectContentType(doc.pageContent),
            windowSize: CHILD_CHUNK_SIZE,
            windowOverlap: CHILD_CHUNK_OVERLAP,
            parent_id: parentId, // Link to parent chunk
            // Phase 3: Prepare for linked list (will be enhanced by addChunkLinking)
            linked_list_ready: true,
          },
        };
      });
    } catch (error) {
      throw new Error(`Child chunk generation failed: ${error.message}`);
    }
  }

  /**
   * Find the parent chunk that best contains a child chunk
   * @param {string} childContent - Child chunk content
   * @param {Array} parentChunks - Array of parent chunks
   * @returns {string} Parent chunk ID
   */
  findParentChunkForChild(childContent, parentChunks) {
    // Simple strategy: find parent chunk with highest content overlap
    let bestParent = parentChunks[0];
    let maxOverlap = 0;
    
    for (const parent of parentChunks) {
      const overlap = this.calculateContentOverlap(childContent, parent.content);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestParent = parent;
      }
    }
    
    return bestParent.id;
  }

  /**
   * Calculate content overlap between child and parent chunks
   * @param {string} childContent - Child chunk content
   * @param {string} parentContent - Parent chunk content
   * @returns {number} Overlap score
   */
  calculateContentOverlap(childContent, parentContent) {
    // Simple word-based overlap calculation
    const childWords = new Set(childContent.toLowerCase().split(/\s+/));
    const parentWords = new Set(parentContent.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...childWords].filter(word => parentWords.has(word)));
    return intersection.size / childWords.size;
  }

  /**
   * Phase 3: Add linked list functionality to chunks
   * Adds previous_chunk_id and next_chunk_id to each chunk's metadata
   * @param {Array} chunks - Array of chunk objects
   * @returns {Array} Array of chunks with linked list metadata
   */
  addChunkLinking(chunks) {
    if (!chunks || chunks.length === 0) {
      return chunks;
    }

    console.log(`🔗 Adding linked list metadata to ${chunks.length} chunks...`);

    return chunks.map((chunk, index) => {
      const enhancedChunk = {
        ...chunk,
        metadata: {
          ...chunk.metadata,
          // Add linked list metadata
          previous_chunk_id: index > 0 ? chunks[index - 1].id || `chunk_${index - 1}` : null,
          next_chunk_id: index < chunks.length - 1 ? chunks[index + 1].id || `chunk_${index + 1}` : null,
          // Add position information
          position_in_document: index,
          total_chunks_in_document: chunks.length,
          is_first_chunk: index === 0,
          is_last_chunk: index === chunks.length - 1,
          // Add linking metadata
          linked_list_enabled: true,
          linking_strategy: 'sequential'
        }
      };

      // Ensure chunk has an ID for linking
      if (!enhancedChunk.id) {
        enhancedChunk.id = `chunk_${Date.now()}_${index}`;
      }

      return enhancedChunk;
    });
  }

  /**
   * Split text into chunks using advanced chunking strategies
   * @param {string} text - Text to split
   * @returns {Array} Array of chunk objects with enhanced metadata
   */
  async splitTextIntoChunks(text) {
    try {
      console.log("🔧 Applying advanced chunking strategies...");

      // First, try semantic chunking (preserves document structure)
      const semanticChunks = await this.semanticChunking(text);

      if (semanticChunks && semanticChunks.length > 0) {
        console.log(`📋 Semantic chunking successful: ${semanticChunks.length} chunks`);
        return semanticChunks;
      }

      // Fallback to sliding window chunking
      console.log("🔄 Falling back to sliding window chunking...");
      const slidingChunks = await this.slidingWindowChunking(text);

      // Final fallback to basic LangChain splitter
      if (!slidingChunks || slidingChunks.length === 0) {
        console.log("🔄 Final fallback to basic chunking...");
        return this.basicChunking(text);
      }

      return slidingChunks;
    } catch (error) {
      console.warn("Advanced chunking failed, using basic chunking:", error.message);
      return this.basicChunking(text);
    }
  }

  /**
   * Basic chunking as fallback using LangChain text splitter
   * @param {string} text - Text to split
   * @returns {Array} Array of chunk objects
   */
  async basicChunking(text) {
    try {
      const docs = await this.textSplitter.createDocuments([text]);
      return docs.map((doc, index) => ({
        id: `basic_${Date.now()}_${index}`,
        content: doc.pageContent,
        metadata: {
          ...doc.metadata,
          chunkIndex: index,
          contentLength: doc.pageContent.length,
          chunkingStrategy: 'basic',
          contentType: this.detectContentType(doc.pageContent),
          // Phase 3: Prepare for linked list (will be enhanced by addChunkLinking)
          linked_list_ready: true,
        },
      }));
    } catch (error) {
      throw new Error(`Basic text chunking failed: ${error.message}`);
    }
  }

  /**
   * Advanced semantic chunking that preserves document structure
   * @param {string} text - Text to split
   * @returns {Array} Array of semantically meaningful chunks
   */
  async semanticChunking(text) {
    try {
      const chunks = [];
      const sections = this.splitBySemanticBoundaries(text);

      let chunkIndex = 0;

      for (const section of sections) {
        // Determine appropriate chunk size based on content type
        const contentType = this.detectContentType(section.content);
        const config = this.getChunkConfigForContentType(contentType);

        // Split section into appropriately sized chunks
        const sectionChunks = await this.chunkBySlidingWindow(section.content, config, chunkIndex);

        sectionChunks.forEach((chunk, idx) => {
          chunks.push({
            content: chunk.content,
            metadata: {
              ...chunk.metadata,
              sectionType: section.type,
              sectionLevel: section.level,
              parentSection: section.title,
              contentType,
              semanticMarkers: section.markers,
              chunkIndex: chunkIndex++,
            },
          });
        });
      }

      return chunks;
    } catch (error) {
      console.warn("Semantic chunking failed:", error.message);
      return null;
    }
  }

  /**
   * Split text by semantic boundaries (sections, headings, etc.)
   * @param {string} text - Text to split
   * @returns {Array} Array of section objects
   */
  splitBySemanticBoundaries(text) {
    const sections = [];
    const lines = text.split('\n');

    let currentSection = {
      title: 'Main Content',
      content: '',
      type: 'body',
      level: 0,
      markers: []
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for section markers
      const sectionMarker = this.detectSectionMarker(trimmed);
      if (sectionMarker) {
        // Save previous section
        if (currentSection.content.trim()) {
          sections.push(currentSection);
        }

        // Start new section
        currentSection = {
          title: trimmed,
          content: '',
          type: sectionMarker.type,
          level: sectionMarker.level,
          markers: sectionMarker.markers
        };
      } else {
        currentSection.content += line + '\n';
      }
    }

    // Add final section
    if (currentSection.content.trim()) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Detect section markers and their types
   * @param {string} line - Line to check
   * @returns {Object|null} Section marker info or null
   */
  detectSectionMarker(line) {
    // Heading markers
    if (line.startsWith('# ')) return { type: 'heading', level: 1, markers: ['h1'] };
    if (line.startsWith('## ')) return { type: 'heading', level: 2, markers: ['h2'] };
    if (line.startsWith('### ')) return { type: 'heading', level: 3, markers: ['h3'] };

    // Chapter/Section markers
    if (line.toLowerCase().includes('chapter')) return { type: 'chapter', level: 1, markers: ['chapter'] };
    if (line.toLowerCase().includes('section')) return { type: 'section', level: 2, markers: ['section'] };

    // List markers (for list sections)
    if (ADVANCED_CHUNK_CONFIG.listMarkers.some(marker => line.startsWith(marker))) {
      return { type: 'list', level: 3, markers: ['list'] };
    }

    return null;
  }

  /**
   * Sliding window chunking with adaptive sizing
   * @param {string} text - Text to split
   * @returns {Array} Array of chunks
   */
  async slidingWindowChunking(text) {
    try {
      const config = this.getAdaptiveChunkConfig(text);
      return await this.chunkBySlidingWindow(text, config, 0);
    } catch (error) {
      console.warn("Sliding window chunking failed:", error.message);
      return null;
    }
  }

  /**
   * Chunk text using sliding window approach
   * @param {string} text - Text to chunk
   * @param {Object} config - Chunk configuration
   * @param {number} startIndex - Starting chunk index
   * @returns {Array} Array of chunk objects
   */
  async chunkBySlidingWindow(text, config, startIndex = 0) {
    const chunks = [];
    const { size, overlap } = config;

    // Ensure minimum chunk size
    if (text.length <= size) {
      return [{
        content: text,
        metadata: {
          chunkIndex: startIndex,
          contentLength: text.length,
          chunkingStrategy: 'sliding_window',
          contentType: this.detectContentType(text),
          windowSize: size,
          windowOverlap: overlap,
        },
      }];
    }

    let position = 0;
    let chunkIndex = startIndex;

    while (position < text.length) {
      const endPosition = Math.min(position + size, text.length);
      let chunkContent = text.substring(position, endPosition);

      // Try to end chunk at sentence boundary if possible
      if (endPosition < text.length) {
        const sentenceBoundary = this.findSentenceBoundary(chunkContent, text, endPosition);
        if (sentenceBoundary > position + size * 0.7) { // Only if we're not losing too much content
          chunkContent = text.substring(position, sentenceBoundary);
        }
      }

      chunks.push({
        content: chunkContent,
        metadata: {
          chunkIndex: chunkIndex++,
          contentLength: chunkContent.length,
          chunkingStrategy: 'sliding_window',
          contentType: this.detectContentType(chunkContent),
          windowSize: size,
          windowOverlap: overlap,
          startPosition: position,
          endPosition: position + chunkContent.length,
        },
      });

      // Move position with overlap
      position += size - overlap;

      // Prevent infinite loop
      if (position >= text.length || chunks.length > 1000) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Find sentence boundary near given position
   * @param {string} chunkContent - Current chunk content
   * @param {string} fullText - Full text
   * @param {number} targetEnd - Target end position
   * @returns {number} Sentence boundary position
   */
  findSentenceBoundary(chunkContent, fullText, targetEnd) {
    const sentenceEndings = ['. ', '! ', '? ', '\n\n'];
    let bestBoundary = targetEnd;

    for (const ending of sentenceEndings) {
      const boundaryIndex = chunkContent.lastIndexOf(ending);
      if (boundaryIndex !== -1) {
        const absolutePosition = targetEnd - (chunkContent.length - boundaryIndex - ending.length);
        if (Math.abs(absolutePosition - targetEnd) < Math.abs(bestBoundary - targetEnd)) {
          bestBoundary = absolutePosition;
        }
      }
    }

    return bestBoundary;
  }

  /**
   * Get adaptive chunk configuration based on text characteristics
   * @param {string} text - Text to analyze
   * @returns {Object} Chunk configuration
   */
  getAdaptiveChunkConfig(text) {
    const wordCount = this.countWords(text);
    const avgWordLength = text.length / wordCount;

    // Code-like content (short words, special characters)
    if (avgWordLength < 5 && (text.includes('{') || text.includes('function') || text.includes('import'))) {
      return ADVANCED_CHUNK_CONFIG.small;
    }

    // Complex content (long words, technical terms)
    if (avgWordLength > 6 || wordCount > 1000) {
      return ADVANCED_CHUNK_CONFIG.large;
    }

    // Normal content
    return ADVANCED_CHUNK_CONFIG.medium;
  }

  /**
   * Get chunk configuration for specific content type
   * @param {string} contentType - Content type
   * @returns {Object} Chunk configuration
   */
  getChunkConfigForContentType(contentType) {
    switch (contentType) {
      case 'code':
        return ADVANCED_CHUNK_CONFIG.small;
      case 'table':
        return ADVANCED_CHUNK_CONFIG.large;
      case 'heading':
        return ADVANCED_CHUNK_CONFIG.small;
      default:
        return ADVANCED_CHUNK_CONFIG.medium;
    }
  }

  /**
   * Detect content type of text
   * @param {string} text - Text to analyze
   * @returns {string} Content type
   */
  detectContentType(text) {
    const sample = text.substring(0, 200).toLowerCase();

    // Check for code patterns
    if (ADVANCED_CHUNK_CONFIG.contentTypes.code.some(pattern => sample.includes(pattern.toLowerCase()))) {
      return 'code';
    }

    // Check for table patterns
    if (ADVANCED_CHUNK_CONFIG.contentTypes.table.some(pattern => sample.includes(pattern))) {
      return 'table';
    }

    // Check for heading patterns
    if (ADVANCED_CHUNK_CONFIG.contentTypes.heading.some(pattern => sample.includes(pattern))) {
      return 'heading';
    }

    // Check for list patterns
    if (ADVANCED_CHUNK_CONFIG.contentTypes.list.some(pattern => {
      if (typeof pattern === 'string') {
        return sample.includes(pattern);
      }
      return pattern.test(sample);
    })) {
      return 'list';
    }

    return 'text';
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
      const allowedExtensions = [".pdf", ".txt", ".zip"];
      const extension = originalName.toLowerCase().substring(originalName.lastIndexOf("."));

      if (!allowedExtensions.includes(extension)) {
        throw new Error("Unsupported file type. Only PDF, TXT, and ZIP files are allowed.");
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

        // Enhanced metadata fields for better RAG performance
        tags: this.extractTags(text),
        categories: this.extractCategories(text),
        keywords: this.extractKeywords(text),
        semanticSummary: this.generateSemanticSummary(text),
        description: this.generateDescription(text),
        author: this.extractAuthor(text),
        title: this.extractTitle(text),
        summary: this.generateSummary(text),

        // Advanced content analysis
        topics: this.extractTopics(text),
        entities: this.extractEntities(text),
        keyPhrases: this.extractKeyPhrases(text),
        readabilityScore: this.calculateReadabilityScore(text),
        technicalLevel: this.assessTechnicalLevel(text),

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
   * Extract tags from document content
   * @param {string} text - Document text
   * @returns {Array} Array of tags
   */
  extractTags(text) {
    const tags = [];
    const sample = text.toLowerCase().substring(0, 1000);

    // Common technical tags
    const tagPatterns = {
      'tutorial': ['tutorial', 'guide', 'how to', 'step by step'],
      'api': ['api', 'endpoint', 'rest', 'graphql'],
      'database': ['database', 'sql', 'mongodb', 'postgresql'],
      'framework': ['react', 'angular', 'vue', 'django', 'flask'],
      'programming': ['javascript', 'python', 'java', 'typescript', 'node.js'],
      'documentation': ['docs', 'documentation', 'reference', 'manual'],
      'security': ['security', 'authentication', 'authorization', 'encryption'],
      'performance': ['performance', 'optimization', 'speed', 'efficiency'],
      'testing': ['test', 'testing', 'unit test', 'integration test'],
      'deployment': ['deployment', 'docker', 'kubernetes', 'ci/cd']
    };

    Object.entries(tagPatterns).forEach(([tag, patterns]) => {
      if (patterns.some(pattern => sample.includes(pattern))) {
        tags.push(tag);
      }
    });

    return tags.slice(0, 5); // Limit to 5 most relevant tags
  }

  /**
   * Extract categories from document content
   * @param {string} text - Document text
   * @returns {Array} Array of categories
   */
  extractCategories(text) {
    const categories = [];
    const sample = text.toLowerCase();

    const categoryPatterns = {
      'Technology': ['software', 'programming', 'development', 'tech', 'computer'],
      'Business': ['business', 'company', 'enterprise', 'management', 'strategy'],
      'Education': ['education', 'learning', 'course', 'tutorial', 'training'],
      'Science': ['science', 'research', 'analysis', 'study', 'experiment'],
      'Documentation': ['documentation', 'manual', 'guide', 'reference', 'specs'],
      'Finance': ['finance', 'budget', 'cost', 'pricing', 'investment'],
      'Healthcare': ['health', 'medical', 'patient', 'treatment', 'clinical'],
      'Legal': ['legal', 'law', 'contract', 'policy', 'regulation']
    };

    Object.entries(categoryPatterns).forEach(([category, patterns]) => {
      if (patterns.some(pattern => sample.includes(pattern))) {
        categories.push(category);
      }
    });

    return categories.slice(0, 3);
  }

  /**
   * Extract important keywords from document
   * @param {string} text - Document text
   * @returns {Array} Array of keywords
   */
  extractKeywords(text) {
    const words = text.toLowerCase().split(/\W+/);
    const wordFreq = {};
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'an', 'a', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
      'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
      'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their'
    ]);

    // Count word frequencies
    words.forEach(word => {
      if (word.length > 3 && !stopWords.has(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    // Sort by frequency and return top keywords
    return Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Generate semantic summary using advanced techniques
   * @param {string} text - Document text
   * @returns {string} Semantic summary
   */
  generateSemanticSummary(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length === 0) return '';

    // Score sentences based on position and content
    const scoredSentences = sentences.map((sentence, index) => {
      const trimmed = sentence.trim();
      let score = 0;

      // Position bonus (first and last sentences are often important)
      if (index === 0) score += 2;
      if (index === sentences.length - 1) score += 1.5;

      // Length bonus (medium-length sentences are often more informative)
      const wordCount = trimmed.split(/\s+/).length;
      if (wordCount >= 8 && wordCount <= 25) score += 1;

      // Keyword density bonus
      const keywords = ['important', 'key', 'main', 'primary', 'essential', 'critical'];
      const keywordMatches = keywords.filter(keyword => trimmed.toLowerCase().includes(keyword));
      score += keywordMatches.length * 0.5;

      return { sentence: trimmed, score, length: trimmed.length };
    });

    // Select top sentences for summary
    const topSentences = scoredSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence)) // Maintain order
      .map(item => item.sentence);

    return topSentences.join('. ') + '.';
  }

  /**
   * Generate description for the document
   * @param {string} text - Document text
   * @returns {string} Document description
   */
  generateDescription(text) {
    const firstParagraph = text.split('\n\n')[0] || text.substring(0, 200);
    return firstParagraph.trim().length > 100 ?
      firstParagraph.substring(0, 100) + '...' :
      firstParagraph;
  }

  /**
   * Extract author information from document
   * @param {string} text - Document text
   * @returns {string} Author name or empty string
   */
  extractAuthor(text) {
    const lines = text.split('\n');
    const authorPatterns = ['author:', 'by:', 'written by', 'created by'];

    for (const line of lines.slice(0, 10)) { // Check first 10 lines
      const lowerLine = line.toLowerCase();
      for (const pattern of authorPatterns) {
        if (lowerLine.includes(pattern)) {
          const authorMatch = line.split(new RegExp(pattern, 'i'))[1]?.trim();
          if (authorMatch && authorMatch.length > 0 && authorMatch.length < 50) {
            return authorMatch.replace(/[.:]$/, '');
          }
        }
      }
    }

    return '';
  }

  /**
   * Extract main topics from document
   * @param {string} text - Document text
   * @returns {Array} Array of main topics
   */
  extractTopics(text) {
    const topics = new Set();
    const sample = text.toLowerCase().substring(0, 2000);

    // Topic patterns based on common domains
    const topicPatterns = {
      'Machine Learning': ['machine learning', 'ml', 'neural network', 'deep learning', 'ai'],
      'Web Development': ['web development', 'frontend', 'backend', 'javascript', 'react'],
      'Data Science': ['data science', 'analytics', 'statistics', 'visualization'],
      'DevOps': ['devops', 'ci/cd', 'docker', 'kubernetes', 'deployment'],
      'Security': ['security', 'encryption', 'authentication', 'cybersecurity'],
      'Database': ['database', 'sql', 'nosql', 'mongodb', 'postgresql'],
      'API': ['api', 'rest', 'graphql', 'endpoint', 'integration'],
      'Testing': ['testing', 'unit test', 'integration test', 'qa', 'automation']
    };

    Object.entries(topicPatterns).forEach(([topic, patterns]) => {
      if (patterns.some(pattern => sample.includes(pattern))) {
        topics.add(topic);
      }
    });

    return Array.from(topics);
  }

  /**
   * Extract named entities (basic implementation)
   * @param {string} text - Document text
   * @returns {Array} Array of entities found
   */
  extractEntities(text) {
    const entities = [];
    const sample = text.substring(0, 1000);

    // Simple entity extraction (can be enhanced with NLP libraries)
    const potentialEntities = sample.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];

    return potentialEntities
      .filter(entity => entity.length > 3 && entity.split(' ').length <= 3)
      .slice(0, 5);
  }

  /**
   * Extract key phrases from document
   * @param {string} text - Document text
   * @returns {Array} Array of key phrases
   */
  extractKeyPhrases(text) {
    const phrases = [];
    const sentences = text.split(/[.!?]+/);

    sentences.forEach(sentence => {
      // Look for noun phrases and technical terms
      const words = sentence.trim().split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`;
        if (phrase.length > 6 && phrase.length < 30 &&
            !phrase.match(/^(the|and|or|but|in|on|at|to|for|of|with)/i)) {
          phrases.push(phrase);
        }
      }
    });

    // Return most frequent phrases
    const phraseFreq = {};
    phrases.forEach(phrase => {
      phraseFreq[phrase] = (phraseFreq[phrase] || 0) + 1;
    });

    return Object.entries(phraseFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([phrase]) => phrase);
  }

  /**
   * Calculate readability score
   * @param {string} text - Document text
   * @returns {number} Readability score (0-100)
   */
  calculateReadabilityScore(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);

    if (sentences.length === 0 || words.length === 0) return 0;

    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = words.reduce((sum, word) => sum + this.countSyllables(word), 0) / words.length;

    // Simplified Flesch Reading Ease formula
    const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Count syllables in a word (basic implementation)
   * @param {string} word - Word to analyze
   * @returns {number} Syllable count
   */
  countSyllables(word) {
    const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleanWord.length === 0) return 1;

    const vowels = 'aeiouy';
    let syllableCount = 0;
    let previousWasVowel = false;

    for (const char of cleanWord) {
      const isVowel = vowels.includes(char);
      if (isVowel && !previousWasVowel) {
        syllableCount++;
      }
      previousWasVowel = isVowel;
    }

    // Handle silent 'e'
    if (cleanWord.endsWith('e')) {
      syllableCount = Math.max(1, syllableCount - 1);
    }

    return Math.max(1, syllableCount);
  }

  /**
   * Assess technical level of the document
   * @param {string} text - Document text
   * @returns {string} Technical level assessment
   */
  assessTechnicalLevel(text) {
    const sample = text.toLowerCase();
    let technicalScore = 0;

    // Technical indicators
    const technicalTerms = [
      'algorithm', 'framework', 'api', 'database', 'function', 'class',
      'method', 'interface', 'protocol', 'architecture', 'infrastructure',
      'deployment', 'optimization', 'authentication', 'encryption'
    ];

    const codePatterns = ['{', '}', '=>', 'function', 'const ', 'let ', 'var '];
    const advancedTerms = ['neural network', 'machine learning', 'blockchain', 'microservices'];

    technicalScore += technicalTerms.filter(term => sample.includes(term)).length;
    technicalScore += codePatterns.filter(pattern => sample.includes(pattern)).length * 2;
    technicalScore += advancedTerms.filter(term => sample.includes(term)).length * 3;

    if (technicalScore >= 10) return 'expert';
    if (technicalScore >= 5) return 'intermediate';
    if (technicalScore >= 2) return 'beginner';
    return 'general';
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
