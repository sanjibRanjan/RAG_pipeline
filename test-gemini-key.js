#!/usr/bin/env node

import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testGeminiConnection() {
  console.log('🧪 Testing Google Gemini API connection...\n');

  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error('❌ GOOGLE_API_KEY not found in environment variables');
    process.exit(1);
  }

  if (apiKey === 'YOUR_NEW_GOOGLE_API_KEY_HERE') {
    console.error('❌ Please replace YOUR_NEW_GOOGLE_API_KEY_HERE with your actual Google API key');
    process.exit(1);
  }

  try {
    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Test the connection
    const chat = model.startChat({
      history: [],
    });

    const testPrompt = "Hello! Please respond with exactly: 'Gemini API test successful!'";
    console.log(`📤 Sending test prompt: "${testPrompt}"`);

    const result = await chat.sendMessage(testPrompt);
    const response = result.response.text();

    console.log(`📥 Response: "${response.trim()}"`);

    if (response.includes('successful')) {
      console.log('\n✅ Google Gemini API connection test PASSED!');
      console.log('🎉 Your new API key is working correctly.');
    } else {
      console.log('\n⚠️ API responded but with unexpected content');
      console.log('This might still work, but verify the response quality.');
    }

  } catch (error) {
    console.error('\n❌ Google Gemini API connection test FAILED!');
    console.error('Error details:', error.message);

    if (error.message.includes('429')) {
      console.error('\n💡 This is still a quota issue. Try:');
      console.error('   1. Use a different Google API key');
      console.error('   2. Wait for quota reset (usually daily)');
      console.error('   3. Upgrade your Google Cloud billing plan');
    } else if (error.message.includes('403') || error.message.includes('invalid')) {
      console.error('\n💡 API key issue. Make sure:');
      console.error('   1. The API key is correct');
      console.error('   2. Gemini API is enabled in Google Cloud Console');
      console.error('   3. Billing is enabled for your project');
    }
  }
}

// Run the test
testGeminiConnection().catch(console.error);

