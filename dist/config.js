import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
// Load environment variables
dotenv.config();
// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Configuration object
const config = {
    // Telegram
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    // Supabase
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseKey: process.env.SUPABASE_SERVICE_KEY || "",
    // Solana
    solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY || "",
    rpcUrl: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
    // Privy
    privyAppId: process.env.PRIVY_APP_ID || "",
    privyAppSecret: process.env.PRIVY_APP_SECRET || "",
    // Directories
    outputDir: path.join(__dirname, "..", "generated_images"),
};
// Validate configuration
if (!config.telegramToken) {
    console.error("Error: TELEGRAM_BOT_TOKEN is required. Please set it in the .env file.");
    process.exit(1);
}
if (!config.openaiApiKey) {
    console.error("Error: OPENAI_API_KEY is required. Please set it in the .env file.");
    process.exit(1);
}
if (!config.supabaseUrl || !config.supabaseKey) {
    console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY are required. Please set them in the .env file.");
    process.exit(1);
}
if (!config.privyAppId || !config.privyAppSecret) {
    console.warn("Warning: PRIVY_APP_ID and PRIVY_APP_SECRET are not set. Privy wallet functionality will not work.");
}
export default config;
