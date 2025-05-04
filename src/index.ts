import { Telegraf, Markup, type Context } from "telegraf";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import config from "./config";
import { storeImage, getUserImages } from "./utils/supabase.js";
import {
  createUserWallet,
  getUserWallet,
  exportWallet,
  isWalletDelegated,
  delegateWallet,
  revokeWallet,
} from "./utils/privy.js";
import { processSolanaMessage } from "./utils/solana-agent.js";
import { experimental_generateImage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import fetch from "node-fetch";
import FormData from "form-data";


// Define types
interface BotContext extends Context {
  session?: {
    [key: string]: any;
  };
}

interface ImageData {
  id: string;
  user_id: string;
  filename: string;
  prompt: string;
  path: string;
  url: string;
  created_at: string;
}

// Create a simple HTTP server for healthchecks
const PORT = process.env.PORT || 3007;
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Telegram Bot is running!");
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT} for healthchecks`);
});

// Create output directory if it doesn't exist
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir);
}

// Initialize Telegram bot
const bot = new Telegraf<BotContext>(config.telegramToken);

// Add session middleware for storing state
bot.use((ctx, next) => {
  ctx.session = ctx.session || {};
  return next();
});

// Bot start command
bot.start((ctx) => {
  const commands = [
    { command: "/gen", description: "Generate an image from a prompt" },
    { command: "/myimages", description: "View your generated images" },
    { command: "/wallet", description: "Manage your Solana wallet" },
    { command: "/help", description: "Show available commands" },
  ];

  // Set bot commands globally to ensure menu is updated for all users
  bot.telegram.setMyCommands(commands);

  // Send welcome message with inline buttons
  ctx.reply(
    "Welcome to Solana Image Generation Bot! I can generate images and help with Solana blockchain.",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("Generate Image", "request_image"),
        Markup.button.callback("Wallet Settings", "open_wallet"),
      ],
      [
        Markup.button.callback("My Images", "view_images"),
        Markup.button.callback("Help", "show_help"),
      ],
    ])
  );
});

// Handle 'Generate Image' button press
bot.action("request_image", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("Please send me your image prompt or use /gen [prompt]");
});

// Handle 'Wallet Settings' button press
bot.action("open_wallet", async (ctx) => {
  await ctx.answerCbQuery();

  // Re-use the wallet command logic
  const userId = ctx.from.id.toString();

  // Check if user has a delegated wallet (for server sessions)
  const hasDelegatedWallet = await isWalletDelegated(userId);

  // Create buttons for wallet actions
  const walletButtons = Markup.inlineKeyboard([
    [Markup.button.callback("Create Wallet", "wallet:create")],
    [Markup.button.callback("View Address", "wallet:view")],
    [Markup.button.callback("Export Private Key", "wallet:export")],
    [
      hasDelegatedWallet
        ? Markup.button.callback("Revoke Server Session", "wallet:revoke")
        : Markup.button.callback("Enable Server Session", "wallet:delegate"),
    ],
    [Markup.button.callback("« Back to Menu", "back_to_menu")],
  ]);

  await ctx.reply("Manage your Solana wallet:", walletButtons);
});

// Handle 'My Images' button press
bot.action("view_images", async (ctx) => {
  await ctx.answerCbQuery();

  // Re-use the myimages command logic
  const userId = ctx.from.id.toString();

  // Get the user's images from Supabase
  const images = await getUserImages(userId);

  if (!images || images.length === 0) {
    return ctx.reply(
      "You have no stored images yet. Use /gen or send an image prompt to create some!",
      Markup.inlineKeyboard([
        [Markup.button.callback("« Back to Menu", "back_to_menu")],
      ])
    );
  }

  // Show the most recent 5 images
  const recentImages = images.slice(0, 5);

  // Create a message with image links
  let message = "🖼️ Your most recent images:\n\n";

  recentImages.forEach((image, index) => {
    message += `${index + 1}. "${image.prompt}"\n${image.url}\n\n`;
  });

  if (images.length > 5) {
    message += `...and ${images.length - 5} more images.`;
  }

  await ctx.reply(
    message,
    Markup.inlineKeyboard([
      [Markup.button.callback("« Back to Menu", "back_to_menu")],
    ])
  );
});

// Handle 'Help' button press
bot.action("show_help", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(
    `
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
      [Markup.button.callback("« Back to Menu", "back_to_menu")],
    ])
  );
});

