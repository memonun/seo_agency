/**
 * Process Social Listening Jobs - Entry Point
 *
 * This script is called to process queued jobs
 * Can be called from:
 * - API endpoint trigger (manual)
 * - Serverless function
 * - CLI command
 *
 * NO CRON - Manual trigger only
 */

import { SocialListeningJobWorker } from './jobWorker.js';

/**
 * Main function to process jobs
 */
async function processJobs() {
  try {
    // Get environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const apifyToken = process.env.APIFY_API_TOKEN;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials in environment variables');
    }

    if (!apifyToken) {
      console.warn('⚠️ WARNING: APIFY_API_TOKEN not found. Instagram scraping will fail.');
    }

    // Create worker
    const worker = new SocialListeningJobWorker({
      supabaseUrl,
      supabaseKey,
      apifyToken
    });

    // Process queued jobs
    await worker.start();

    return {
      success: true,
      message: 'Job processing completed'
    };

  } catch (error) {
    console.error('❌ Error processing jobs:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// If called directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  processJobs()
    .then(result => {
      console.log('\n📋 Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { processJobs };
export default processJobs;
