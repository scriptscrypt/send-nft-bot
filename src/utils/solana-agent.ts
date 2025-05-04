import { SolanaAgentKit } from "solana-agent-kit";
import { createVercelAITools } from "solana-agent-kit";
import {
  PublicKey,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import config from "../config.js";
import privy, { getUserWallet } from "./privy.js";
import pluginNFT from "@solana-agent-kit/plugin-nft";
import pluginMisc from "@solana-agent-kit/plugin-misc";
// import pluginDefi from "@solana-agent-kit/plugin-defi";
import pluginToken from "@solana-agent-kit/plugin-token";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Initialize Solana Agent for a specific user
 * @param userId - User ID to identify agent state
 * @returns The agent and its configuration
 */
export async function initializeAgent(userId: string) {
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
            // @ts-expect-error Privy types are wrong
            chainType: "solana",
            message,
          });
          if (typeof signature === "string") {
            // Convert hex string to byte array
            const bytes = new Uint8Array(
              (signature as any)
                .match(/.{1,2}/g)
                ?.map((byte: string) => Number.parseInt(byte, 16)) || []
            );
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
                  // @ts-expect-error Privy types are wrong
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
              // @ts-expect-error Privy types are wrong
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
            // @ts-expect-error Privy types are wrong
            chainType: "solana",
            walletId: wallet.id,
            transaction: tx,
          });

          return { signature: hash };
        },
      },
      config.rpcUrl,
      {}
    )
      .use(pluginNFT)
      .use(pluginMisc)
      .use(pluginToken);

    // Create Vercel AI tools for the Solana agent
    const vercelAITools = createVercelAITools(solanaKit, solanaKit.actions);

    return { solanaKit, vercelAITools };
  } catch (error) {
    console.error("Failed to initialize Solana agent:", error);
    throw error;
  }
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
    const openai = createOpenAI({ apiKey: config.openaiApiKey });

    const { vercelAITools } = await initializeAgent(userId);

    const systemPrompt = `You are a helpful assistant specializing in Solana blockchain.
You can help users with their Solana-related queries and explain blockchain concepts.
Provide accurate and clear information about Solana's features, tokens, NFTs, and wallets.
If you need to perform an action, use your available tools.
If there is a server error, inform the user to try again later.
If asked to do something you cannot do with your current tools, explain your limitations politely.
Be concise and helpful with your responses.
Do not generate images or handle image-related tasks - those are handled by a different system.

if the user asks to generate image, ask him to use the image generation tool - /gen <prompt> command`;

    try {
      const response = await generateText({
        model: openai("gpt-4o-mini"),
        temperature: 0.7,
        maxSteps: 5,
        tools: vercelAITools,
        messages: [
          {
            role: "user",
            content: message,
          },
        ],
        system: systemPrompt,
      });

      // Log the full response from the agent kit tool call
      console.log("[Solana AgentKit] Full tool call response:", JSON.stringify(response, null, 2));

      const completion = response.text;

      if (onTyping) {
        await onTyping();
      }

      return completion ?? "I apologize, but I couldn't generate a response.";
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
  processSolanaMessage,
};