// Handle back to menu button
bot.action("back_to_menu", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(
    "What would you like to do?",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("Generate Image", "request_image"),
        Markup.button.callback("Wallet Settings", "open_wallet"),
      ],
      [
        Markup.button.callback("My Images", "view_images"),
        Markup.button.callback("Help", "show_help"),
      ],
    ])
  );
});

// Generate image command (renamed to /gen)
bot.command("gen", async (ctx) => {
  const prompt = ctx.message.text.replace("/gen", "").trim();
  const userId = ctx.from.id.toString();

  if (!prompt) {
    // If no prompt is provided, ask user to provide one
    return ctx.reply(
      "Please provide a prompt for your image. Example: A beautiful sunset"
    );
  }
  // Prompt was provided, show image type options
  return ctx.reply(
    `Please select image type for: "${prompt}"`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "Standard",
          `genstandard:${encodeURIComponent(prompt)}`
        ),
        Markup.button.callback(
          "Transparent BG",
          `gentransparent:${encodeURIComponent(prompt)}`
        ),
      ],
    ])
  );
});

// Handle callback for standard image generation
bot.action(/genstandard:(.+)/, async (ctx) => {
  try {
    const prompt = decodeURIComponent(ctx.match[1]);
    const userId = ctx.from.id.toString();

    await ctx.answerCbQuery("Generating standard image...");

    // Send "generating" message
    const statusMessage = await ctx.reply(
      "🎨 Generating your image, please wait..."
    );

    const openai = createOpenAI({
      apiKey: config.openaiApiKey,
    });

    const result = await experimental_generateImage({
      model: openai.image("gpt-image-1"),
      prompt,
    });
    // Generate the image
    // const result = await openai.images.generate({
    //   model: "gpt-image-1",
    //   prompt,
    //   quality: "auto",
    // });

    if (!result.image) {
      throw new Error("No image data received from OpenAI");
    }

    // Get the image as base64
    const image_base64 = result.image.base64;
    const image_bytes = Buffer.from(image_base64, "base64");

    // Save the image locally
    const filename = `image_${Date.now()}.png`;
    const filepath = path.join(config.outputDir, filename);
    fs.writeFileSync(filepath, image_bytes);

    // Store the image in Supabase
    const storedImage = (await storeImage(
      image_bytes,
      filename,
      userId,
      prompt
    )) as ImageData;

    if (!ctx.chat) {
      throw new Error("Chat context is missing");
    }

    // Send the image to the user with buttons
    await ctx.replyWithPhoto(
      { source: image_bytes },
      {
        caption: `Image generated: "${prompt}"\n\n[View Image](${storedImage.url})`,
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("Create NFT Collection", `create_collection:${storedImage.id}`),
            Markup.button.callback("Mint to Specific Collection", `mint_specific:${storedImage.id}`),
          ],
        ]),
      }
    );

    // Delete the status message
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
  } catch (error) {
    console.error("Error generating image:", error);
    ctx.reply(
      "Sorry, there was an error generating your image. Please try again later."
    );
  }
});

// Handle callback for transparent background image generation
bot.action(/gentransparent:(.+)/, async (ctx) => {
  try {
    const prompt = decodeURIComponent(ctx.match[1]);
    const userId = ctx.from.id.toString();

    await ctx.answerCbQuery("Generating transparent image...");

    // Send "generating" message
    const statusMessage = await ctx.reply(
      "🎨 Generating your transparent image, please wait..."
    );

    const openai = createOpenAI({
      apiKey: config.openaiApiKey,
    });

    // Generate the image with transparent background
    const result = await experimental_generateImage({
      model: openai.image("gpt-image-1"),
      prompt,
      providerOptions: {
        openai: {
          transparent: true,
        },
      },
    });
    if (!result.image) {
      throw new Error("No image data received from OpenAI");
    }

    // Get the image as base64
    const image_base64 = result.image.base64;
    const image_bytes = Buffer.from(image_base64, "base64");

    // Save the image locally
    const filename = `image_${Date.now()}.png`;
    const filepath = path.join(config.outputDir, filename);
    fs.writeFileSync(filepath, image_bytes);

    // Store the image in Supabase
    const storedImage = (await storeImage(
      image_bytes,
      filename,
      userId,
      prompt
    )) as ImageData;

    if (!ctx.chat) {
      throw new Error("Chat context is missing");
    }

    // Send the image to the user with buttons
    await ctx.replyWithPhoto(
      { source: image_bytes },
      {
        caption: `Image generated: "${prompt}"\n\n[View Image](${storedImage.url})`,
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("Create NFT Collection", `create_collection:${storedImage.id}`),
            Markup.button.callback("Mint to Specific Collection", `mint_specific:${storedImage.id}`),
          ],
        ]),
      }
    );

    // Delete the status message
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
  } catch (error) {
    console.error("Error generating transparent image:", error);
    ctx.reply(
      "Sorry, there was an error generating your image. Please try again later."
    );
  }
});

