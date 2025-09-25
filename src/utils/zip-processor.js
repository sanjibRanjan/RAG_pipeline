import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export class ZipProcessor {
  constructor() {
    this.tempDir = path.join(process.cwd(), "temp");
    this.ensureTempDir();
  }

  /**
   * Ensure temporary directory exists
   */
  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Extract ZIP file to temporary directory
   * @param {string} zipPath - Path to ZIP file
   * @returns {Object} Extraction result with extracted files info
   */
  async extractZip(zipPath) {
    try {
      console.log(`🔄 Extracting ZIP file: ${zipPath}`);

      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();

      // Create unique extraction directory
      const extractDir = path.join(this.tempDir, `extract_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
      fs.mkdirSync(extractDir, { recursive: true });

      const extractedFiles = [];

      // Extract each entry
      for (const entry of zipEntries) {
        if (!entry.isDirectory) {
          const fileName = entry.entryName;
          const extractedPath = path.join(extractDir, fileName);

          // Ensure directory exists for nested files
          const fileDir = path.dirname(extractedPath);
          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
          }

          // Extract file
          zip.extractEntryTo(entry, extractDir, false, true);

          // Check if it's a supported file type
          const ext = path.extname(fileName).toLowerCase();
          if (['.txt', '.pdf'].includes(ext)) {
            extractedFiles.push({
              originalName: fileName,
              extractedPath: extractedPath,
              fileType: ext.substring(1), // Remove the dot
              size: entry.header.size || 0
            });
          }
        }
      }

      console.log(`✅ Extracted ${extractedFiles.length} supported files from ZIP`);

      return {
        success: true,
        extractDir,
        extractedFiles,
        totalFiles: zipEntries.length
      };

    } catch (error) {
      console.error(`❌ ZIP extraction failed:`, error);
      return {
        success: false,
        error: error.message,
        extractDir: null,
        extractedFiles: []
      };
    }
  }

  /**
   * Validate ZIP file contents
   * @param {string} zipPath - Path to ZIP file
   * @returns {Object} Validation result
   */
  async validateZipContents(zipPath) {
    try {
      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();

      const supportedFiles = [];
      const unsupportedFiles = [];

      for (const entry of zipEntries) {
        if (!entry.isDirectory) {
          const fileName = entry.entryName;
          const ext = path.extname(fileName).toLowerCase();

          if (['.txt', '.pdf'].includes(ext)) {
            supportedFiles.push({
              name: fileName,
              size: entry.header.size || 0,
              type: ext.substring(1)
            });
          } else {
            unsupportedFiles.push({
              name: fileName,
              type: ext || 'no extension'
            });
          }
        }
      }

      return {
        valid: supportedFiles.length > 0,
        supportedFiles,
        unsupportedFiles,
        totalFiles: zipEntries.length,
        hasUnsupportedFiles: unsupportedFiles.length > 0
      };

    } catch (error) {
      console.error(`❌ ZIP validation failed:`, error);
      return {
        valid: false,
        error: error.message,
        supportedFiles: [],
        unsupportedFiles: [],
        totalFiles: 0,
        hasUnsupportedFiles: false
      };
    }
  }

  /**
   * Clean up extracted files
   * @param {string} extractDir - Directory to clean up
   */
  cleanup(extractDir) {
    try {
      if (extractDir && fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
        console.log(`🧹 Cleaned up temporary directory: ${extractDir}`);
      }
    } catch (error) {
      console.error(`❌ Cleanup failed for ${extractDir}:`, error);
    }
  }

  /**
   * Get WhatsApp chat file from extracted files
   * @param {Array} extractedFiles - List of extracted files
   * @returns {Object|null} WhatsApp chat file info or null
   */
  findWhatsAppChat(extractedFiles) {
    // Look for files that might contain WhatsApp chats
    const chatFiles = extractedFiles.filter(file =>
      file.originalName.toLowerCase().includes('chat') ||
      file.originalName.toLowerCase().includes('whatsapp') ||
      file.originalName.toLowerCase().includes('conversation') ||
      (file.fileType === 'txt' && this.isLikelyChatFile(file.extractedPath))
    );

    return chatFiles.length > 0 ? chatFiles[0] : null;
  }

  /**
   * Check if a text file looks like a WhatsApp chat export
   * @param {string} filePath - Path to text file
   * @returns {boolean} True if likely a chat file
   */
  isLikelyChatFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8').substring(0, 500);

      // WhatsApp chat pattern: [DD/MM/YYYY, HH:MM:SS] - Name: Message
      const whatsappPattern = /\[\d{1,2}\/\d{1,2}\/\d{4},\s\d{1,2}:\d{2}:\d{2}\]\s-\s[^:]+:/;

      return whatsappPattern.test(content);
    } catch (error) {
      return false;
    }
  }
}
