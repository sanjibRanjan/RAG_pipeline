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
} from '@mui/material';
import { Send, ExpandMore, Psychology, Person } from '@mui/icons-material';
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
      const response = await axios.post('/api/qa/ask', {
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

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Paper
      elevation={2}
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2,
        overflow: 'hidden'
      }}
    >
      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          bgcolor: 'background.default',
          minHeight: 400,
          maxHeight: 600
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
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {message.content}
                  </Typography>

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
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
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

        <Typography variant="caption" sx={{ mt: 1, color: 'text.secondary', display: 'block' }}>
          Press Enter to send, Shift+Enter for new line
        </Typography>
      </Box>
    </Paper>
  );
};

export default ChatInterface;
