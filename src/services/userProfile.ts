import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../config/supabase';

export interface UserProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  username: string;
  bio: string | null;
  reading_interests: string[];
  profile_photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserProfileData {
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  readingInterests: string[];
}

/**
 * Save user profile data after account creation
 */
export async function saveUserProfile(
  data: CreateUserProfileData
): Promise<{ profile: UserProfile | null; error: any }> {
  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .insert({
        user_id: data.userId,
        first_name: data.firstName,
        last_name: data.lastName,
        username: data.username,
        reading_interests: data.readingInterests,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving user profile:', error);
      return { profile: null, error };
    }

    return { profile: profile as UserProfile, error: null };
  } catch (error) {
    console.error('Exception saving user profile:', error);
    return { profile: null, error };
  }
}

/**
 * Get user profile by user ID
 */
export async function getUserProfile(
  userId: string
): Promise<{ profile: UserProfile | null; error: any }> {
  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return { profile: null, error };
    }

    return { profile: profile as UserProfile, error: null };
  } catch (error) {
    console.error('Exception fetching user profile:', error);
    return { profile: null, error };
  }
}

/**
 * Check if username is available
 */
export async function checkUsernameAvailability(
  username: string
): Promise<{ available: boolean; error: any }> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('username', username.toLowerCase())
      .single();

    if (error) {
      // If error is "PGRST116" (no rows returned), username is available
      if (error.code === 'PGRST116') {
        return { available: true, error: null };
      }
      return { available: false, error };
    }

    // If data exists, username is taken
    return { available: false, error: null };
  } catch (error) {
    console.error('Exception checking username:', error);
    return { available: false, error };
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: {
    firstName?: string;
    lastName?: string;
    username?: string;
    bio?: string | null;
    readingInterests?: string[];
    profilePhotoUrl?: string | null;
  }
): Promise<{ profile: UserProfile | null; error: any }> {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.firstName !== undefined) updateData.first_name = updates.firstName;
    if (updates.lastName !== undefined) updateData.last_name = updates.lastName;
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.bio !== undefined) updateData.bio = updates.bio;
    if (updates.readingInterests !== undefined)
      updateData.reading_interests = updates.readingInterests;
    if (updates.profilePhotoUrl !== undefined)
      updateData.profile_photo_url = updates.profilePhotoUrl;

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      return { profile: null, error };
    }

    return { profile: profile as UserProfile, error: null };
  } catch (error) {
    console.error('Exception updating user profile:', error);
    return { profile: null, error };
  }
}

/**
 * Upload profile photo to Supabase Storage
 * Uses expo-file-system for reliable cross-platform file reading
 */
export async function uploadProfilePhoto(
  userId: string,
  imageUri: string
): Promise<{ url: string | null; error: any }> {
  try {
    console.log('=== UPLOAD PROFILE PHOTO START ===');
    console.log('1. Image URI:', imageUri);
    console.log('2. User ID:', userId);

    // Verify user is authenticated and matches
    const { data: { session } } = await supabase.auth.getSession();
    console.log('3. Session check:', {
      hasSession: !!session,
      sessionUserId: session?.user?.id,
      matches: session?.user?.id === userId,
    });
    
    if (!session || session.user.id !== userId) {
      console.error('3. ERROR: Authentication failed');
      return { url: null, error: new Error('User not authenticated or user ID mismatch') };
    }
    console.log('3. ✓ Authentication OK');

    // Read file using expo-file-system (reliable across all platforms and build types)
    console.log('4. Reading file with FileSystem...');
    console.log('4a. File URI:', imageUri);
    
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: 'base64',
    });

    console.log('5. File read result:', {
      hasBase64: !!base64,
      base64Length: base64?.length || 0,
      firstChars: base64?.substring(0, 50) || 'none',
    });

    if (!base64 || base64.length === 0) {
      console.error('5. ERROR: Base64 is empty!');
      return { url: null, error: new Error('Failed to read image file') };
    }
    console.log('5. ✓ File read successfully, length:', base64.length);

    // Determine file extension and MIME type
    const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const contentType = mimeTypes[fileExt] || 'image/jpeg';
    console.log('6. File info:', { fileExt, contentType });

    // Convert base64 to Uint8Array for upload
    console.log('7. Converting base64 to bytes...');
    console.log('7a. Checking if atob is available:', typeof atob !== 'undefined');
    
    let binaryString: string;
    try {
      if (typeof atob !== 'undefined') {
        binaryString = atob(base64);
        console.log('7b. Used atob, binary string length:', binaryString.length);
      } else {
        console.log('7b. atob not available, using manual decode');
        // Manual base64 decoding
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let output = '';
        let i = 0;
        while (i < base64.length) {
          const enc1 = chars.indexOf(base64.charAt(i++));
          const enc2 = chars.indexOf(base64.charAt(i++));
          const enc3 = chars.indexOf(base64.charAt(i++));
          const enc4 = chars.indexOf(base64.charAt(i++));
          const chr1 = (enc1 << 2) | (enc2 >> 4);
          const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
          const chr3 = ((enc3 & 3) << 6) | enc4;
          output += String.fromCharCode(chr1);
          if (enc3 !== 64) output += String.fromCharCode(chr2);
          if (enc4 !== 64) output += String.fromCharCode(chr3);
        }
        binaryString = output;
        console.log('7b. Manual decode complete, binary string length:', binaryString.length);
      }
    } catch (decodeError) {
      console.error('7. ERROR: Failed to decode base64:', decodeError);
      return { url: null, error: decodeError };
    }

    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    console.log('8. Bytes conversion result:', {
      bytesLength: bytes.length,
      firstBytes: Array.from(bytes.slice(0, 10)),
    });

    if (bytes.length === 0) {
      console.error('8. ERROR: Bytes array is empty!');
      return { url: null, error: new Error('Failed to convert image to bytes') };
    }
    console.log('8. ✓ Bytes conversion successful, length:', bytes.length);

    // Generate unique filename with user folder structure
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;
    console.log('9. Upload path:', filePath);

    // Upload to Supabase Storage
    console.log('10. Uploading to Supabase Storage...');
    console.log('10a. Bucket: profile-photos');
    console.log('10b. Path:', filePath);
    console.log('10c. Content-Type:', contentType);
    console.log('10d. Bytes length:', bytes.length);
    
    const { data, error } = await supabase.storage
      .from('profile-photos')
      .upload(filePath, bytes, {
        contentType,
        upsert: false,
      });

    console.log('11. Upload response:', {
      hasData: !!data,
      hasError: !!error,
      errorMessage: error?.message,
      errorName: error?.name,
      dataPath: data?.path,
    });

    if (error) {
      console.error('11. ERROR: Upload failed:', error);
      return { url: null, error };
    }
    console.log('11. ✓ Upload successful!');

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(filePath);

    console.log('12. Public URL:', urlData.publicUrl);
    console.log('=== UPLOAD PROFILE PHOTO SUCCESS ===');
    return { url: urlData.publicUrl, error: null };
  } catch (error) {
    console.error('=== EXCEPTION IN UPLOAD PROFILE PHOTO ===');
    console.error('Error:', error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
    return { url: null, error };
  }
}

