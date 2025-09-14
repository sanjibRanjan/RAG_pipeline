import React, { useState, useRef, useEffect } from 'react';
import { Box, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import ChatInterface from './components/ChatInterface';
import DocumentUpload from './components/DocumentUpload';
import Header from './components/Header';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

function App() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'system',
      content: 'Welcome to RAG Chat! Upload documents and ask questions about them.',
      timestamp: new Date(),
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        bgcolor: 'background.default'
      }}>
        <Header />
        <Box sx={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden'
        }}>
          <Box sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            maxWidth: '1200px',
            mx: 'auto',
            width: '100%'
          }}>
            <DocumentUpload />
            <ChatInterface
              messages={messages}
              setMessages={setMessages}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
              sessionId={sessionId}
              setSessionId={setSessionId}
              messagesEndRef={messagesEndRef}
            />
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
