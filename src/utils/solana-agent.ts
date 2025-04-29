import { SolanaAgentKit } from "solana-agent-kit";
import { createVercelAITools } from "solana-agent-kit";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import config from "../config.js";
import privy, { getUserWallet } from "./privy.js";
import pluginNFT from "@solana-agent-kit/plugin-nft";
import pluginMisc from "@solana-agent-kit/plugin-misc";
import pluginDefi from "@solana-agent-kit/plugin-defi";
import pluginToken from "@solana-agent-kit/plugin-token";
import OpenAI from "openai";

// Define types
interface AgentConfig {
  solanaKit: SolanaAgentKit;
  vercelAITools: any[];
}

interface Wallet {
  id: string;
  address: string;
  [key: string]: any;
}

interface SignedTransaction {
  signatures: string[];
  [key: string]: any;
}

interface TransactionResult {
  signature: string;
}

interface ChatCompletionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Initialize Solana Agent for a specific user
 * @param userId - User ID to identify agent state
 * @returns The agent and its configuration
 */
export async function initializeAgent(userId: string): Promise<AgentConfig> {
  try {
    // Get or create user's wallet using Privy
    const wallet = await getUserWallet(userId);

    // Initialize Solana Agent Kit with Privy server wallet
    const solanaKit = new SolanaAgentKit(
      {
        publicKey: new PublicKey(wallet.address),
        sendTransaction: async (): Promise<string> => {
          return "";
        },
        signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
          const { signature } = await privy.walletApi.solana.signMessage({
            address: wallet.address,
            walletId: wallet.id,
            // @ts-expect-error - chainType is not typed to solana
            chainType: "solana",
            message,
          });
          if (typeof signature === 'string') {
            // Convert hex string to byte array
            const bytes = new Uint8Array((signature as any).match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []);
            return bytes;
          }
          return signature;
        },
        signAllTransactions: async <
          T extends Transaction | VersionedTransaction
        >(
          txs: T[]
        ): Promise<T[]> => {
          const signedTxs = await Promise.all(
            txs.map(async (tx) => {
              const { signedTransaction } =
                await privy.walletApi.solana.signTransaction({
                  address: wallet.address,
                  walletId: wallet.id,
                  // @ts-expect-error - chainType is not typed to solana

                  chainType: "solana",
                  transaction: tx,
                });

              return {
                ...tx,
                signatures: [signedTransaction],
              } as T;
            })
          );

          return signedTxs;
        },
        signTransaction: async <T extends Transaction | VersionedTransaction>(
          tx: T
        ): Promise<T> => {
          const { signedTransaction } =
            await privy.walletApi.solana.signTransaction({
              address: wallet.address,
              walletId: wallet.id,
              // @ts-expect-error - chainType is not typed to solana

              chainType: "solana",
              transaction: tx,
            });

          return {
            ...tx,
            signatures: [signedTransaction],
          } as T;
        },
        signAndSendTransaction: async (
          tx: Transaction | VersionedTransaction
        ): Promise<{ signature: string }> => {
          const { hash } = await privy.walletApi.solana.signAndSendTransaction({
            address: wallet.address,
            caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", // Mainnet Solana
            // @ts-expect-error - chainType is not typed to solana
            chainType: "solana",
            walletId: wallet.id,
            transaction: tx,
          });

          return { signature: hash };
        },
      },
      config.rpcUrl,
      {}
    ).use(pluginNFT).use(pluginMisc).use(pluginDefi);

    // Create Vercel AI tools for the Solana agent
    const vercelAITools = Object.values(
      createVercelAITools(solanaKit, solanaKit.actions)
    );

    return { solanaKit, vercelAITools };
  } catch (error) {
    console.error("Failed to initialize Solana agent:", error);
    throw error;
  }
}

/**
 * Get Vercel AI tools for a user
 * @param userId - User ID
 * @returns Vercel AI tools for the user
 */
export async function getVercelAITools(userId: string): Promise<any[]> {
  const { vercelAITools } = await initializeAgent(userId);
  return vercelAITools;
}

/**
 * Process a user message with the Solana agent using Vercel AI
 * @param userId - User ID
 * @param message - User message
 * @param onTyping - Optional typing callback
 * @returns Agent response
 */
export async function processSolanaMessage(
  userId: string,
  message: string,
  onTyping?: () => Promise<void>
): Promise<string> {
  try {
    // Initialize OpenAI from config
    const openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });

    // Get Solana kit for this user
    const { solanaKit } = await initializeAgent(userId);

    // Create a system prompt
    const systemPrompt = `You are a helpful assistant specializing in Solana blockchain.
You can help users with their Solana-related queries and explain blockchain concepts.
Provide accurate and clear information about Solana's features, tokens, NFTs, and wallets.
If you need to perform an action, use your available tools.
If there is a server error, inform the user to try again later.
If asked to do something you cannot do with your current tools, explain your limitations politely.
Be concise and helpful with your responses.
Do not generate images or handle image-related tasks - those are handled by a different system.`;

    // Extract available actions from solanaKit
    const availableActions: ChatCompletionTool[] = Object.entries(
      solanaKit.actions
    ).map(([name, action]) => {
      return {
        type: "function" as const,
        function: {
          name,
          description:
            action.description || `Perform the ${name} action on Solana`,
          parameters: { type: "object", properties: {} },
        },
      };
    });

    try {
      // Call OpenAI with properly formatted tools
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        tools: availableActions,
        tool_choice: "auto",
        temperature: 0.7,
      });

      // Process tool calls if needed
      let responseContent = completion.choices[0]?.message?.content || "I apologize, but I couldn't process your request at the moment.";
      const toolCalls = completion.choices[0]?.message?.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        // Handle tool calls sequentially
        for (const toolCall of toolCalls) {
          try {
            const actionName = toolCall.function.name;
            const action = (solanaKit.actions as Record<string, any>)[actionName];

            if (!action) {
              responseContent += `\n\nUnable to find tool: ${actionName}`;
              continue;
            }

            // Parse arguments
            const args = JSON.parse(toolCall.function.arguments);

            // Execute the action from solanaKit
            const result = await action(args);

            try {
              // Create a new completion with the tool results
              const followUpCompletion = await openai.chat.completions.create({
                model: "gpt-4-turbo-preview",
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: message },
                  {
                    role: "assistant",
                    content: responseContent,
                    tool_calls: toolCalls,
                  },
                  {
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result),
                  },
                ],
                temperature: 0.7,
              });

              // Update response with follow-up completion
              responseContent = followUpCompletion.choices[0]?.message?.content || responseContent;
            } catch (followUpError) {
              console.error("Error in follow-up completion:", followUpError);
              responseContent += "\n\nI encountered an error while processing the tool results. Please try again.";
            }
          } catch (toolError) {
            console.error("Error executing tool:", toolError);
            responseContent += "\n\nI encountered an error while using one of my tools. Please try again.";
          }
        }
      }

      return responseContent;
    } catch (openaiError) {
      console.error("OpenAI API error:", openaiError);
      return "I apologize, but I'm having trouble processing your request at the moment. Please try again later.";
    }
  } catch (error) {
    console.error("Failed to process Solana message:", error);
    return "I apologize, but I encountered an error while processing your message. Please try again later.";
  }
}

export default {
  initializeAgent,
  getVercelAITools,
  processSolanaMessage,
};
