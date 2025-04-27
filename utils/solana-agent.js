import { SolanaAgentKit, createSolanaTools } from 'solana-agent-kit';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
import config from '../config.js';

/**
 * Initialize Solana Agent for a specific user
 * @param {string} userId - User ID to identify agent state
 * @returns {Object} The agent and its configuration
 */
export async function initializeAgent(userId) {
  try {
    // Initialize ChatGPT model
    const llm = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.7,
      openAIApiKey: config.openaiApiKey,
    });

    // Initialize Solana Agent Kit
    const solanaKit = new SolanaAgentKit(
      config.solanaPrivateKey,
      config.rpcUrl,
      config.openaiApiKey,
    );

    // Create Solana tools
    const tools = createSolanaTools(solanaKit);
    
    // Set up memory for the agent
    const memory = new MemorySaver();
    
    // Configure the agent with the user's thread ID
    const agentConfig = { configurable: { thread_id: userId } };
    
    // Create the agent
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact with Solana blockchain and also generate images.
        You can help users with their Solana-related queries and also generate images based on their prompts.
        If you need funds, you can request them from the user and provide your wallet details.
        If there is a server error, ask the user to try again later.
        If someone asks you to do something you can't do with your currently available tools, 
        you must say so and suggest alternatives if possible.
        Be concise and helpful with your responses.
      `,
    });

    return { agent, config: agentConfig };
  } catch (error) {
    console.error('Failed to initialize Solana agent:', error);
    throw error;
  }
}

/**
 * Process a user message with the Solana agent
 * @param {string} userId - User ID
 * @param {string} message - User message
 * @returns {Promise<string>} Agent response
 */
export async function processSolanaMessage(userId, message) {
  try {
    // Initialize the agent for this user
    const { agent, config } = await initializeAgent(userId);
    
    // Stream the agent's response
    const stream = await agent.stream(
      { messages: [new HumanMessage(message)] },
      config,
    );
    
    // Set a timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 30000),
    );
    
    // Collect all response chunks
    let fullResponse = '';
    
    try {
      // Race the stream against the timeout
      for await (const chunk of await Promise.race([
        stream,
        timeoutPromise,
      ])) {
        if ('agent' in chunk && chunk.agent.messages[0]?.content) {
          const content = String(chunk.agent.messages[0].content);
          fullResponse += content;
        }
      }
      
      return fullResponse.trim();
    } catch (error) {
      if (error.message === 'Timeout') {
        return "I'm sorry, the operation took too long and timed out. Please try again.";
      }
      throw error;
    }
  } catch (error) {
    console.error('Error processing Solana message:', error);
    return "I'm sorry, an error occurred while processing your request.";
  }
}

export default {
  initializeAgent,
  processSolanaMessage,
}; 