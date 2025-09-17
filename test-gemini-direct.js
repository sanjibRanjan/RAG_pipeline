#!/usr/bin/env node

/**
 * Direct test of Gemini API to isolate issues
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testGeminiDirect() {
  console.log("🧪 Testing Gemini API Directly\n");

  try {
    // Check API key
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required");
    }
    
    console.log(`✅ API Key found: ${apiKey.substring(0, 10)}...`);
    
    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 0.8,
        maxOutputTokens: 1000,
      },
    });

    console.log("✅ Gemini model initialized");

    // Test 1: Simple prompt
    console.log("\n🔧 Test 1: Simple prompt");
    const simplePrompt = "Hello, please respond with just 'OK' if you can read this.";
    
    const simpleResult = await model.generateContent(simplePrompt);
    const simpleResponse = await simpleResult.response;
    const simpleText = simpleResponse.text();
    
    console.log(`Response: ${simpleText}`);

    // Test 2: JSON generation
    console.log("\n🔧 Test 2: JSON generation");
    const jsonPrompt = `You are a highly specialized AI assistant that transforms raw text into a structured JSON object. Your ONLY function is to answer the user's question by generating a comprehensive JSON response based on the provided CONTEXT.

CRITICAL INSTRUCTIONS:
1. Your ENTIRE response must be ONLY a valid JSON object - no text before or after
2. Use ONLY information from the provided CONTEXT - no external knowledge
3. If information is not in the context, use empty arrays [] or empty strings ""
4. NEVER include source citations, references, or placeholders
5. AVOID repetition - each point must be unique and add new information
6. Provide comprehensive coverage of ALL relevant information

JSON STRUCTURE (respond with ONLY this format):
{
  "title": "Concise title related to the question",
  "definitionAndPurpose": "Comprehensive definition and purpose based on context",
  "keyPoints": [
    "Distinct point 1",
    "Distinct point 2",
    "Distinct point 3"
  ],
  "keyCategories": [
    "Category 1 if found in context",
    "Category 2 if found in context"
  ],
  "examples": [
    "Specific example 1 if found",
    "Specific example 2 if found"
  ],
  "detailedExplanation": "Comprehensive explanation covering all aspects from context",
  "conclusion": "Brief concluding summary"
}

---
CONTEXT:
Self-disclosure refers to the information we choose to reveal about ourselves within a romantic relationship. The aim of self-disclosure is to increase the intimacy, understanding and empathy between two individuals. This is under the condition that the self-disclosure is reciprocal. Altman and Taylor have proposed the 'social penetration' theory, which suggests that the process of self-disclosure allows one person to penetrate deeper into the life of their partner, thus increasing intimacy and trust. However, it is important to be selective with what one chooses to disclose. The researchers have used an onion analogy to illustrate this. As the relationship progresses, more layers of the onion are removed, representing deeper and more meaningful information being disclosed. This is only likely to occur if the exchange of such information is reciprocal i.e. the other person showing empathy, understanding and revealing personal details about themselves. Such exchanges represents a stage in the relationship which is serious and characterised by trust. Revealing intimate details about oneself at the beginning of a relationship may be detrimental effects e.g. revealing 'too much information'. This demonstrates to the other person that at least one person in the relationship does not trust the other. Reis and Shaver (1988) suggest that there are two elements of the social penetration theory - depth and breadth. There is a positive correlation between the increasing quality and trust within a relationship, coinciding with increasing depth and breadth of revealed information. For example, high levels of breadth result in low levels of depth due to many topics being 'off limits', thus reducing the emotional impact and empathy shown by the other person. This is the kind of information we would disclose to strangers, colleagues etc. Therefore, the key to maintaining a developing and intimate relationship is a balance between depth and breadth, through the reciprocal self-disclosure of information from both parties.
---
USER QUESTION:
What is self-disclosure?
---

JSON_OUTPUT:`;

    const jsonResult = await model.generateContent(jsonPrompt);
    const jsonResponse = await jsonResult.response;
    const jsonText = jsonResponse.text();
    
    console.log(`JSON Response: ${jsonText.substring(0, 200)}...`);
    
    // Try to parse JSON
    try {
      const cleanedResponse = jsonText.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '');
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedJson = JSON.parse(jsonMatch[0]);
        console.log("✅ JSON parsing successful");
        console.log("Title:", parsedJson.title);
        console.log("Key Points:", parsedJson.keyPoints?.length || 0);
      } else {
        console.log("❌ No JSON object found in response");
      }
    } catch (parseError) {
      console.log("❌ JSON parsing failed:", parseError.message);
    }

    // Test 3: Check rate limits and quotas
    console.log("\n🔧 Test 3: Rate limit check");
    console.log("Making multiple rapid requests...");
    
    for (let i = 0; i < 3; i++) {
      try {
        const rapidResult = await model.generateContent(`Test ${i + 1}: Respond with just the number ${i + 1}`);
        const rapidResponse = await rapidResult.response;
        const rapidText = rapidResponse.text();
        console.log(`Request ${i + 1}: ${rapidText}`);
      } catch (error) {
        console.log(`Request ${i + 1} failed:`, error.message);
      }
    }

    console.log("\n✅ All tests completed!");

  } catch (error) {
    console.error("❌ Test failed:", error);
    
    if (error.message.includes('API key')) {
      console.log("\n💡 Solution: Check your Google API key in the .env file");
    } else if (error.message.includes('quota')) {
      console.log("\n💡 Solution: Check your Google Cloud quota limits");
    } else if (error.message.includes('permission')) {
      console.log("\n💡 Solution: Check your Google Cloud permissions");
    } else if (error.message.includes('network')) {
      console.log("\n💡 Solution: Check your internet connection");
    }
  }
}

// Run tests
testGeminiDirect().catch(console.error);
