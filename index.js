// Import ESM compatibility fix first
import './utils/patches/fix-esm.js';

import { Telegraf, Markup } from 'telegraf';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import http from 'http';
import config from './config.js';
import supabase, { storeImage, getUserImages } from './utils/supabase.js';
import { processSolanaMessage } from './utils/patches/solana-agent-patched.js';
import { 
  createUserWallet, 
  getUserWallet, 
  exportWallet, 
  isWalletDelegated, 
  delegateWallet,
  revokeWallet 
} from './utils/privy.js';

// Create a simple HTTP server for healthchecks
const PORT = process.env.PORT || 3006;
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
    { command: '/gen', description: 'Generate an image from a prompt' },
    { command: '/myimages', description: 'View your generated images' },
    { command: '/wallet', description: 'Manage your Solana wallet' },
    { command: '/help', description: 'Show available commands' },
  ];
  
  // Set bot commands globally to ensure menu is updated for all users
  bot.telegram.setMyCommands(commands);
  
  // Send welcome message with inline buttons
  ctx.reply('Welcome to Solana Image Generation Bot! I can generate images and help with Solana blockchain.',
    Markup.inlineKeyboard([
      [Markup.button.callback('Generate Image', 'request_image'), Markup.button.callback('Wallet Settings', 'open_wallet')],
      [Markup.button.callback('My Images', 'view_images'), Markup.button.callback('Help', 'show_help')]
    ])
  );
});

// Handle 'Generate Image' button press
bot.action('request_image', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Please send me your image prompt or use /gen [prompt]');
});

// Handle 'Wallet Settings' button press
bot.action('open_wallet', async (ctx) => {
  await ctx.answerCbQuery();
  
  // Re-use the wallet command logic
  const userId = ctx.from.id.toString();
  
  // Check if user has a delegated wallet (for server sessions)
  const hasDelegatedWallet = await isWalletDelegated(userId);
  
  // Create buttons for wallet actions
  const walletButtons = Markup.inlineKeyboard([
    [Markup.button.callback('Create Wallet', 'wallet:create')],
    [Markup.button.callback('View Address', 'wallet:view')],
    [Markup.button.callback('Export Private Key', 'wallet:export')],
    [hasDelegatedWallet 
      ? Markup.button.callback('Revoke Server Session', 'wallet:revoke') 
      : Markup.button.callback('Enable Server Session', 'wallet:delegate')],
    [Markup.button.callback('« Back to Menu', 'back_to_menu')]
  ]);
  
  await ctx.reply('Manage your Solana wallet:', walletButtons);
});

// Handle 'My Images' button press
bot.action('view_images', async (ctx) => {
  await ctx.answerCbQuery();
  
  // Re-use the myimages command logic
  const userId = ctx.from.id.toString();
  
  // Get the user's images from Supabase
  const images = await getUserImages(userId);
  
  if (!images || images.length === 0) {
    return ctx.reply('You have no stored images yet. Use /gen or send an image prompt to create some!', 
      Markup.inlineKeyboard([
        [Markup.button.callback('« Back to Menu', 'back_to_menu')]
      ])
    );
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
  
  await ctx.reply(message, 
    Markup.inlineKeyboard([
      [Markup.button.callback('« Back to Menu', 'back_to_menu')]
    ])
  );
});

// Handle 'Help' button press
bot.action('show_help', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(`
I can help you with:

🖼 Generating images from your text descriptions
👛 Managing your Solana wallet
🔗 Interacting with the Solana blockchain
🌐 Answering questions about Solana, NFTs, and crypto

Use these commands:
/gen [prompt] - Generate an image
/myimages - View your stored images
/wallet - Manage your Solana wallet
  `,
    Markup.inlineKeyboard([
      [Markup.button.callback('« Back to Menu', 'back_to_menu')]
    ])
  );
});

// Handle back to menu button
bot.action('back_to_menu', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('What would you like to do?',
    Markup.inlineKeyboard([
      [Markup.button.callback('Generate Image', 'request_image'), Markup.button.callback('Wallet Settings', 'open_wallet')],
      [Markup.button.callback('My Images', 'view_images'), Markup.button.callback('Help', 'show_help')]
    ])
  );
});

