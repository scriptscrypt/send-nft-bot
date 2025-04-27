// Import ESM compatibility fix first
import './fix-esm.js';

import { Telegraf, Markup } from 'telegraf';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import http from 'http';
import config from './config.js';
import supabase, { storeImage, getUserImages } from './utils/supabase.js';
import { processSolanaMessage } from './utils/solana-agent.js';

// Create a simple HTTP server for healthchecks
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Telegram Bot is running!');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT} for healthchecks`);
});

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

// Add session middleware for storing state
bot.use((ctx, next) => {
  ctx.session = ctx.session || {};
  return next();
});

// Bot start command
bot.start((ctx) => {
  const commands = [
    { command: '/generate', description: 'Generate an image from a prompt' },
    { command: '/transparent', description: 'Generate an image with transparent background' },
    { command: '/myimages', description: 'View your generated images' },
    { command: '/help', description: 'Show available commands' },
  ];
  
  // Set bot commands
  ctx.telegram.setMyCommands(commands);
  
  ctx.reply('Welcome to Solana Image Generation Bot! I can generate images and help with Solana blockchain.\n\n' +
    'Commands:\n' +
    '/generate [prompt] - Generate an image\n' +
    '/transparent [prompt] - Generate an image with transparent background\n' +
    '/myimages - View your stored images\n' +
    '/help - See all commands\n\n' +
    'For Solana help, just ask me anything about Solana!');
});

// Help command
bot.help((ctx) => {
  ctx.reply(`
Available commands:
/generate [prompt] - Generate an image from your prompt
/transparent [prompt] - Generate an image with transparent background
/myimages - Show your previously generated images
Example: /generate A cat sitting on a beach at sunset

You can also ask me about Solana blockchain or NFTs!
  `);
});

// Generate image command
bot.command('generate', async (ctx) => {
  try {
    const prompt = ctx.message.text.replace('/generate', '').trim();
    const userId = ctx.from.id.toString();
    
    if (!prompt) {
      return ctx.reply('Please provide a prompt. Example: /generate A beautiful sunset');
    }
    
    // Send "generating" message
    const statusMessage = await ctx.reply('🎨 Generating your image, please wait...');
    
    // Generate the image
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      quality: "auto",
    });
    
    // Get the image as base64
    const image_base64 = result.data[0].b64_json;
    const image_bytes = Buffer.from(image_base64, "base64");
    
    // Save the image locally
    const filename = `image_${Date.now()}.png`;
    const filepath = path.join(config.outputDir, filename);
    fs.writeFileSync(filepath, image_bytes);
    
    // Store the image in Supabase
    const storedImage = await storeImage(image_bytes, filename, userId, prompt);
    
    // Send the image to the user with buttons
    await ctx.replyWithPhoto(
      { source: image_bytes },
      {
        caption: `Image generated: "${prompt}"`,
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('Launch on Pump', `pump:${storedImage.id}`),
            Markup.button.callback('Mint to Collection', `mint:${storedImage.id}`)
          ]
        ])
      }
    );
    
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
    const userId = ctx.from.id.toString();
    
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
      quality: "auto",
    });
    
    // Get the image as base64
    const image_base64 = result.data[0].b64_json;
    const image_bytes = Buffer.from(image_base64, "base64");
    
    // Save the image locally
    const filename = `transparent_${Date.now()}.png`;
    const filepath = path.join(config.outputDir, filename);
    fs.writeFileSync(filepath, image_bytes);
    
    // Store the image in Supabase
    const storedImage = await storeImage(image_bytes, filename, userId, prompt);
    
    // Send the image to the user with buttons
    await ctx.replyWithPhoto(
      { source: image_bytes },
      {
        caption: `Transparent image generated: "${prompt}"`,
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('Launch on Pump', `pump:${storedImage.id}`),
            Markup.button.callback('Mint to Collection', `mint:${storedImage.id}`)
          ]
        ])
      }
    );
    
    // Delete the status message
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
    
  } catch (error) {
    console.error('Error generating transparent image:', error);
    ctx.reply('Sorry, there was an error generating your image. Please try again later.');
  }
});

