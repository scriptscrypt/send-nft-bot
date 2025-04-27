# Telegram Image Generation Bot

A Telegram bot that generates images using OpenAI's GPT-image-1 model based on user prompts.

## Features

- Generate images based on text prompts
- Create images with transparent backgrounds
- Handles regular messages as image prompts
- Saves generated images locally

## Setup

1. **Prerequisites**
   - Node.js (v16 or higher)
   - Telegram Bot Token (obtain from [BotFather](https://t.me/BotFather))
   - OpenAI API Key (obtain from [OpenAI Platform](https://platform.openai.com/api-keys))

2. **Installation**
   ```bash
   # Clone the repository
   git clone <repository-url>
   cd send-nft-bot

   # Install dependencies
   npm install
   ```

3. **Configuration**
   Create a `.env` file in the root directory with the following contents:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   OPENAI_API_KEY=your_openai_api_key
   ```

4. **Running the Bot**
   ```bash
   # Start the bot
   npm start
   ```

## Usage

- `/start` - Start the bot and see the welcome message
- `/help` - Get information about available commands
- `/generate [prompt]` - Generate an image based on the provided prompt
- `/transparent [prompt]` - Generate an image with a transparent background
- Any regular message will be treated as a prompt for image generation

## Examples

- `/generate A beautiful sunset over the mountains`
- `/transparent A cute cartoon cat`
- Just send: `A futuristic cityscape at night with neon lights`

## License

ISC 