# Adding Google Gemini AI Support to RAG Pipeline

This guide explains how to add Google Gemini AI support to your RAG (Retrieval-Augmented Generation) pipeline.

## 🚀 What's New

Your RAG pipeline now supports **4 LLM providers**:
- ✅ OpenAI (GPT-3.5, GPT-4)
- ✅ Anthropic (Claude)
- ✅ **Google Gemini (NEW!)**
- 🔄 Rule-based generation (fallback)

## 📋 Prerequisites

### 1. Get Google AI API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy the API key

### 2. Environment Setup

Add the following to your `.env` file:

```env
# Enable Gemini as your LLM provider
LLM_PROVIDER=gemini

# Gemini Configuration
GOOGLE_API_KEY=your_google_api_key_here
LLM_MODEL=gemini-1.5-flash

# Optional: Adjust settings
LLM_TEMPERATURE=0.3  # 0.0 = deterministic, 1.0 = creative
LLM_MAX_TOKENS=2000  # Maximum response length
```

### Alternative Environment Variable Names

You can also use:
```env
GEMINI_API_KEY=your_google_api_key_here  # Alternative to GOOGLE_API_KEY
```

## 🧠 Gemini Models Available

| Model | Description | Context Window | Use Case |
|-------|-------------|----------------|----------|
| `gemini-1.5-flash` | Fast, efficient | ~1M tokens | General Q&A, quick responses |
| `gemini-1.5-pro` | Most capable | ~1M tokens | Complex reasoning, detailed analysis |
| `gemini-1.0-pro` | Legacy model | 32K tokens | Basic tasks |

## 🧪 Testing Gemini Integration

### 1. Update Environment
```bash
# Add to your .env file
echo "LLM_PROVIDER=gemini" >> .env
echo "GOOGLE_API_KEY=your_key_here" >> .env
```

### 2. Test the Setup
```bash
npm run test:llm
```

Expected output:
```
🧪 Testing LLM Integration...

🔍 Checking environment setup...

LLM Provider: gemini
OpenAI Key: ❌ not set
Anthropic Key: ❌ not set
Google/Gemini Key: ✅ set

✅ Environment setup looks good!

1. Initializing LLM...
🤖 Initializing gemini LLM client...
✅ gemini LLM client initialized successfully

2. Testing answer generation...
🧠 Generating answer using gemini gemini-1.5-flash...
✅ Answer generated successfully (XXX characters)
🎯 Confidence: XX.X%
🤖 Model: gemini/gemini-1.5-flash

🎉 All LLM tests passed!
```

## 🔧 Technical Implementation

### How Gemini Integration Works

```javascript
// In LangChainManager
initializeGemini() {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required");
  }

  this.llm = new ChatGoogleGenerativeAI({
    apiKey: apiKey,
    modelName: this.modelName,  // e.g., "gemini-1.5-flash"
    temperature: this.temperature,
    maxOutputTokens: this.maxTokens,
  });
}
```

### Context Window Management

Gemini models have large context windows:
- **Gemini 1.5 Flash**: ~1M tokens total context
- **Gemini 1.5 Pro**: ~1M tokens total context

Your system automatically adjusts context limits based on the model.

## 🎯 Switching Between Providers

### To Use OpenAI:
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_key
LLM_MODEL=gpt-3.5-turbo
```

### To Use Anthropic:
```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_key
LLM_MODEL=claude-3-haiku-20240307
```

### To Use Gemini:
```env
LLM_PROVIDER=gemini
GOOGLE_API_KEY=your_google_key
LLM_MODEL=gemini-1.5-flash
```

## 🆚 Comparison: Gemini vs Other Providers

| Feature | Gemini 1.5 Flash | GPT-3.5 Turbo | Claude 3 Haiku |
|---------|------------------|----------------|----------------|
| **Speed** | ⚡ Fastest | ⚡ Fast | ⚡ Fast |
| **Cost** | 💰 Free tier available | 💰 Paid | 💰 Paid |
| **Context** | 📚 1M tokens | 📚 16K tokens | 📚 200K tokens |
| **Quality** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Multimodal** | ✅ Yes | ❌ No | ❌ No |

## 🚨 Troubleshooting

### Common Issues

1. **"GOOGLE_API_KEY environment variable is required"**
   - Make sure you've added `GOOGLE_API_KEY=your_key` to `.env`
   - Restart your server after adding the key

2. **"LLM initialization failed"**
   - Verify your API key is valid
   - Check Google AI Studio for key status
   - Ensure you have internet connection

3. **"429 Resource exhausted"**
   - You've hit Gemini's rate limits
   - Wait a few minutes before retrying
   - Consider upgrading to a paid plan

4. **"Invalid model name"**
   - Use `gemini-1.5-flash` or `gemini-1.5-pro`
   - Check the exact model name in Google AI Studio

### Rate Limits (Gemini 1.5 Flash Free Tier)
- **RPM**: 15 requests per minute
- **RPD**: 1,500 requests per day
- **TPM**: 1 million tokens per minute

## 🎊 Example Usage

Once configured, your RAG pipeline will automatically use Gemini for all answer generation:

```bash
curl -X POST http://localhost:3001/api/qa/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the benefits of machine learning?",
    "sessionId": "test"
  }'
```

Response will include:
```json
{
  "answer": "Machine learning offers several key benefits...",
  "model": "gemini/gemini-1.5-flash",
  "confidence": 0.89,
  "sources": [...]
}
```

## 🔄 Migration from Other Providers

If you're switching from OpenAI or Anthropic to Gemini:

1. Update your `.env` file
2. Change `LLM_PROVIDER` to `gemini`
3. Add your `GOOGLE_API_KEY`
4. Update `LLM_MODEL` if desired
5. Restart your application
6. Test with `npm run test:llm`

Your existing API endpoints and functionality remain unchanged!

## 📈 Performance Tips

### For Speed (Use Gemini 1.5 Flash):
```env
LLM_MODEL=gemini-1.5-flash
LLM_TEMPERATURE=0.1
```

### For Quality (Use Gemini 1.5 Pro):
```env
LLM_MODEL=gemini-1.5-pro
LLM_TEMPERATURE=0.3
```

### For Cost Optimization:
- Use Gemini 1.5 Flash for most queries
- Reserve Gemini 1.5 Pro for complex questions
- Monitor usage in Google AI Studio

## 🎉 Congratulations!

You now have **multi-provider LLM support** in your RAG pipeline! Gemini AI is now available alongside OpenAI and Anthropic, giving you flexibility in choosing the best model for your use case.

Happy prompting! 🤖✨
