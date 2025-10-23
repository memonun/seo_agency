// Vercel Serverless Function
// News Analytics - SERP Content Analysis and URL Sentiment Analysis
// Executes Python scripts for comprehensive news analysis

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORS headers for production
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({}, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      headers: corsHeaders 
    });
  }

  try {
    console.log('📰 News Analytics API Request:', req.body);

    const { 
      mode = 'serp', // 'serp' or 'url'
      input, // URLs for URL mode
      urls, // URLs array for SERP mode
      searchId, // Search ID for SERP mode
      context = null
    } = req.body;

    // Validate required parameters based on mode
    if (mode === 'serp' && (!urls || urls.length === 0)) {
      return res.status(400).json({
        error: 'Missing required parameter: urls',
        message: 'Please provide URLs array for SERP mode',
        headers: corsHeaders
      });
    }
    
    if (mode === 'url' && !input) {
      return res.status(400).json({
        error: 'Missing required parameter: input',
        message: 'Please provide URLs for URL mode',
        headers: corsHeaders
      });
    }

    // Validate mode
    if (!['serp', 'url'].includes(mode)) {
      return res.status(400).json({
        error: 'Invalid mode',
        message: 'Mode must be either "serp" or "url"',
        headers: corsHeaders
      });
    }

    // Prepare Python script execution
    const scriptPath = path.join(__dirname, '..', 'web_search');
    // Always use url_sentiment_analyzer.py since we're passing URLs directly
    const scriptName = 'url_sentiment_analyzer.py';
    const fullScriptPath = path.join(scriptPath, scriptName);

    // Build command arguments
    // For both modes, we're now passing URLs directly
    const urlsToAnalyze = mode === 'serp' ? urls.join(',') : input;
    const args = [fullScriptPath, urlsToAnalyze];
    
    if (context) {
      args.push(context);
    }

    console.log(`🐍 Executing Python script: ${scriptName}`);
    console.log(`📝 Arguments:`, args);

    // Execute Python script
    const pythonProcess = spawn('python3', args, {
      env: {
        ...process.env,
        PYTHONPATH: scriptPath,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    });

    let stdout = '';
    let stderr = '';

    // Capture stdout
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`📊 Python output:`, data.toString());
    });

    // Capture stderr
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`⚠️ Python error:`, data.toString());
    });

    // Wait for process to complete
    const result = await new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        } else {
          // Try to extract JSON from stdout
          try {
            // Look for the output file path in stdout
            const outputMatch = stdout.match(/Full results saved to: (.+\.json)/);
            if (outputMatch) {
              const outputFile = outputMatch[1];
              console.log(`📁 Output file: ${outputFile}`);
              
              // Read the JSON file
              const fs = require('fs');
              const fileContent = fs.readFileSync(outputFile, 'utf8');
              const jsonResult = JSON.parse(fileContent);
              
              resolve({
                success: true,
                mode,
                input: mode === 'serp' ? urls.join(',') : input,
                searchId: searchId || null,
                context,
                data: jsonResult,
                outputFile
              });
            } else {
              // If no file output, try to parse relevant info from stdout
              const sentimentMatch = stdout.match(/OVERALL SENTIMENT DISTRIBUTION:([\s\S]+?)(?=\n\n|\n📁)/);
              const summaryMatch = stdout.match(/OVERALL SUMMARY:\n([\s\S]+?)(?=\n\n|\n🎯)/);
              const findingsMatch = stdout.match(/KEY FINDINGS:\n([\s\S]+?)(?=\n\n|\n📋)/);
              const executiveMatch = stdout.match(/EXECUTIVE SUMMARY:\n([\s\S]+?)(?=\n\n|\n=|$)/);
              
              resolve({
                success: true,
                mode,
                input: mode === 'serp' ? urls.join(',') : input,
                searchId: searchId || null,
                context,
                data: {
                  sentiment_text: sentimentMatch ? sentimentMatch[1].trim() : '',
                  overall_summary: summaryMatch ? summaryMatch[1].trim() : '',
                  key_findings_text: findingsMatch ? findingsMatch[1].trim() : '',
                  executive_summary: executiveMatch ? executiveMatch[1].trim() : '',
                  raw_output: stdout
                }
              });
            }
          } catch (parseError) {
            console.error('❌ Error parsing Python output:', parseError);
            resolve({
              success: false,
              error: 'Failed to parse Python output',
              stdout,
              stderr
            });
          }
        }
      });

      pythonProcess.on('error', (error) => {
        reject(error);
      });
    });

    // Return the result
    return res.status(200).json({
      ...result,
      headers: corsHeaders
    });

  } catch (error) {
    console.error('❌ News Analytics API Error:', error);
    
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      headers: corsHeaders
    });
  }
}