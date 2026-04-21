const fs = require('fs');
const path = require('path');
const https = require('https');
const child_process = require('child_process');

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("Please set GEMINI_API_KEY in the environment.");
  process.exit(1);
}

// Find all files with Chinese characters
const findFilesCmd = `grep -rlP '[\\p{Han}]' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=dist --exclude="SupportOS_ProgramPlan.md"`;

let filesToTranslate;
try {
  const result = child_process.execSync(findFilesCmd, { encoding: 'utf-8' });
  filesToTranslate = result.trim().split('\n').filter(f => f && !f.includes('/dist/') && !f.includes('package-lock.json'));
} catch (e) {
  console.log("No files found or grep failed", e);
  process.exit(0);
}

console.log(`Found ${filesToTranslate.length} files to translate.`);

async function translateText(text, filePath) {
  const prompt = `Translate all the Chinese text in the following file content to English.
Preserve ALL code structure, variable names, logic, markdown formatting, syntax, and layout EXACTLY as they are.
ONLY translate the Chinese sentences, phrases, and characters into English.
DO NOT wrap the output in markdown blocks (e.g., \`\`\`...) unless the original file already had them at the exact same location.
Return the complete file content, just translated.

File path for context: ${filePath}

Content:
${text}`;

  const data = JSON.stringify({
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(responseBody);
          if (json.candidates && json.candidates.length > 0) {
            let output = json.candidates[0].content.parts[0].text;
            // Clean up possible markdown code block wrapper if the original didn't have it
            if (output.startsWith('\`\`\`') && !text.startsWith('\`\`\`')) {
              output = output.replace(/^\`\`\`[a-z]*\n/, '');
              output = output.replace(/\n\`\`\`$/, '');
            }
            resolve(output);
          } else {
            console.error("API response missing candidates:", JSON.stringify(json, null, 2));
            reject(new Error("Invalid API response"));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  for (const file of filesToTranslate) {
    if (!fs.existsSync(file)) continue;

    console.log(`Translating: ${file}`);
    const originalContent = fs.readFileSync(file, 'utf-8');
    
    // Safety check - skip standard git/node generated or weird files if any slipped
    if (file.endsWith('.svg') || file.endsWith('.png') || file.endsWith('.lock')) {
      continue;
    }

    try {
      const translatedContent = await translateText(originalContent, file);
      
      // If it returned empty somehow, skip
      if (!translatedContent || translatedContent.trim() === '') {
        console.log(`Failed to translate ${file} - returned empty`);
        continue;
      }
      
      fs.writeFileSync(file, translatedContent, 'utf-8');
      console.log(`✅ Success: ${file}`);
      
      // Wait to respect rate limits (Gemini free tier has 15 RPM, so 4 seconds per request)
      await sleep(4000);
    } catch (e) {
      console.error(`❌ Failed to translate ${file}:`, e.message);
    }
  }
  console.log("All done!");
}

run();