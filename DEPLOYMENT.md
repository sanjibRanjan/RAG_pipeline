# RAG Pipeline Deployment Guide

This guide will help you deploy your RAG Pipeline application using Railway for the backend and Vercel for the frontend.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
3. **GitHub Repository**: Push your code to GitHub
4. **API Keys**: You'll need at least one of the following:
   - Google Gemini API key
   - Anthropic Claude API key
   - OpenAI API key

## Backend Deployment (Railway)

### Step 1: Prepare Your Repository

1. Make sure all your code is committed and pushed to GitHub
2. Ensure you have the following files in your root directory:
   - `railway.json`
   - `nixpacks.toml`
   - `env.template`

### Step 2: Deploy to Railway

1. Go to [railway.app](https://railway.app) and sign in
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Railway will automatically detect it's a Node.js project

### Step 3: Configure Environment Variables

In the Railway dashboard, go to your project → Variables tab and add:

```
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://your-frontend-domain.vercel.app
CHROMA_HOST=localhost
CHROMA_PORT=8000
CHROMA_COLLECTION_NAME=rag_documents
EMBEDDING_MODEL=@huggingface/inference
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
GOOGLE_API_KEY=your_google_api_key_here
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=application/pdf,text/plain
LOG_LEVEL=info
MAX_CONCURRENT_REQUESTS=10
REQUEST_TIMEOUT=30000
```

**Important**: Replace `your_google_api_key_here` with your actual API key and update `CORS_ORIGIN` with your Vercel frontend URL after deployment.

### Step 4: Add ChromaDB Service

1. In Railway dashboard, click "New Service"
2. Select "Database" → "ChromaDB"
3. This will provide a managed ChromaDB instance
4. Update your environment variables with the ChromaDB connection details provided by Railway

### Step 5: Deploy

1. Railway will automatically deploy your application
2. Note down the generated URL (e.g., `https://your-app-name.railway.app`)

## Frontend Deployment (Vercel)

### Step 1: Prepare Frontend

1. Make sure your frontend code is in the `frontend/` directory
2. Ensure you have `vercel.json` in the frontend directory

### Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. Set the **Root Directory** to `frontend`
5. Vercel will automatically detect it's a React app

### Step 3: Configure Environment Variables

In Vercel dashboard, go to your project → Settings → Environment Variables and add:

```
REACT_APP_API_URL=https://your-backend-url.railway.app
```

Replace `https://your-backend-url.railway.app` with your actual Railway backend URL.

### Step 4: Deploy

1. Click "Deploy"
2. Vercel will build and deploy your frontend
3. Note down the generated URL (e.g., `https://your-app-name.vercel.app`)

## Post-Deployment Configuration

### Step 1: Update CORS Settings

1. Go back to Railway dashboard
2. Update the `CORS_ORIGIN` environment variable with your Vercel frontend URL
3. Redeploy the backend

### Step 2: Test the Application

1. Visit your Vercel frontend URL
2. Try uploading a document
3. Ask questions about the uploaded document

## Troubleshooting

### Common Issues

1. **CORS Errors**: Make sure `CORS_ORIGIN` in Railway matches your Vercel URL exactly
2. **API Connection Issues**: Verify `REACT_APP_API_URL` in Vercel points to your Railway URL
3. **ChromaDB Connection**: Ensure ChromaDB service is running and environment variables are correct
4. **File Upload Issues**: Check file size limits and allowed file types

### Logs

- **Railway Logs**: Available in Railway dashboard → Deployments → View Logs
- **Vercel Logs**: Available in Vercel dashboard → Functions → View Logs

## Environment Variables Reference

### Backend (Railway)
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (production)
- `CORS_ORIGIN`: Frontend URL for CORS
- `CHROMA_HOST`: ChromaDB host
- `CHROMA_PORT`: ChromaDB port
- `CHROMA_COLLECTION_NAME`: Collection name
- `EMBEDDING_MODEL`: Embedding model package
- `EMBEDDING_MODEL_NAME`: Specific model name
- `GOOGLE_API_KEY`: Google Gemini API key
- `MAX_FILE_SIZE`: Max file size in bytes
- `ALLOWED_FILE_TYPES`: Allowed MIME types

### Frontend (Vercel)
- `REACT_APP_API_URL`: Backend API URL

## Security Notes

1. Never commit API keys to your repository
2. Use environment variables for all sensitive data
3. Set up proper CORS origins in production
4. Consider adding rate limiting for production use
5. Monitor your API usage and costs

## Scaling Considerations

1. **Railway**: Automatically scales based on traffic
2. **Vercel**: Handles frontend scaling automatically
3. **ChromaDB**: Consider upgrading to a larger instance for more documents
4. **API Limits**: Monitor your LLM API usage and costs

## Support

If you encounter issues:
1. Check the logs in both Railway and Vercel dashboards
2. Verify all environment variables are set correctly
3. Test the API endpoints directly using tools like Postman
4. Check the browser console for frontend errors
