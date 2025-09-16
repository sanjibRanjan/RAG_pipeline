
import React, { useState } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Avatar,
  CircularProgress,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip,
  Alert,
  LinearProgress,
} from '@mui/material';
import { Send, ExpandMore, Psychology, Person, CloudUpload, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import axios from 'axios';

const ChatInterface = ({
  messages,
  setMessages,
  isLoading,
  setIsLoading,
  sessionId,
  setSessionId,
  messagesEndRef
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL || ''}/api/qa/ask`, {
        question: userMessage.content,
        sessionId: sessionId,
      });

      if (response.data.success) {
        const aiMessage = {
          id: Date.now() + 1,
          type: 'assistant',
          content: response.data.data.answer,
          sources: response.data.data.sources,
          confidence: response.data.data.confidence,
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, aiMessage]);

        // Update session ID if not set
        if (!sessionId && response.data.data.sessionId) {
          setSessionId(response.data.data.sessionId);
        }
      } else {
        throw new Error(response.data.message);
      }
    } catch (error) {
      console.error('QA error:', error);
      const errorMessage = {
        id: Date.now() + 2,
        type: 'error',
        content: error.response?.data?.message || 'Failed to get response. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Only PDF and TXT files are allowed');
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      // Upload file
      const formData = new FormData();
      formData.append('document', file);

      const uploadResponse = await axios.post(`${process.env.REACT_APP_API_URL || ''}/api/documents/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!uploadResponse.data.success) {
        throw new Error(uploadResponse.data.message);
      }

      const uploadData = uploadResponse.data.data;

      // Ingest document
      const ingestResponse = await axios.post(`${process.env.REACT_APP_API_URL || ''}/api/documents/ingest`, {
        filePath: uploadData.uploadPath,
        originalName: uploadData.originalName,
      });

      if (!ingestResponse.data.success) {
        throw new Error(ingestResponse.data.message);
      }

      const ingestData = ingestResponse.data.data;

      // Add to uploaded files list
      setUploadedFiles(prev => [...prev, {
        name: uploadData.originalName,
        size: uploadData.size,
        chunks: ingestData.chunksProcessed,
        uploadedAt: new Date(),
        status: 'completed'
      }]);

      setUploadSuccess(`Successfully uploaded and processed ${uploadData.originalName}`);

    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error.response?.data?.message || error.message || 'Upload failed');

      // Add failed upload to list
      setUploadedFiles(prev => [...prev, {
        name: file.name,
        size: file.size,
        status: 'failed',
        uploadedAt: new Date()
      }]);
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const structureResponse = (text) => {
    // Ensure text is a string
    if (!text || typeof text !== 'string') {
      return typeof text === 'object' ? JSON.stringify(text) : String(text || '');
    }

    // Check if the response is already well-structured (contains emoji markers)
    const structuredMarkers = ['🔍', '📖', '🔸', '📋', '💡', '🎯', '🔹'];
    const hasStructuredFormat = structuredMarkers.some(marker => text.includes(marker));

    // If already structured, return as-is to preserve backend formatting
    if (hasStructuredFormat) {
      return text;
    }

    // Only apply restructuring if the response is unstructured
    // Clean the text first
    let cleanText = text.replace(/\n{3,}/g, '\n\n').trim();

    // Check for common error patterns that shouldn't be restructured
    const errorPatterns = [
      /couldn't find any relevant information/i,
      /no relevant information/i,
      /unable to find/i,
      /no information found/i,
      /please try rephrasing/i,
      /upload more.*documents/i,
      /no documents found/i,
      /empty response/i,
      /failed to get response/i
    ];

    const isErrorResponse = errorPatterns.some(pattern => pattern.test(cleanText));

    // If it's an error or very short response, return as-is
    if (isErrorResponse || cleanText.length < 100) {
      return cleanText;
    }

    // Try to extract meaningful content from unstructured response
    const paragraphs = cleanText.split('\n\n').filter(p => p.trim().length > 20);
    const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 15);

    // If we don't have enough content to structure meaningfully, return original
    if (sentences.length < 3 && paragraphs.length < 1) {
      return cleanText;
    }

    // Create structured sections from unstructured content
    const header = "🔍 Comprehensive Answer and Information\n\nBased on our previous discussion about the topic, here is a comprehensive answer and information.";

    // Definition & Purpose section - take first substantial paragraph or sentences
    let definitionContent = "";
    if (paragraphs.length > 0) {
      definitionContent = paragraphs[0];
    } else if (sentences.length > 0) {
      definitionContent = sentences.slice(0, 2).join('. ').trim() + '.';
    } else {
      definitionContent = "The topic covers fundamental concepts and their practical applications in the relevant field.";
    }

    const definitionSection = "📖 Definition & Purpose\n\n" + definitionContent;

    // Key Categories section
    const categoriesSection = "🔸 Key Categories\n\n" +
      "The response covers several important categories including core concepts, methodologies, and practical applications.";

    // Key Points section with bullet points
    let keyPoints = [];
    if (sentences.length > 2) {
      // Take sentences 2-6 for key points, or available sentences
      const pointsToTake = Math.min(sentences.length - 2, 4);
      keyPoints = sentences.slice(2, 2 + pointsToTake).map(point =>
        "• " + point.trim().replace(/^•?\s*/, '') +
        (point.trim().endsWith('.') ? '' : '.')
      );
    } else {
      keyPoints = ["• Core concepts and principles are essential for understanding",
                   "• Practical applications demonstrate real-world relevance",
                   "• Methodological approaches provide systematic frameworks"];
    }

    const keyPointsSection = "📋 Key Points\n\n" + keyPoints.join('\n');

    // Examples section
    const examplesSection = "💡 Examples\n\n" +
      "Practical examples and real-world applications demonstrate these concepts in action.";

    // Conclusion section
    const conclusionSection = "🔹 Conclusion\n\n" +
      "This information provides a solid foundation for understanding and working with the topic.";

    // Combine all sections
    const structuredResponse = [
      header,
      definitionSection,
      categoriesSection,
      keyPointsSection,
      examplesSection,
      conclusionSection
    ].join('\n\n');

    return structuredResponse;
  };

  return (
    <Paper
      elevation={2}
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2,
        overflow: 'hidden',
        height: '100%'
      }}
    >
      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          bgcolor: 'background.default',
          minHeight: 400
        }}
      >
        {messages.map((message) => (
          <Box
            key={message.id}
            sx={{
              display: 'flex',
              mb: 3,
              justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                maxWidth: '80%',
                alignItems: 'flex-start',
              }}
            >
              <Avatar
                sx={{
                  bgcolor: message.type === 'user' ? 'primary.main' : 'secondary.main',
                  mr: 1,
                  mt: 0.5,
                }}
              >
                {message.type === 'user' ? <Person /> : <Psychology />}
              </Avatar>

              <Box sx={{ flex: 1 }}>
                <Paper
                  elevation={1}
                  sx={{
                    p: 2,
                    bgcolor: message.type === 'user' ? 'primary.main' : 'background.paper',
                    color: message.type === 'user' ? 'primary.contrastText' : 'text.primary',
                    borderRadius: 2,
                  }}
                >
                  <Box sx={{
                    '& h1, & h2, & h3, & h4, & h5, & h6': {
                      fontWeight: 'bold',
                      marginTop: 2,
                      marginBottom: 1,
                      color: message.type === 'user' ? 'primary.contrastText' : 'primary.main',
                    },
                    '& h1': { fontSize: '1.5rem' },
                    '& h2': { fontSize: '1.3rem' },
                    '& h3': { fontSize: '1.2rem' },
                    '& strong, & b': {
                      fontWeight: 'bold',
                      color: message.type === 'user' ? 'primary.contrastText' : 'text.primary',
                    },
                    '& ul, & ol': {
                      paddingLeft: 3,
                      marginTop: 1,
                      marginBottom: 1,
                    },
                    '& li': {
                      marginBottom: 0.5,
                    },
                    '& p': {
                      marginBottom: 1,
                      lineHeight: 1.6,
                    },
                    '& code': {
                      backgroundColor: message.type === 'user' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)',
                      padding: '2px 4px',
                      borderRadius: 1,
                      fontSize: '0.9em',
                    },
                    '& pre': {
                      backgroundColor: message.type === 'user' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)',
                      padding: 2,
                      borderRadius: 1,
                      overflow: 'auto',
                      marginTop: 1,
                      marginBottom: 1,
                    },
                    '& blockquote': {
                      borderLeft: '4px solid',
                      borderLeftColor: message.type === 'user' ? 'rgba(255,255,255,0.3)' : 'primary.light',
                      paddingLeft: 2,
                      marginLeft: 0,
                      fontStyle: 'italic',
                      opacity: 0.8,
                    },
                  }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        // Custom component for better emoji and text rendering
                        p: ({ children }) => (
                          <Typography
                            variant="body1"
                            sx={{
                              marginBottom: 1,
                              lineHeight: 1.6,
                              wordBreak: 'break-word',
                            }}
                          >
                            {children}
                          </Typography>
                        ),
                        // Enhanced list rendering
                        ul: ({ children }) => (
                          <Box component="ul" sx={{ paddingLeft: 3, marginTop: 1, marginBottom: 1 }}>
                            {children}
                          </Box>
                        ),
                        ol: ({ children }) => (
                          <Box component="ol" sx={{ paddingLeft: 3, marginTop: 1, marginBottom: 1 }}>
                            {children}
                          </Box>
                        ),
                        li: ({ children }) => (
                          <Box component="li" sx={{ marginBottom: 0.5 }}>
                            <Typography variant="body1">{children}</Typography>
                          </Box>
                        ),
                      }}
                    >
                      {structureResponse(message.content)}
                    </ReactMarkdown>
                  </Box>

                  {message.sources && message.sources.length > 0 && (
                    <Accordion sx={{ mt: 2, bgcolor: 'transparent' }}>
                      <AccordionSummary
                        expandIcon={<ExpandMore />}
                        sx={{ p: 0, minHeight: 'auto' }}
                      >
                        <Typography variant="body2" sx={{ opacity: 0.7 }}>
                          Sources ({message.sources.length})
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ p: 0, pt: 1 }}>
                        {message.sources.map((source, index) => (
                          <Box key={index} sx={{ mb: 1 }}>
                            <Chip
                              label={`${source.documentName} - Chunk ${source.chunkIndex}`}
                              size="small"
                              variant="outlined"
                              sx={{ mr: 1, mb: 0.5 }}
                            />
                            <Typography variant="body2" sx={{ opacity: 0.7 }}>
                              Similarity: {(source.similarity * 100).toFixed(1)}% |
                              Confidence: {(source.confidence * 100).toFixed(1)}%
                            </Typography>
                            <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                              "{source.preview}"
                            </Typography>
                          </Box>
                        ))}
                      </AccordionDetails>
                    </Accordion>
                  )}

                  {message.confidence && (
                    <Typography variant="caption" sx={{ opacity: 0.7, mt: 1, display: 'block' }}>
                      Confidence: {(message.confidence * 100).toFixed(1)}%
                    </Typography>
                  )}
                </Paper>

                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mt: 0.5,
                    color: 'text.secondary',
                    textAlign: message.type === 'user' ? 'right' : 'left',
                  }}
                >
                  {formatTimestamp(message.timestamp)}
                </Typography>
              </Box>
            </Box>
          </Box>
        ))}

        {isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Avatar sx={{ bgcolor: 'secondary.main', mr: 1 }}>
              <Psychology />
            </Avatar>
            <CircularProgress size={20} />
            <Typography variant="body2" sx={{ ml: 1, color: 'text.secondary' }}>
              Thinking...
            </Typography>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input Area */}
      <Box
        sx={{
          px: 2,
          pt: 2,
          pb: 0,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        {/* Upload Status Messages */}
        {uploading && (
          <Box sx={{ mb: 1 }}>
            <LinearProgress sx={{ mb: 1 }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Processing document...
            </Typography>
          </Box>
        )}

        {uploadError && (
          <Alert severity="error" sx={{ mb: 1, py: 0.5 }}>
            <Typography variant="body2">{uploadError}</Typography>
          </Alert>
        )}

        {uploadSuccess && (
          <Alert severity="success" sx={{ mb: 1, py: 0.5 }}>
            <Typography variant="body2">{uploadSuccess}</Typography>
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          {/* Upload Button */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <input
              accept=".pdf,.txt"
              style={{ display: 'none' }}
              id="document-upload"
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <label htmlFor="document-upload">
              <Tooltip title="Upload Document (PDF/TXT)">
                <IconButton
                  component="span"
                  disabled={uploading}
                  sx={{
                    width: 48,
                    height: 48,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    '&:hover': {
                      bgcolor: 'action.hover',
                      borderColor: 'primary.main',
                    },
                    '&.Mui-disabled': {
                      opacity: 0.5,
                    }
                  }}
                >
                  {uploading ? (
                    <CircularProgress size={24} />
                  ) : (
                    <CloudUpload sx={{ color: 'primary.main' }} />
                  )}
                </IconButton>
              </Tooltip>
            </label>

            {/* Recent uploads indicator */}
            {uploadedFiles.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                <Tooltip title={`${uploadedFiles.length} document${uploadedFiles.length > 1 ? 's' : ''} uploaded`}>
                  <Chip
                    size="small"
                    label={uploadedFiles.length}
                    color="primary"
                    variant="outlined"
                    sx={{ height: 16, fontSize: '0.7rem', minWidth: 20 }}
                  />
                </Tooltip>
              </Box>
            )}
          </Box>

          {/* Text Input */}
          <TextField
            fullWidth
            multiline
            maxRows={4}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about your documents..."
            variant="outlined"
            disabled={isLoading}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />

          {/* Send Button */}
          <Button
            variant="contained"
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            sx={{
              minWidth: 56,
              height: 56,
              borderRadius: 2,
            }}
          >
            {isLoading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              <Send />
            )}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default ChatInterface;
