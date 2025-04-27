import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import config from './config.js';

// Create output directory if it doesn't exist
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir);
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

// Initialize Telegram bot
const bot = new Telegraf(config.telegramToken);

// Bot start command
bot.start((ctx) => {
  ctx.reply('Welcome to Image Generation Bot! Send me a prompt like "/generate A beautiful sunset" and I\'ll create an image for you.');
});

// Help command
bot.help((ctx) => {
  ctx.reply(`
Available commands:
/generate [prompt] - Generate an image from your prompt
/transparent [prompt] - Generate an image with transparent background
Example: /generate A cat sitting on a beach at sunset
  `);
});

// Generate image command
bot.command('generate', async (ctx) => {
  try {
    const prompt = ctx.message.text.replace('/generate', '').trim();
    
    if (!prompt) {
      return ctx.reply('Please provide a prompt. Example: /generate A beautiful sunset');
    }
    
    // Send "generating" message
    const statusMessage = await ctx.reply('🎨 Generating your image, please wait...');
    
    // Generate the image
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      quality: "low",
    });
    
    // Get the image as base64
    const image_base64 = result.data[0].b64_json;
    const image_bytes = Buffer.from(image_base64, "base64");
    
    // Save the image locally
    const filename = `image_${Date.now()}.png`;
    const filepath = path.join(config.outputDir, filename);
    fs.writeFileSync(filepath, image_bytes);
    
    // Send the image to the user
    await ctx.replyWithPhoto({ source: image_bytes });
    
    // Delete the status message
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
    
  } catch (error) {
    console.error('Error generating image:', error);
    ctx.reply('Sorry, there was an error generating your image. Please try again later.');
  }
});

// Generate transparent image command
bot.command('transparent', async (ctx) => {
  try {
    const prompt = ctx.message.text.replace('/transparent', '').trim();
    
    if (!prompt) {
      return ctx.reply('Please provide a prompt. Example: /transparent A cute cartoon dog');
    }
    
    // Send "generating" message
    const statusMessage = await ctx.reply('🎨 Generating transparent image, please wait...');
    
    // Generate the image with transparent background
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      background: "transparent",
      quality: "low",
    });
    
    // Get the image as base64
    const image_base64 = result.data[0].b64_json;
    const image_bytes = Buffer.from(image_base64, "base64");
    
    // Save the image locally
    const filename = `transparent_${Date.now()}.png`;
    const filepath = path.join(config.outputDir, filename);
    fs.writeFileSync(filepath, image_bytes);
    
    // Send the image to the user
    await ctx.replyWithPhoto({ source: image_bytes });
    
    // Delete the status message
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
    
  } catch (error) {
    console.error('Error generating transparent image:', error);
    ctx.reply('Sorry, there was an error generating your image. Please try again later.');
  }
});

// Handle regular text as image prompts
bot.on('text', async (ctx) => {
  // Skip if it's a command
  if (ctx.message.text.startsWith('/')) return;
  
  try {
    const prompt = ctx.message.text;
    
    // Send "generating" message
    const statusMessage = await ctx.reply('🎨 Generating your image, please wait...');
    
    // Generate the image
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      quality: "low",
    });
    
    // Get the image as base64
    const image_base64 = result.data[0].b64_json;
    const image_bytes = Buffer.from(image_base64, "base64");
    
    // Save the image locally
    const filename = `image_${Date.now()}.png`;
    const filepath = path.join(config.outputDir, filename);
    fs.writeFileSync(filepath, image_bytes);
    
    // Send the image to the user
    await ctx.replyWithPhoto({ source: image_bytes });
    
    // Delete the status message
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
    
  } catch (error) {
    console.error('Error generating image:', error);
    ctx.reply('Sorry, there was an error generating your image. Please try again later.');
  }
});

// Handle errors
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('An error occurred with the bot. Please try again later.');
});

// Start the bot
bot.launch().then(() => {
  console.log('Bot is running!');
}).catch(err => {
  console.error('Failed to start bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 