// View stored images command
bot.command('myimages', async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    
    // Get the user's images from Supabase
    const images = await getUserImages(userId);
    
    if (!images || images.length === 0) {
      return ctx.reply('You have no stored images yet. Use /generate or /transparent to create some!');
    }
    
    // Show the most recent 5 images
    const recentImages = images.slice(0, 5);
    
    // Create a message with image links
    let message = '🖼️ Your most recent images:\n\n';
    
    recentImages.forEach((image, index) => {
      message += `${index + 1}. "${image.prompt}"\n${image.url}\n\n`;
    });
    
    if (images.length > 5) {
      message += `...and ${images.length - 5} more images.`;
    }
    
    await ctx.reply(message);
    
  } catch (error) {
    console.error('Error fetching images:', error);
    ctx.reply('Sorry, there was an error fetching your images. Please try again later.');
  }
});

// Handle regular text as image prompts or Solana queries
bot.on('text', async (ctx) => {
  // Skip if it's a command
  if (ctx.message.text.startsWith('/')) return;
  
  // Check if we're waiting for a collection address
  if (ctx.session && ctx.session.pendingMintImageId) {
    const collectionAddress = ctx.message.text.trim();
    const imageId = ctx.session.pendingMintImageId;
    const userId = ctx.from.id.toString();
    
    // Clear the pending state
    ctx.session.pendingMintImageId = null;
    
    // Validate Solana address format (very basic check)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(collectionAddress)) {
      // If this doesn't look like a Solana address, treat as regular message
      // Continue to the normal text processing below
    } else {
      await ctx.reply('🔨 Minting your NFT to the specified collection. Please wait...');
      
      // Get image details from Supabase
      const { data: imageData, error } = await supabase
        .from('images')
        .select('*')
        .eq('id', imageId)
        .single();
        
      if (error) {
        console.error('Error fetching image:', error);
        return ctx.reply('Sorry, I could not find the image data. Please try again.');
      }
      
      // Construct a prompt for Solana Agent
      const solanaPrompt = `I want to mint my image as an NFT to an existing collection:
  - Collection address: ${collectionAddress}
  - NFT name: Based on my image prompt: "${imageData.prompt}"
  - Image URL: ${imageData.url}
  - Please use default values for other parameters
  - Walk me through the process step by step

  Please mint my NFT to this collection using your tools. Provide me with the transaction details and NFT explorer link when complete.`;
      
      // Send typing indicator
      await ctx.replyWithChatAction('typing');
      
      // Process with Solana agent
      const response = await processSolanaMessage(userId, solanaPrompt);
      
      // Send the response to the user
      await ctx.reply(response, { parse_mode: 'Markdown' });
      
      return;
    }
  }
  
  const text = ctx.message.text.toLowerCase();
  const userId = ctx.from.id.toString();
  
  // Check if the message is related to Solana
  if (text.includes('solana') || text.includes('blockchain') || text.includes('crypto') || 
      text.includes('nft') || text.includes('wallet') || text.includes('token')) {
    
    // Send typing indicator
    await ctx.replyWithChatAction('typing');
    
    // Process with Solana agent
    const response = await processSolanaMessage(userId, ctx.message.text);
    return ctx.reply(response);
  }
  
  // Otherwise, treat as image generation prompt
  try {
    const prompt = ctx.message.text;
    
    // Send "generating" message
    const statusMessage = await ctx.reply('🎨 Generating your image, please wait...');
    
    // Generate the image
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      quality: "auto",
    });
    
    // Get the image as base64
    const image_base64 = result.data[0].b64_json;
    const image_bytes = Buffer.from(image_base64, "base64");
    
    // Save the image locally
    const filename = `image_${Date.now()}.png`;
    const filepath = path.join(config.outputDir, filename);
    fs.writeFileSync(filepath, image_bytes);
    
    // Store the image in Supabase
    const storedImage = await storeImage(image_bytes, filename, userId, prompt);
    
    // Send the image to the user with buttons
    await ctx.replyWithPhoto(
      { source: image_bytes },
      {
        caption: `Image generated: "${prompt}"`,
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('Launch on Pump', `pump:${storedImage.id}`),
            Markup.button.callback('Mint to Collection', `mint:${storedImage.id}`)
          ]
        ])
      }
    );
    
    // Delete the status message
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
    
  } catch (error) {
    console.error('Error generating image:', error);
    ctx.reply('Sorry, there was an error generating your image. Please try again later.');
  }
});

