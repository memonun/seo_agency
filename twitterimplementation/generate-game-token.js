#!/usr/bin/env node
/**
 * GAME Twitter Token Generator
 * 
 * Helper script to generate proper GAME Twitter access tokens
 * Tokens will start with "apx-" prefix
 */

import { execSync } from 'child_process';
import dotenv from 'dotenv';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function generateToken() {
  console.log('🔐 GAME Twitter Token Generator');
  console.log('================================\n');
  
  // Check for existing GAME_API_KEY
  let apiKey = process.env.GAME_API_KEY;
  
  if (!apiKey) {
    console.log('No GAME_API_KEY found in environment.');
    apiKey = await question('Enter your GAME_API_KEY: ');
    
    if (!apiKey || !apiKey.startsWith('apt-')) {
      console.log('❌ Invalid API key format. GAME API keys should start with "apt-"');
      process.exit(1);
    }
  } else {
    console.log(`Using GAME_API_KEY from environment: ${apiKey.substring(0, 10)}...`);
  }
  
  console.log('\n📝 Generating GAME Twitter access token...\n');
  
  try {
    // Run the npx command to generate token
    const command = `npx @virtuals-protocol/game-twitter-node auth -k ${apiKey}`;
    console.log('Running:', command);
    console.log('\n⚠️  Please follow the authentication URL that appears and complete the OAuth flow.\n');
    
    // Execute command interactively
    execSync(command, { stdio: 'inherit' });
    
    console.log('\n✅ Token generation complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Copy the token that starts with "apx-"');
    console.log('2. Add it to your .env file as:');
    console.log('   GAME_TWITTER_ACCESS_TOKEN=apx-xxxxxxxxxxxxxxxxx\n');
    
    const updateEnv = await question('Would you like to update .env automatically? (y/n): ');
    
    if (updateEnv.toLowerCase() === 'y') {
      const token = await question('Paste the generated token here: ');
      
      if (!token.startsWith('apx-')) {
        console.log('⚠️  Warning: Token should start with "apx-". Proceeding anyway...');
      }
      
      // Update .env file
      const envPath = path.resolve(process.cwd(), '../.env');
      let envContent = '';
      
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }
      
      // Check if token already exists
      if (envContent.includes('GAME_TWITTER_ACCESS_TOKEN=')) {
        // Replace existing token
        envContent = envContent.replace(
          /GAME_TWITTER_ACCESS_TOKEN=.*/,
          `GAME_TWITTER_ACCESS_TOKEN=${token}`
        );
        console.log('✅ Updated existing GAME_TWITTER_ACCESS_TOKEN in .env');
      } else {
        // Add new token
        envContent += `\n# GAME Twitter Access Token (generated)\nGAME_TWITTER_ACCESS_TOKEN=${token}\n`;
        console.log('✅ Added GAME_TWITTER_ACCESS_TOKEN to .env');
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log(`\n✅ Environment file updated: ${envPath}`);
    }
    
  } catch (error) {
    console.error('\n❌ Error generating token:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Ensure @virtuals-protocol/game-twitter-node is installed');
    console.log('2. Check your GAME_API_KEY is valid');
    console.log('3. Try running the command directly:');
    console.log(`   npx @virtuals-protocol/game-twitter-node auth -k ${apiKey}`);
    process.exit(1);
  } finally {
    rl.close();
  }
  
  console.log('\n🎉 Setup complete! You can now run Twitter tests.');
  console.log('   node run-tests.js --keyword "test"');
}

// Validate installation
async function validateInstallation() {
  try {
    execSync('npm list @virtuals-protocol/game-twitter-node', { stdio: 'ignore' });
    return true;
  } catch {
    console.log('📦 Installing @virtuals-protocol/game-twitter-node...');
    try {
      execSync('npm install @virtuals-protocol/game-twitter-node', { stdio: 'inherit' });
      return true;
    } catch (error) {
      console.error('❌ Failed to install required package');
      return false;
    }
  }
}

// Main execution
async function main() {
  // Check if package is installed
  const installed = await validateInstallation();
  if (!installed) {
    console.error('❌ Required package not installed. Please run:');
    console.error('   npm install @virtuals-protocol/game-twitter-node');
    process.exit(1);
  }
  
  // Generate token
  await generateToken();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { generateToken };