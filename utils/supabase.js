import { createClient } from '@supabase/supabase-js';
import config from '../config.js';

// Initialize Supabase client
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

/**
 * Store an image in Supabase storage
 * @param {Buffer} imageBuffer - The image buffer
 * @param {string} filename - The filename
 * @param {string} userId - The user ID
 * @param {string} prompt - The prompt used to generate the image
 * @returns {Promise<Object>} The stored image data
 */
export async function storeImage(imageBuffer, filename, userId, prompt) {
  try {
    // 1. Upload the image to Supabase Storage
    const { data: storageData, error: storageError } = await supabase
      .storage
      .from('images')
      .upload(`${userId}/${filename}`, imageBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (storageError) {
      console.error('Storage error:', storageError);
      throw storageError;
    }

    // 2. Get the public URL for the uploaded image
    const { data: { publicUrl } } = supabase
      .storage
      .from('images')
      .getPublicUrl(`${userId}/${filename}`);

    // 3. Store image metadata in the database
    const { data: dbData, error: dbError } = await supabase
      .from('images')
      .insert([
        {
          user_id: userId,
          filename: filename,
          prompt: prompt,
          path: `${userId}/${filename}`,
          url: publicUrl,
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    return {
      ...dbData[0],
      url: publicUrl
    };
  } catch (error) {
    console.error('Error storing image:', error);
    throw error;
  }
}

/**
 * Get all images for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} The user's images
 */
export async function getUserImages(userId) {
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user images:', error);
    throw error;
  }

  return data;
}

/**
 * Stores user wallet information in the database
 * @param {string} userId - Telegram user ID
 * @param {Object} walletData - Wallet data to store
 * @returns {Promise<Object>} The stored wallet data
 */
export async function storeUserWallet(userId, walletData) {
  try {
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', userId)
      .single();
    
    if (existingUser) {
      // Update existing user
      const { data, error } = await supabase
        .from('users')
        .update({
          wallet_address: walletData.address,
          wallet_id: walletData.id,
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', userId)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    } else {
      // Create new user
      const { data, error } = await supabase
        .from('users')
        .insert({
          telegram_id: userId,
          wallet_address: walletData.address,
          wallet_id: walletData.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
        
      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('Error storing user wallet:', error);
    throw error;
  }
}

/**
 * Gets a user's wallet information from the database
 * @param {string} userId - Telegram user ID
 * @returns {Promise<Object|null>} User wallet data or null if not found
 */
export async function getUserWallet(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', userId)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - user not found
        return null;
      }
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error getting user wallet:', error);
    throw error;
  }
}

/**
 * Updates user wallet delegation status
 * @param {string} userId - Telegram user ID
 * @param {boolean} isDelegated - Whether the wallet is delegated
 * @returns {Promise<Object>} Updated user data
 */
export async function updateWalletDelegation(userId, isDelegated) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        is_wallet_delegated: isDelegated,
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', userId)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating wallet delegation:', error);
    throw error;
  }
}

export default {
  ...supabase,
  storeImage,
  getUserImages,
  storeUserWallet,
  getUserWallet,
  updateWalletDelegation
}; 