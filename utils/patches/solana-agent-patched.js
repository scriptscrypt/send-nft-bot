import { SolanaAgentKit, createVercelAITools } from "solana-agent-kit";
import { PublicKey } from "@solana/web3.js";
import config from "../../config.js";
import { getUserWallet, privyClient } from "../privy.js";
import pluginNFT from "@solana-agent-kit/plugin-nft";
import { getSolanaAgentConfig, getOpenZeppelinABI } from './solana-abi-loader.js';

// Load TokenPlugin dynamically to avoid direct JSON imports in newer Node.js
let TokenPlugin = null;
try {
  // Dynamic import with optional chaining to handle possible failure
  TokenPlugin = (await import('@solana-agent-kit/plugin-token')).default;
  console.log('Successfully loaded TokenPlugin');
} catch (error) {
  console.warn('Could not load TokenPlugin directly:', error.message);
  console.log('Will initialize without TokenPlugin');
}

/**
 * Initialize Solana Agent for a specific user
 * @param {string} userId - User ID to identify agent state
 * @returns {Promise<Object>} The agent and its configuration
 */
export async function initializeAgent(userId) {
  try {
    // Get or create user's wallet using Privy
    const wallet = await getUserWallet(userId);

    // Get any additional configurations needed
    const safeConfig = getSolanaAgentConfig();

    // Initialize Solana Agent Kit with Privy server wallet
    let solanaKit = new SolanaAgentKit(
      {
        publicKey: new PublicKey(wallet.address),
        sendTransaction: async () => {
          return "";
        },
        signMessage: async (message) => {
          const { signature } = await privyClient.walletApi.solana.signMessage({
            address: wallet.address,
            walletId: wallet.id,
            chainType: "solana",
            message,
          });
          return signature;
        },
        signAllTransactions: async (txs) => {
          const signedTxs = await Promise.all(
            txs.map(async (tx) => {
              const { signedTransaction } =
                await privyClient.walletApi.solana.signTransaction({
                  address: wallet.address,
                  walletId: wallet.id,
                  chainType: "solana",
                  transaction: tx,
                });

              return {
                ...tx,
                signatures: [signedTransaction],
              };
            })
          );

          return signedTxs;
        },
        signTransaction: async (tx) => {
          const { signedTransaction } =
            await privyClient.walletApi.solana.signTransaction({
              address: wallet.address,
              walletId: wallet.id,
              chainType: "solana",
              transaction: tx,
            });

          return signedTransaction;
        },
        signAndSendTransaction: async (tx) => {
          const { hash } =
            await privyClient.walletApi.solana.signAndSendTransaction({
              address: wallet.address,
              caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", // Mainnet Solana
              chainType: "solana",
              walletId: wallet.id,
              transaction: tx,
            });

          return { signature: hash };
        },
      },
      config.rpcUrl,
      safeConfig
    ).use(pluginNFT);
    
    // Apply TokenPlugin if it was successfully loaded
    if (TokenPlugin) {
      solanaKit = solanaKit.use(TokenPlugin);
    }
    // Uncomment if needed and token limit allows
    // .use(MiscPlugin);

    return { solanaKit };
  } catch (error) {
    console.error("Failed to initialize Solana agent:", error);
    throw error;
  }
}

/**
 * Get Vercel AI tools for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Vercel AI tools for the user
 */
export async function getVercelAITools(userId) {
  const { solanaKit } = await initializeAgent(userId);
  const vercelAITools = createVercelAITools(solanaKit, solanaKit.actions);
  return vercelAITools;
}

/**
 * Process a user message with the Solana agent using Vercel AI
 * @param {string} userId - User ID
 * @param {string} message - User message
 * @returns {Promise<string>} Agent response
 */
export async function processSolanaMessage(userId, message) {
  try {
    // Initialize OpenAI
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    
    // Get Solana kit for this user
    const { solanaKit } = await initializeAgent(userId);
    
    // System prompt
    const systemPrompt = `You are a helpful assistant specializing in Solana blockchain.
You can help users with their Solana-related queries and explain blockchain concepts.
Provide accurate and clear information about Solana's features, tokens, NFTs, and wallets.
If you need to perform an action, use your available tools.
If there is a server error, inform the user to try again later.
If asked to do something you cannot do with your current tools, explain your limitations politely.
Be concise and helpful with your responses.`;

    // Create messages array
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ];

    // Prepare tools in the correct format for OpenAI
    const formattedTools = Object.entries(solanaKit.actions || {}).map(([name, action]) => {
      return {
        type: "function",
        function: {
          name,
          description: action.description || `Perform the ${name} action on Solana`,
          parameters: action.parameters || { type: "object", properties: {} }
        }
      };
    });

    // Use OpenAI with properly formatted tools
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      tools: formattedTools,
      tool_choice: "auto",
      temperature: 0.7,
    });

    // Get initial response
    let responseContent = response.choices[0].message.content || "";
    const toolCalls = response.choices[0].message.tool_calls || [];
    
    // If there are tool calls, process them
    if (toolCalls.length > 0) {
      // Create a new messages array including the assistant's response with tool calls
      const updatedMessages = [
        ...messages,
        {
          role: "assistant",
          content: responseContent || null,
          tool_calls: toolCalls
        }
      ];
      
      // Process each tool call
      for (const toolCall of toolCalls) {
        try {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments || "{}");
          
          // Execute the action using the SolanaAgentKit
          let toolResult;
          if (solanaKit.actions && typeof solanaKit.actions[functionName] === 'function') {
            toolResult = await solanaKit.actions[functionName](functionArgs);
          } else {
            toolResult = { error: `Function ${functionName} not available` };
          }
          
          // Add the tool result to messages
          updatedMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          });
        } catch (error) {
          console.error(`Error executing tool ${toolCall.function.name}:`, error);
          // Add error result to messages
          updatedMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: error.message })
          });
        }
      }
      
      // Get the final response with tool results
      const finalResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: updatedMessages,
        temperature: 0.7,
      });
      
      // Update response
      responseContent = finalResponse.choices[0].message.content || "I processed your request, but couldn't generate a response.";
    }

    return responseContent;
  } catch (error) {
    console.error("Error processing Solana message:", error);
    return "I'm sorry, an error occurred while processing your request. Please try again later.";
  }
}

export default {
  initializeAgent,
  getVercelAITools,
  processSolanaMessage,
};