// Generate image command (renamed to /gen)
bot.command('gen', async (ctx) => {
  const prompt = ctx.message.text.replace('/gen', '').trim();
  const userId = ctx.from.id.toString();
  
  if (!prompt) {
    // If no prompt is provided, ask user to provide one
    return ctx.reply('Please provide a prompt for your image. Example: A beautiful sunset');
  } else {
    // Prompt was provided, show image type options
    return ctx.reply(`Please select image type for: "${prompt}"`, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Standard', `genstandard:${encodeURIComponent(prompt)}`),
          Markup.button.callback('Transparent BG', `gentransparent:${encodeURIComponent(prompt)}`)
        ]
      ])
    );
  }
});

// Handle callback for standard image generation
bot.action(/genstandard:(.+)/, async (ctx) => {
  try {
    const prompt = decodeURIComponent(ctx.match[1]);
    const userId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('Generating standard image...');
    
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

// Handle callback for transparent background image generation
bot.action(/gentransparent:(.+)/, async (ctx) => {
  try {
    const prompt = decodeURIComponent(ctx.match[1]);
    const userId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('Generating transparent image...');
    
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

// Handle regular text as image prompts or Solana queries
bot.on('text', async (ctx) => {
  // Skip if it's a command
  if (ctx.message.text.startsWith('/')) {
    // Handle /gen command directly if it passes through (sometimes Telegram handles commands inconsistently)
    if (ctx.message.text.startsWith('/gen ')) {
      const prompt = ctx.message.text.replace('/gen', '').trim();
      // Show image type options
      return ctx.reply(`Please select image type for: "${prompt}"`, 
        Markup.inlineKeyboard([
          [
            Markup.button.callback('Standard', `genstandard:${encodeURIComponent(prompt)}`),
            Markup.button.callback('Transparent BG', `gentransparent:${encodeURIComponent(prompt)}`)
          ]
        ])
      );
    }
    return; // Skip other commands
  }
  
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
  
  const text = ctx.message.text;
  const userId = ctx.from.id.toString();
  
  // If user is in a Generate Image flow 
  if (ctx.session && ctx.session.awaitingImagePrompt) {
    // Clear the session state
    ctx.session.awaitingImagePrompt = false;
    
    // Show image type options
    return ctx.reply(`Please select image type for: "${text}"`, 
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Standard', `genstandard:${encodeURIComponent(text)}`),
          Markup.button.callback('Transparent BG', `gentransparent:${encodeURIComponent(text)}`)
        ]
      ])
    );
  }
  
  // For all other text messages, use Solana agent
  // Send typing indicator
  await ctx.replyWithChatAction('typing');
  
  // Process with Solana agent
  const response = await processSolanaMessage(userId, text);
  
  // Send the response to the user
  await ctx.reply(response);
});

// Set session state when user requests image generation
bot.action('request_image', (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.awaitingImagePrompt = true;
  ctx.answerCbQuery();
  ctx.reply('Please send me your image prompt:', 
    Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Cancel', 'back_to_menu')]
    ])
  );
});

// Handle wallet action callbacks
bot.action(/wallet:(.*)/, async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    const action = ctx.match[1];
    
    switch (action) {
      case 'create':
        // Create a new wallet for the user
        await ctx.answerCbQuery('Creating your wallet...');
        const newWallet = await createUserWallet(userId);
        await ctx.reply(`✅ New Solana wallet created!\n\nAddress: \`${newWallet.address}\``, { parse_mode: 'Markdown' });
        break;
        
      case 'view':
        // View wallet address
        await ctx.answerCbQuery('Fetching your wallet...');
        const wallet = await getUserWallet(userId);
        await ctx.reply(`Your Solana wallet address:\n\n\`${wallet.address}\``, { parse_mode: 'Markdown' });
        break;
        
      case 'export':
        // Warning before exporting private key
        await ctx.answerCbQuery('Preparing to export...');
        const warningMsg = await ctx.reply(
          '⚠️ WARNING: Your private key is sensitive information!\n\n' +
          'Never share it with anyone and store it securely.\n\n' +
          'Do you want to continue?',
          Markup.inlineKeyboard([
            Markup.button.callback('Yes, export my key', 'wallet:confirm_export'),
            Markup.button.callback('Cancel', 'wallet:cancel_export')
          ])
        );
        
        // Store message ID for later deletion
        ctx.session.warningMessageId = warningMsg.message_id;
        break;
        
      case 'confirm_export':
        // Export the private key
        await ctx.answerCbQuery('Exporting private key...');
        
        // Delete the warning message for security
        if (ctx.session.warningMessageId) {
          await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.warningMessageId);
          delete ctx.session.warningMessageId;
        }
        
        const exportData = await exportWallet(userId);
        
        // Send private key in a way that auto-deletes after viewing
        await ctx.reply(
          '🔑 Here is your private key:\n\n' +
          `\`${exportData.privateKey}\`\n\n` +
          'This message will be deleted in 60 seconds for security.',
          { 
            parse_mode: 'Markdown',
          }
        ).then(message => {
          // Delete the message after 60 seconds
          setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat.id, message.message_id)
              .catch(e => console.error('Failed to delete key message:', e));
          }, 60000);
        });
        break;
        
      case 'cancel_export':
        // Cancel export operation
        await ctx.answerCbQuery('Export cancelled');
        
        // Delete the warning message
        if (ctx.session.warningMessageId) {
          await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.warningMessageId);
          delete ctx.session.warningMessageId;
        }
        
        await ctx.reply('Private key export cancelled.');
        break;
        
      case 'delegate':
        // Enable server sessions for wallet
        await ctx.answerCbQuery('Enabling server session...');
        
        try {
          const wallet = await getUserWallet(userId);
          const success = await delegateWallet(userId);
          
          if (success) {
            await ctx.reply(
              '🔄 Server session functionality enabled!\n\n' +
              'Your wallet can now be used for transactions initiated by the server.'
            );
          } else {
            await ctx.reply('Sorry, there was an error enabling server sessions. Please try again later.');
          }
        } catch (error) {
          console.error('Error delegating wallet:', error);
          await ctx.reply('Sorry, there was an error enabling server sessions. Please try again later.');
        }
        break;
        
      case 'revoke':
        // Revoke server sessions for wallet
        await ctx.answerCbQuery('Revoking server session...');
        
        try {
          const success = await revokeWallet(userId);
          
          if (success) {
            await ctx.reply(
              '✅ Server session access revoked!\n\n' +
              'The server can no longer use your wallet for transactions.'
            );
          } else {
            await ctx.reply('Sorry, there was an error revoking server sessions. Please try again later.');
          }
        } catch (error) {
          console.error('Error revoking wallet session:', error);
          await ctx.reply('Sorry, there was an error revoking server sessions. Please try again later.');
        }
        break;
    }
  } catch (error) {
    console.error('Error with wallet action:', error);
    await ctx.reply('Sorry, there was an error processing your wallet request. Please try again later.');
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

// Add wallet command back to maintain command functionality
bot.command('wallet', async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    
    // Check if user has a delegated wallet (for server sessions)
    const hasDelegatedWallet = await isWalletDelegated(userId);
    
    // Create buttons for wallet actions
    const walletButtons = Markup.inlineKeyboard([
      [Markup.button.callback('Create Wallet', 'wallet:create')],
      [Markup.button.callback('View Address', 'wallet:view')],
      [Markup.button.callback('Export Private Key', 'wallet:export')],
      [hasDelegatedWallet 
        ? Markup.button.callback('Revoke Server Session', 'wallet:revoke') 
        : Markup.button.callback('Enable Server Session', 'wallet:delegate')]
    ]);
    
    await ctx.reply('Manage your Solana wallet:', walletButtons);
  } catch (error) {
    console.error('Error with wallet command:', error);
    ctx.reply('Sorry, there was an error accessing wallet functionality. Please try again later.');
  }
});

// Add myimages command back to maintain command functionality 
bot.command('myimages', async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    
    // Get the user's images from Supabase
    const images = await getUserImages(userId);
    
    if (!images || images.length === 0) {
      return ctx.reply('You have no stored images yet. Use /gen or "Generate Image" to create some!');
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

// Help command
bot.help((ctx) => {
  ctx.reply(`
Available commands:
/gen [prompt] - Generate an image from your prompt (with options for transparent background)
/myimages - Show your previously generated images
/wallet - Manage your Solana wallet
Example: /gen A cat sitting on a beach at sunset

You can also ask me about Solana blockchain or NFTs!
  `,
    Markup.inlineKeyboard([
      [Markup.button.callback('« Back to Menu', 'back_to_menu')]
    ])
  );
}); 