// Handle wallet creation
bot.action("wallet:create", async (ctx) => {
  try {
    await ctx.answerCbQuery("Creating wallet...");
    const userId = ctx.from.id.toString();

    // Create a new wallet
    const wallet = await createUserWallet(userId);

    await ctx.reply(
      `✅ Wallet created successfully!\n\nAddress: ${wallet.address}\n\nKeep this address safe. You can use it to receive SOL and NFTs.`,
      Markup.inlineKeyboard([
        [Markup.button.callback("« Back to Wallet Menu", "open_wallet")],
      ])
    );
  } catch (error) {
    console.error("Error creating wallet:", error);
    ctx.reply(
      "Sorry, there was an error creating your wallet. Please try again later."
    );
  }
});

// Handle wallet address viewing
bot.action("wallet:view", async (ctx) => {
  try {
    await ctx.answerCbQuery("Fetching wallet address...");
    const userId = ctx.from.id.toString();

    // Get the user's wallet
    const wallet = await getUserWallet(userId);

    if (!wallet) {
      return ctx.reply(
        "You don't have a wallet yet. Create one first!",
        Markup.inlineKeyboard([
          [Markup.button.callback("Create Wallet", "wallet:create")],
          [Markup.button.callback("« Back to Wallet Menu", "open_wallet")],
        ])
      );
    }

    await ctx.reply(
      `Your wallet address:\n\n${wallet.address}\n\nUse this address to receive SOL and NFTs.`,
      Markup.inlineKeyboard([
        [Markup.button.callback("« Back to Wallet Menu", "open_wallet")],
      ])
    );
  } catch (error) {
    console.error("Error viewing wallet:", error);
    ctx.reply(
      "Sorry, there was an error viewing your wallet. Please try again later."
    );
  }
});

