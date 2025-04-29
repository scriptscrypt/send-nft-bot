import { createClient, SupabaseClient } from '@supabase/supabase-js';
import config from '../config.js';

// Define types
interface ImageData {
  user_id: string;
  filename: string;
  prompt: string;
  path: string;
  url: string;
  created_at: string;
}

interface UserData {
  telegram_id: string;
  wallet_address: string;
  wallet_id: string;
  is_wallet_delegated: boolean;
  created_at: string;
  updated_at: string;
}

// Initialize Supabase client
const supabase: SupabaseClient = createClient(config.supabaseUrl, config.supabaseKey);

/**
 * Store an image in Supabase storage
 * @param imageBuffer - The image buffer
 * @param filename - The filename
 * @param userId - The user ID
 * @param prompt - The prompt used to generate the image
 * @returns The stored image data
 */
async function storeImage(
  imageBuffer: Buffer,
  filename: string,
  userId: string,
  prompt: string
): Promise<ImageData> {
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
 * @param userId - The user ID
 * @returns The user's images
 */
async function getUserImages(userId: string): Promise<ImageData[]> {
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
 * @param userId - Telegram user ID
 * @param walletData - Wallet data to store
 * @returns The stored wallet data
 */
async function storeUserWallet(
  userId: string,
  walletData: { address: string; id: string }
): Promise<UserData> {
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
 * @param userId - Telegram user ID
 * @returns User wallet data or null if not found
 */
async function getUserWallet(userId: string): Promise<UserData | null> {
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
 * @param userId - Telegram user ID
 * @param isDelegated - Whether the wallet is delegated
 * @returns Updated user data
 */
async function updateWalletDelegation(
  userId: string,
  isDelegated: boolean
): Promise<UserData> {
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

// Export the supabase client as default
export default supabase;

// Export all utility functions as named exports
export {
  storeImage,
  getUserImages,
  storeUserWallet,
  getUserWallet,
  updateWalletDelegation
}; 