/**
 * Delete profile photo from Supabase Storage
 */
export async function deleteProfilePhoto(
  photoUrl: string
): Promise<{ success: boolean; error: any }> {
  try {
    // Extract file path from URL
    const urlParts = photoUrl.split('/profile-photos/');
    if (urlParts.length < 2) {
      return { success: false, error: 'Invalid photo URL' };
    }

    const filePath = `profile-photos/${urlParts[1]}`;

    // Delete from Supabase Storage
    const { error } = await supabase.storage
      .from('profile-photos')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting profile photo:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception deleting profile photo:', error);
    return { success: false, error };
  }
}

/**
 * Search members by username, first name, or last name
 * Returns public profile fields only
 */
export async function searchMembers(
  query: string
): Promise<{ members: Array<{
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  profile_photo_url: string | null;
}>; error: any }> {
  try {
    const searchTerm = `%${query}%`;
    
    // Use .or() with PostgREST syntax: column.operator.value,column2.operator.value2
    // Note: ilike is case-insensitive, so we don't need toLowerCase
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, username, first_name, last_name, profile_photo_url')
      .or(`username.ilike.${searchTerm},first_name.ilike.${searchTerm},last_name.ilike.${searchTerm}`)
      .limit(20);

    if (error) {
      console.error('Error searching members:', error);
      return { members: [], error };
    }

    return { members: data || [], error: null };
  } catch (error) {
    console.error('Exception searching members:', error);
    return { members: [], error };
  }
}

/**
 * Check if a user follows another user
 */
export async function checkFollowStatus(
  followerId: string,
  followingId: string
): Promise<{ isFollowing: boolean; error: any }> {
  try {
    const { data, error } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking follow status:', error);
      return { isFollowing: false, error };
    }

    return { isFollowing: !!data, error: null };
  } catch (error) {
    console.error('Exception checking follow status:', error);
    return { isFollowing: false, error };
  }
}

/**
 * Follow a user
 */
export async function followUser(
  followerId: string,
  followingId: string
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('user_follows')
      .insert({
        follower_id: followerId,
        following_id: followingId,
      });

    if (error) {
      console.error('Error following user:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception following user:', error);
    return { success: false, error };
  }
}

/**
 * Unfollow a user
 */
export async function unfollowUser(
  followerId: string,
  followingId: string
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId);

    if (error) {
      console.error('Error unfollowing user:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception unfollowing user:', error);
    return { success: false, error };
  }
}

/**
 * Get list of user IDs that the current user follows
 * Useful for batch checking follow status in search results
 */
export async function getFollowingIds(
  userId: string
): Promise<{ followingIds: string[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (error) {
      console.error('Error fetching following IDs:', error);
      return { followingIds: [], error };
    }

    const followingIds = (data || []).map((row: any) => row.following_id);
    return { followingIds, error: null };
  } catch (error) {
    console.error('Exception fetching following IDs:', error);
    return { followingIds: [], error };
  }
}

/**
 * Get follower count for a user (how many users follow this user)
 */
export async function getFollowerCount(
  userId: string
): Promise<{ count: number; error: any }> {
  try {
    const { count, error } = await supabase
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);

    if (error) {
      console.error('Error fetching follower count:', error);
      return { count: 0, error };
    }

    return { count: count || 0, error: null };
  } catch (error) {
    console.error('Exception fetching follower count:', error);
    return { count: 0, error };
  }
}

/**
 * Get following count for a user (how many users this user follows)
 */
export async function getFollowingCount(
  userId: string
): Promise<{ count: number; error: any }> {
  try {
    const { count, error } = await supabase
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId);

    if (error) {
      console.error('Error fetching following count:', error);
      return { count: 0, error };
    }

    return { count: count || 0, error: null };
  } catch (error) {
    console.error('Exception fetching following count:', error);
    return { count: 0, error };
  }
}
