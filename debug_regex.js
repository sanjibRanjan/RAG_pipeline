// Debug WhatsApp regex patterns
const testLine = "[9/24/25, 10:30:15 AM] - John Doe: Hello everyone! How is everyone doing today?";

console.log("Testing line:", testLine);

// WhatsApp format variations:
// [MM/DD/YY, HH:MM:SS AM/PM] - Name: Message (with space after comma)
// [DD/MM/YYYY, HH:MM:SS] - Name: Message
const whatsappPatterns = [
  /^\[\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)?\]\s*-\s*[^:]+:/,
  /^\[\d{1,2}\/\d{1,2}\/\d{4},\s+\d{1,2}:\d{2}:\d{2}\]\s*-\s*[^:]+:/
];

console.log("\nTesting patterns:");
whatsappPatterns.forEach((pattern, index) => {
  const match = pattern.test(testLine);
  console.log(`Pattern ${index + 1}: ${match}`);
  if (match) {
    console.log("  Matched!");
  }
});

// Let's also try a manual regex test
const manualPattern = /^\[\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)?\]\s*-\s*[^:]+:/;
console.log("\nManual pattern test:");
console.log("Pattern:", manualPattern);
console.log("Test result:", manualPattern.test(testLine));

// Let's break down the pattern
console.log("\nBreaking down the pattern:");
const parts = testLine.match(/^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)?)\]\s*-\s*([^:]+):\s*(.*)$/);
console.log("Match result:", parts);