// Handle button callbacks
bot.action(/pump:(.+)/, async (ctx) => {
  try {
    const imageId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('Preparing to launch on Pump...');
    await ctx.reply('🚀 Preparing to launch your token on Pump. Please wait while I set this up...');
    
    // Get image details from Supabase
    const { data: imageData, error } = await supabase
      .from('images')
      .select('*')
      .eq('id', imageId)
      .single();
      
    if (error) {
      console.error('Error fetching image:', error);
      return ctx.reply('Sorry, I could not find the image data. Please try again.');
    }
    
    // Construct a prompt for Solana Agent
    const solanaPrompt = `I want to launch a token on Solana with the following details:
- Token name: Based on my image prompt: "${imageData.prompt}"
- Image URL: ${imageData.url}
- Please use default values for other parameters like supply (e.g. 1 million tokens)
- Walk me through the process step by step

Please launch this token using your tools and provide me with the transaction details when complete.`;
    
    // Send typing indicator
    await ctx.replyWithChatAction('typing');
    
    // Process with Solana agent
    const response = await processSolanaMessage(userId, solanaPrompt);
    
    // Send the response to the user
    await ctx.reply(response, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error launching token:', error);
    const errorMessage = error.message || 'Unknown error';
    await ctx.reply(`Sorry, there was an error launching your token: ${errorMessage}\n\nPlease try again later.`);
  }
});

bot.action(/mint:(.+)/, async (ctx) => {
  try {
    const imageId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('Preparing to mint as NFT...');
    
    // First message - ask if creating new collection or minting to existing
    await ctx.reply('🖼️ NFT Options', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Create New Collection & Mint', callback_data: `newcol:${imageId}` }],
          [{ text: 'Mint to Existing Collection', callback_data: `existcol:${imageId}` }]
        ]
      }
    });
    
  } catch (error) {
    console.error('Error starting mint process:', error);
    const errorMessage = error.message || 'Unknown error';
    await ctx.reply(`Sorry, there was an error: ${errorMessage}\n\nPlease try again later.`);
  }
});

// Handle new collection creation and mint
bot.action(/newcol:(.+)/, async (ctx) => {
  try {
    const imageId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('Creating new collection...');
    await ctx.reply('🔨 Creating a new collection and minting your NFT. Please wait...');
    
    // Get image details from Supabase
    const { data: imageData, error } = await supabase
      .from('images')
      .select('*')
      .eq('id', imageId)
      .single();
      
    if (error) {
      console.error('Error fetching image:', error);
      return ctx.reply('Sorry, I could not find the image data. Please try again.');
    }
    
    // Construct a prompt for Solana Agent
    const solanaPrompt = `I want to create a new NFT collection on Solana and mint my image as an NFT:
- Collection name: Based on my image prompt: "${imageData.prompt}" Collection
- NFT name: Based on my image prompt: "${imageData.prompt}"
- Image URL: ${imageData.url}
- Please use default values for royalties (e.g. 5%)
- Walk me through the process step by step

Please create this collection and mint my NFT using your tools. Provide me with the transaction details and NFT explorer link when complete.`;
    
    // Send typing indicator
    await ctx.replyWithChatAction('typing');
    
    // Process with Solana agent
    const response = await processSolanaMessage(userId, solanaPrompt);
    
    // Send the response to the user
    await ctx.reply(response, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error creating collection and minting:', error);
    const errorMessage = error.message || 'Unknown error';
    await ctx.reply(`Sorry, there was an error: ${errorMessage}\n\nPlease try again later.`);
  }
});

// Handle minting to existing collection
bot.action(/existcol:(.+)/, async (ctx) => {
  try {
    const imageId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('Preparing to mint to existing collection...');
    await ctx.reply('Please send me the collection address where you want to mint your NFT.');
    
    // Store the image ID in session to use it when the user sends the collection address
    ctx.session = ctx.session || {};
    ctx.session.pendingMintImageId = imageId;
    
  } catch (error) {
    console.error('Error preparing mint to existing collection:', error);
    const errorMessage = error.message || 'Unknown error';
    await ctx.reply(`Sorry, there was an error: ${errorMessage}\n\nPlease try again later.`);
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