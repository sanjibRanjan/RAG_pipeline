import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  LinearProgress,
  Alert,
  Chip
} from '@mui/material';
import { CloudUpload, CheckCircle, Error } from '@mui/icons-material';
import axios from 'axios';

const DocumentUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only PDF and TXT files are allowed');
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      // Upload file
      const formData = new FormData();
      formData.append('document', file);

      const uploadResponse = await axios.post('/api/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!uploadResponse.data.success) {
        throw new Error(uploadResponse.data.message);
      }

      const uploadData = uploadResponse.data.data;

      // Ingest document
      const ingestResponse = await axios.post('/api/documents/ingest', {
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

      setSuccess(`Successfully uploaded and processed ${uploadData.originalName} (${ingestData.chunksProcessed} chunks)`);

    } catch (error) {
      console.error('Upload error:', error);
      setError(error.response?.data?.message || error.message || 'Upload failed');

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

  return (
    <Paper
      elevation={2}
      sx={{
        p: 3,
        mb: 2,
        borderRadius: 2,
        bgcolor: 'background.paper'
      }}
    >
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Upload Documents
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Upload PDF or TXT files to add them to your knowledge base
        </Typography>
      </Box>

      <Box sx={{ mb: 2 }}>
        <input
          accept=".pdf,.txt"
          style={{ display: 'none' }}
          id="document-upload"
          type="file"
          onChange={handleFileUpload}
          disabled={uploading}
        />
        <label htmlFor="document-upload">
          <Button
            variant="outlined"
            component="span"
            startIcon={<CloudUpload />}
            disabled={uploading}
            sx={{
              minWidth: 200,
              height: 56,
              borderStyle: 'dashed',
              '&:hover': {
                borderStyle: 'dashed',
              }
            }}
          >
            {uploading ? 'Uploading...' : 'Choose File'}
          </Button>
        </label>
      </Box>

      {uploading && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress />
          <Typography variant="body2" sx={{ mt: 1 }}>
            Processing document...
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {uploadedFiles.length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Recent Uploads:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {uploadedFiles.slice(-5).map((file, index) => (
              <Chip
                key={index}
                label={`${file.name} (${formatFileSize(file.size)})`}
                icon={file.status === 'completed' ? <CheckCircle /> : <Error />}
                color={file.status === 'completed' ? 'success' : 'error'}
                variant="outlined"
                size="small"
              />
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default DocumentUpload;
