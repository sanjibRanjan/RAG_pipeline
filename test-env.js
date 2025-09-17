#!/usr/bin/env node

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log("Environment Variables:");
console.log("LLM_PROVIDER:", process.env.LLM_PROVIDER);
console.log("GOOGLE_API_KEY:", process.env.GOOGLE_API_KEY ? `${process.env.GOOGLE_API_KEY.substring(0, 10)}...` : 'NOT SET');
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 10)}...` : 'NOT SET');
console.log("HF_API_KEY:", process.env.HF_API_KEY ? `${process.env.HF_API_KEY.substring(0, 10)}...` : 'NOT SET');
