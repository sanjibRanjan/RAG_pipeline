# RAG Chat Frontend

A modern, ChatGPT-inspired chat interface for the RAG Pipeline backend.

## Features

- 📄 **Document Upload**: Upload PDF and TXT files to your knowledge base
- 💬 **Chat Interface**: Ask questions and get AI-powered answers
- 📊 **Source Attribution**: See which documents and chunks were used for answers
- 🎯 **Confidence Scores**: View confidence levels for each response
- 💾 **Session Management**: Persistent conversations with session tracking
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **React 18**: Modern React with hooks
- **Material-UI**: Beautiful, accessible UI components
- **Axios**: HTTP client for API communication
- **CSS**: Custom styling for ChatGPT-like appearance

## Getting Started

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn
- Running RAG Pipeline backend on port 3000

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

The frontend will be available at `http://localhost:3001` and will proxy API requests to the backend at `http://localhost:3000`.

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

## Usage

### Uploading Documents

1. Click the "Choose File" button in the upload section
2. Select a PDF or TXT file (max 10MB)
3. The system will automatically process and add it to your knowledge base

### Asking Questions

1. Type your question in the input field at the bottom
2. Press Enter or click the send button
3. View the AI response with source attribution and confidence scores

### Viewing Sources

- Click on "Sources" in any AI response to see which documents were referenced
- Each source shows the document name, chunk number, and relevance score

## API Integration

The frontend communicates with the RAG Pipeline backend via these endpoints:

- `POST /api/documents/upload` - Upload documents
- `POST /api/documents/ingest` - Process documents
- `POST /api/qa/ask` - Ask questions and get answers

## Development

### Project Structure

```
frontend/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── ChatInterface.js
│   │   ├── DocumentUpload.js
│   │   └── Header.js
│   ├── styles/
│   │   └── App.css
│   ├── App.js
│   └── index.js
├── package.json
└── README.md
```

### Adding New Features

1. Create new components in `src/components/`
2. Update `App.js` to include new components
3. Add styles in `src/styles/App.css`
4. Test functionality with the backend API

## Troubleshooting

### Backend Connection Issues

- Ensure the RAG Pipeline backend is running on port 3000
- Check that CORS is properly configured
- Verify API endpoints are responding

### Upload Issues

- Check file size (max 10MB)
- Ensure file type is PDF or TXT
- Verify backend upload directory permissions

### Chat Issues

- Confirm documents are uploaded and ingested
- Check browser console for errors
- Verify session management is working

## Contributing

1. Follow the existing code style
2. Test all changes with the backend
3. Update documentation as needed
4. Ensure responsive design works on mobile

## License

Same as the main RAG Pipeline project.