// Handle wallet export
bot.action("wallet:export", async (ctx) => {
  try {
    await ctx.answerCbQuery("Exporting wallet...");
    const userId = ctx.from.id.toString();

    // Export the wallet
    const exportData = await exportWallet(userId);

    if (!exportData) {
      return ctx.reply(
        "You don't have a wallet yet. Create one first!",
        Markup.inlineKeyboard([
          [Markup.button.callback("Create Wallet", "wallet:create")],
          [Markup.button.callback("« Back to Wallet Menu", "open_wallet")],
        ])
      );
    }

    // Send the private key in a private message
    await ctx.reply(
      `⚠️ IMPORTANT: Keep this private key secure and never share it with anyone!\n\nPrivate Key: ${exportData.privateKey}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("« Back to Wallet Menu", "open_wallet")],
      ])
    );
  } catch (error) {
    console.error("Error exporting wallet:", error);
    ctx.reply(
      "Sorry, there was an error exporting your wallet. Please try again later."
    );
  }
});

// Handle wallet delegation
bot.action("wallet:delegate", async (ctx) => {
  try {
    await ctx.answerCbQuery("Enabling server session...");
    const userId = ctx.from.id.toString();

    // Delegate the wallet
    const success = await delegateWallet(userId);

    if (success) {
      await ctx.reply(
        "✅ Server session enabled successfully! You can now use advanced features.",
        Markup.inlineKeyboard([
          [Markup.button.callback("« Back to Wallet Menu", "open_wallet")],
        ])
      );
    } else {
      throw new Error("Failed to enable server session");
    }
  } catch (error) {
    console.error("Error delegating wallet:", error);
    ctx.reply(
      "Sorry, there was an error enabling the server session. Please try again later."
    );
  }
});

// Handle wallet revocation
bot.action("wallet:revoke", async (ctx) => {
  try {
    await ctx.answerCbQuery("Revoking server session...");
    const userId = ctx.from.id.toString();

    // Revoke the wallet
    const success = await revokeWallet(userId);

    if (success) {
      await ctx.reply(
        "✅ Server session revoked successfully!",
        Markup.inlineKeyboard([
          [Markup.button.callback("« Back to Wallet Menu", "open_wallet")],
        ])
      );
    } else {
      throw new Error("Failed to revoke server session");
    }
  } catch (error) {
    console.error("Error revoking wallet:", error);
    ctx.reply(
      "Sorry, there was an error revoking the server session. Please try again later."
    );
  }
});

// Update Create NFT Collection handler to include metadata upload and agent call
bot.action(/create_collection:(.+)/, async (ctx) => {
  let statusMessage: any = null;
  try {
    const imageId = ctx.match[1];
    await ctx.answerCbQuery("Starting NFT Collection creation...");
    const userId = ctx.from.id.toString();
    const images = await getUserImages(userId);
    const image = images.find((img) => img.id === imageId);
    if (!image) {
      console.log(`[NFT Collection] Image not found for user ${userId}, imageId: ${imageId}`);
      return ctx.reply(
        "Image not found.",
        Markup.inlineKeyboard([
          [Markup.button.callback("« Back to Menu", "back_to_menu")],
        ])
      );
    }
    // 1. Notify user: Uploading image to Pinata
    console.log(`[NFT Collection] Uploading image to Pinata for user ${userId}, image: ${image.filename}`);
    statusMessage = await ctx.reply("📤 Uploading image to Pinata...");
    // Download the image from Supabase URL
    const imageResponse = await fetch(image.url);
    if (!imageResponse.ok) throw new Error("Failed to download image for Pinata upload");
    const imageBuffer = await imageResponse.buffer();
    // Upload image to Pinata
    const pinataImageUrl = await uploadToPinata(imageBuffer, image.filename);
    console.log(`[NFT Collection] Image uploaded to Pinata: ${pinataImageUrl}`);
    // 2. Notify user: Uploading metadata to Pinata
    await ctx.telegram.deleteMessage(ctx.chat!.id, statusMessage.message_id);
    statusMessage = await ctx.reply("📝 Uploading metadata to Pinata...");
    // Create metadata object
    const meta = {
      name: image.prompt,
      symbol: image.prompt,
      description: image.prompt,
      image: pinataImageUrl,
      attributes: [
        {
          trait_type: "Total Supply",
          value: "1000000000"
        }
      ]
    };
    // Upload metadata to Pinata
    console.log(`[NFT Collection] Uploading metadata to Pinata for user ${userId}`);
    const pinataMetaUrl = await uploadMetadataToPinata(meta);
    console.log(`[NFT Collection] Metadata uploaded to Pinata: ${pinataMetaUrl}`);
    // Store metadata URI in session
    ctx.session!.lastMetadataUri = pinataMetaUrl;
    // 3. Notify user: Creating NFT Collection on Solana
    await ctx.telegram.deleteMessage(ctx.chat!.id, statusMessage.message_id);
    statusMessage = await ctx.reply("🚀 Creating NFT Collection on Solana using your metadata URI...");
    // Compose prompt for Solana agent
    const agentPrompt = `Please create an NFT collection using this metadata URI: ${pinataMetaUrl}\nName: ${image.prompt}\nUse default values for all other fields.`;
    console.log(`[NFT Collection] Calling Solana agent for user ${userId} with prompt: ${agentPrompt}`);
    const response = await processSolanaMessage(userId, agentPrompt);
    console.log(`[NFT Collection] Agent response for user ${userId}: ${response}`);
    await ctx.telegram.deleteMessage(ctx.chat!.id, statusMessage.message_id);
    await ctx.reply(
      response,
      Markup.inlineKeyboard([
        [Markup.button.callback("« Back to Menu", "back_to_menu")],
      ])
    );
  } catch (error) {
    if (statusMessage && ctx.chat) {
      try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id); } catch {}
    }
    console.error("Error creating NFT collection:", error);
    ctx.reply(
      "Sorry, there was an error creating the NFT collection. Please try again later.",
      Markup.inlineKeyboard([
        [Markup.button.callback("« Back to Menu", "back_to_menu")],
      ])
    );
  }
});

// Add Mint to Specific Collection handler
bot.action(/mint_specific:(.+)/, async (ctx) => {
  try {
    const imageId = ctx.match[1];
    await ctx.answerCbQuery("Mint to Specific Collection...");
    const userId = ctx.from.id.toString();
    // Store the imageId in session to await collection address
    ctx.session!.awaitingCollectionAddress = { imageId };
    await ctx.reply(
      "Please reply with the collection address where you want to mint this NFT.",
      Markup.inlineKeyboard([
        [Markup.button.callback("Cancel", "cancel_mint_specific")],
      ])
    );
  } catch (error) {
    console.error("Error preparing mint to specific collection:", error);
    ctx.reply(
      "Sorry, there was an error. Please try again later."
    );
  }
});

// Cancel mint to specific collection
bot.action("cancel_mint_specific", async (ctx) => {
  ctx.session!.awaitingCollectionAddress = undefined;
  await ctx.reply(
    "Mint to specific collection cancelled.",
    Markup.inlineKeyboard([
      [Markup.button.callback("« Back to Menu", "back_to_menu")],
    ])
  );
});

// Handle user reply with collection address
bot.on("text", async (ctx, next) => {
  if (ctx.session!.awaitingCollectionAddress) {
    const userId = ctx.from.id.toString();
    const { imageId } = ctx.session!.awaitingCollectionAddress;
    const collectionAddress = ctx.message.text.trim();
    // Validate address (basic check)
    if (!/^\w{32,44}$/.test(collectionAddress)) {
      return ctx.reply("That doesn't look like a valid collection address. Please try again or press Cancel.");
    }
    const images = await getUserImages(userId);
    const image = images.find((img) => img.id === imageId);
    if (!image) {
      ctx.session!.awaitingCollectionAddress = undefined;
      return ctx.reply(
        "Image not found.",
        Markup.inlineKeyboard([
          [Markup.button.callback("« Back to Menu", "back_to_menu")],
        ])
      );
    }
    const mintPrompt = `${image.prompt}\n\nMint this image as an NFT to collection ${collectionAddress} with the url: ${image.url}`;
    const response = await processSolanaMessage(userId, mintPrompt);
    ctx.session!.awaitingCollectionAddress = undefined;
    await ctx.reply(
      response,
      Markup.inlineKeyboard([
        [Markup.button.callback("« Back to Menu", "back_to_menu")],
      ])
    );
    return;
  }
  // Check for metadata/uri usage
  if (/using the metadata ?\/ ?uri from previous message/i.test(ctx.message.text)) {
    const userId = ctx.from.id.toString();
    const lastUri = ctx.session!.lastMetadataUri;
    if (!lastUri) {
      return ctx.reply(
        "No metadata URI found from previous message. Please create NFT metadata first.",
        Markup.inlineKeyboard([
          [Markup.button.callback("« Back to Menu", "back_to_menu")],
        ])
      );
    }
    // Compose prompt for Solana agent
    const agentPrompt = `Please create an NFT collection using this metadata URI: ${lastUri}`;
    const response = await processSolanaMessage(userId, agentPrompt);
    await ctx.reply(
      response,
      Markup.inlineKeyboard([
        [Markup.button.callback("« Back to Menu", "back_to_menu")],
      ])
    );
    return;
  }
  // If not awaiting collection address or metadata/uri, continue to next handler
  return next();
});

// Handle text messages for image generation
bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id.toString();

  // Check if the message starts with a command
  if (text.startsWith("/")) {
    return;
  }

  // For non-command messages, use Solana Agent Kit
  try {
    // Start typing indicator
    await ctx.sendChatAction("typing");

    // Create a typing callback that will be called periodically
    const typingCallback = async () => {
      await ctx.sendChatAction("typing");
    };

    // Set up an interval to keep the typing indicator active
    const typingInterval = setInterval(typingCallback, 5000);

    try {
      const response = await processSolanaMessage(userId, text, typingCallback);
      await ctx.reply(response);
    } finally {
      // Clear the typing interval
      clearInterval(typingInterval);
    }
  } catch (error) {
    console.error("Error processing Solana message:", error);
    await ctx.reply(
      "Sorry, there was an error processing your message. Please try again later."
    );
  }
});

// Pinata upload helpers
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "https://api.pinata.cloud";

async function uploadToPinata(buffer: Buffer, filename: string): Promise<string> {
  if (!PINATA_JWT) throw new Error("Pinata JWT not set in environment");
  const data = new FormData();
  data.append("file", buffer, { filename });
  const res = await fetch(`${PINATA_GATEWAY}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      ...data.getHeaders(),
    },
    body: data,
  });
  if (!res.ok) throw new Error("Failed to upload image to Pinata");
  const result = await res.json();
  // Return gateway URL
  return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
}

async function uploadMetadataToPinata(metadata: object): Promise<string> {
  if (!PINATA_JWT) throw new Error("Pinata JWT not set in environment");
  const res = await fetch(`${PINATA_GATEWAY}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) throw new Error("Failed to upload metadata to Pinata");
  const result = await res.json();
  return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
}

// Handle errors
bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  ctx.reply("Sorry, an error occurred. Please try again later.");
});

// Start the bot
bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
