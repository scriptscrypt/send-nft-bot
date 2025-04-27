import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables
dotenv.config();

// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration object
const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  outputDir: path.join(__dirname, 'generated_images'),
};

// Validate configuration
if (!config.telegramToken) {
  console.error('Error: TELEGRAM_BOT_TOKEN is required. Please set it in the .env file.');
  process.exit(1);
}

if (!config.openaiApiKey) {
  console.error('Error: OPENAI_API_KEY is required. Please set it in the .env file.');
  process.exit(1);
}

export default config; 