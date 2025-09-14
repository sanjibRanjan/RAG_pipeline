import React from 'react';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import { Psychology } from '@mui/icons-material';

const Header = () => {
  return (
    <AppBar position="static" elevation={1}>
      <Toolbar>
        <Psychology sx={{ mr: 2, color: 'primary.main' }} />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          RAG Chat
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          AI-Powered Document Q&A
        </Typography>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
