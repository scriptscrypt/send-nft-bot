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

export default supabase; 