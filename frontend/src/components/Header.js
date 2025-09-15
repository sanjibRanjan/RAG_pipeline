import React from 'react';
import { AppBar, Toolbar, Typography, Box, Chip } from '@mui/material';
import { Psychology, SmartToy, Description } from '@mui/icons-material';

const Header = () => {
  return (
    <AppBar position="static" elevation={2} sx={{ bgcolor: 'primary.main' }}>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
          <Psychology sx={{ mr: 1, color: 'primary.contrastText' }} />
          <SmartToy sx={{ color: 'secondary.light' }} />
        </Box>
        <Typography variant="h5" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', color: 'primary.contrastText' }}>
          RAG Chat
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            icon={<Description />}
            label="Document AI"
            size="small"
            sx={{
              bgcolor: 'rgba(255, 255, 255, 0.1)',
              color: 'primary.contrastText',
              '& .MuiChip-icon': { color: 'secondary.light' }
            }}
          />
          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
            AI-Powered Q&A
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
