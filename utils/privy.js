import { PrivyClient } from "@privy-io/server-auth";
import config from '../config.js';
import { getUserWallet as getDbUserWallet, storeUserWallet, updateWalletDelegation } from './supabase.js';

// Initialize Privy client
export const privyClient = new PrivyClient(
  config.privyAppId,
  config.privyAppSecret
);

/**
 * Create a new wallet for a user with Privy
 * @param {string} userId - Telegram user ID to associate with the wallet
 * @returns {Promise<Object>} Created wallet object
 */
export async function createUserWallet(userId) {
  try {
    // Create a Solana wallet for the user
    const wallet = await privyClient.walletApi.createWallet({
      chainType: "solana"
    });
    
    // Store the wallet information in our database
    await storeUserWallet(userId, wallet);
    
    return wallet;
  } catch (error) {
    console.error('Error creating Privy wallet:', error);
    throw error;
  }
}

/**
 * Get a user's wallet, or create one if it doesn't exist
 * @param {string} userId - Telegram user ID
 * @returns {Promise<Object>} The user's wallet
 */
export async function getUserWallet(userId) {
  try {
    // Check database first
    const dbUser = await getDbUserWallet(userId);
    
    if (dbUser && dbUser.wallet_id) {
      try {
        // Try to get the existing wallet from Privy
        const wallet = await privyClient.walletApi.getWallet({ id: dbUser.wallet_id });
        return wallet;
      } catch (error) {
        console.log('Error retrieving wallet from Privy, creating a new one:', error);
        // If wallet retrieval fails, create a new one
        return await createUserWallet(userId);
      }
    } else {
      // User doesn't have a wallet yet, create one
      return await createUserWallet(userId);
    }
  } catch (error) {
    console.error('Error getting/creating user wallet:', error);
    throw error;
  }
}

/**
 * Export a user's wallet private key
 * @param {string} userId - Telegram user ID
 * @returns {Promise<Object>} Wallet export information including private key
 */
export async function exportWallet(userId) {
  try {
    // Get the user's wallet from database
    const dbUser = await getDbUserWallet(userId);
    
    if (!dbUser || !dbUser.wallet_id) {
      throw new Error('User does not have a wallet');
    }
    
    // Export the private key
    const exportResult = await privyClient.walletApi.exportWallet({
      walletId: dbUser.wallet_id,
      chainType: "solana"
    });
    
    return exportResult;
  } catch (error) {
    console.error('Error exporting wallet:', error);
    throw error;
  }
}

/**
 * Check if a wallet is delegated for server sessions
 * @param {string} userId - Telegram user ID
 * @returns {Promise<boolean>} True if wallet is delegated
 */
export async function isWalletDelegated(userId) {
  try {
    // Get user from database
    const dbUser = await getDbUserWallet(userId);
    
    if (!dbUser) {
      return false;
    }
    
    return dbUser.is_wallet_delegated || false;
  } catch (error) {
    console.error('Error checking wallet delegation:', error);
    return false;
  }
}

/**
 * Simulate wallet delegation for server sessions
 * @param {string} userId - Telegram user ID
 * @returns {Promise<boolean>} True if delegation was successful
 */
export async function delegateWallet(userId) {
  try {
    // In a real implementation, this would involve a frontend UI component
    // For now, we'll just update the database to mark the wallet as delegated
    await updateWalletDelegation(userId, true);
    return true;
  } catch (error) {
    console.error('Error delegating wallet:', error);
    return false;
  }
}

/**
 * Revoke server session for a wallet
 * @param {string} userId - Telegram user ID
 * @returns {Promise<boolean>} True if revocation was successful
 */
export async function revokeWallet(userId) {
  try {
    // Update database to mark wallet as not delegated
    await updateWalletDelegation(userId, false);
    return true;
  } catch (error) {
    console.error('Error revoking wallet session:', error);
    return false;
  }
}

export default {
  privyClient,
  createUserWallet,
  getUserWallet,
  exportWallet,
  isWalletDelegated,
  delegateWallet,
  revokeWallet
}; 