# Telegram Image Generation Bot with Solana Integration

A Telegram bot that generates images using OpenAI's GPT-image-1 model based on user prompts and provides Solana blockchain functionality using Solana Agent Kit.

## Features

- Generate images based on text prompts
- Create images with transparent backgrounds
- Store generated images in Supabase
- View your previously generated images
- Interact with Solana blockchain through natural language
- Handles regular messages as image prompts or Solana queries

## Setup

1. **Prerequisites**
   - Node.js (v18 or higher)
   - Telegram Bot Token (obtain from [BotFather](https://t.me/BotFather))
   - OpenAI API Key (obtain from [OpenAI Platform](https://platform.openai.com/api-keys))
   - Supabase Project (set up at [Supabase](https://supabase.com))
   - Solana Private Key and RPC URL

2. **Supabase Setup**
   - Create a new Supabase project
   - Create a table named `images` with the following schema:
     ```sql
     create table images (
       id uuid primary key default gen_random_uuid(),
       user_id text not null,
       filename text not null,
       prompt text not null,
       path text not null,
       url text not null,
       created_at timestamp with time zone default now()
     );
     ```
   - Create a storage bucket named `images` with public access

3. **Installation**
   ```bash
   # Clone the repository
   git clone <repository-url>
   cd send-nft-bot

   # Install dependencies
   npm install
   ```

4. **Configuration**
   Create a `.env` file in the root directory with the following contents:
   ```
   # Telegram
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token

   # OpenAI
   OPENAI_API_KEY=your_openai_api_key

   # Supabase
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_service_key

   # Solana
   SOLANA_PRIVATE_KEY=your_solana_private_key
   RPC_URL=your_solana_rpc_url
   ```

5. **Running the Bot**
   ```bash
   # Start the bot
   npm start
   ```

## Usage

- `/start` - Start the bot and see the welcome message
- `/help` - Get information about available commands
- `/generate [prompt]` - Generate an image based on the provided prompt
- `/transparent [prompt]` - Generate an image with a transparent background
- `/myimages` - View your previously generated images
- Any regular message will be treated as:
  - A Solana-related query if it contains keywords like "solana", "blockchain", "nft", etc.
  - An image generation prompt otherwise

## Examples

- `/generate A beautiful sunset over the mountains`
- `/transparent A cute cartoon cat`
- Just send: `A futuristic cityscape at night with neon lights`
- Ask Solana questions: `How do I create an NFT on Solana?`

## License

ISC 