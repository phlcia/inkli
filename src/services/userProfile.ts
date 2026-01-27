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
  account_type: 'public' | 'private';
  created_at: string;
  updated_at: string;
}

export interface UserSummary {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  profile_photo_url: string | null;
}

export type AccountType = 'public' | 'private';

export type FollowRequestStatus = 'pending' | 'accepted' | 'rejected';

export type FollowAction = 'following' | 'requested';

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
    const { error } = await supabase
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

    // If no error, username is taken
    return { available: false, error: null };
  } catch (error) {
    console.error('Exception checking username:', error);
    return { available: false, error };
  }
}

export async function checkIfFollowing(
  followerId: string,
  followingId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .single();

    return !!data && !error;
  } catch (error) {
    return false;
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

export async function getAccountType(
  userId: string
): Promise<{ accountType: AccountType; error: any }> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('account_type')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching account type:', error);
      return { accountType: 'public', error };
    }

    return { accountType: (data?.account_type || 'public') as AccountType, error: null };
  } catch (error) {
    console.error('Exception fetching account type:', error);
    return { accountType: 'public', error };
  }
}

export async function updateAccountType(
  userId: string,
  accountType: AccountType
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({ account_type: accountType })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating account type:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception updating account type:', error);
    return { success: false, error };
  }
}

/**
 * Delete old profile picture from storage before uploading a new one
 * This ensures only one profile picture exists per user
 */
async function deleteOldProfilePicture(userId: string): Promise<{ success: boolean; error: any }> {
  try {
    // Get the current profile to find the existing profile picture path
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('profile_photo_url')
      .eq('user_id', userId)
      .single();

    // Suppress unused variable warning - we check fetchError below
    void profile;

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" - that's OK, means no profile yet
      console.error('Error fetching profile for deletion:', fetchError);
      return { success: false, error: fetchError };
    }

    // If there's an existing profile picture, delete it
    if (profile?.profile_photo_url) {
      const deleteResult = await deleteProfilePhoto(profile.profile_photo_url);
      if (!deleteResult.success) {
        console.warn('Failed to delete old profile picture, but continuing with upload:', deleteResult.error);
        // Don't throw - we can still proceed with upload
        // The old file will remain orphaned but new file will be primary
      } else {
        console.log('✓ Old profile picture deleted successfully');
      }
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception in deleteOldProfilePicture:', error);
    // Don't throw - allow the upload to continue
    return { success: false, error };
  }
}

/**
 * Upload profile photo to Supabase Storage
 * Uses expo-file-system for reliable cross-platform file reading
 * Uses timestamped filename pattern: {userId}/{userId}-{timestamp}.{ext}
 * Deletes old profile picture before uploading new one
 */
export async function uploadProfilePhoto(
  userId: string,
  imageUri: string
): Promise<{ url: string | null; path: string | null; error: any }> {
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
      return { url: null, path: null, error: new Error('User not authenticated or user ID mismatch') };
    }
    console.log('3. ✓ Authentication OK');

    // Get file info to validate type and size
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (!fileInfo.exists) {
      console.error('4. ERROR: File does not exist');
      return { url: null, path: null, error: new Error('Image file does not exist') };
    }

    // Validate file size (max 5MB)
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB
    if (fileInfo.size && fileInfo.size > maxSizeBytes) {
      console.error('4. ERROR: File too large:', fileInfo.size);
      return { url: null, path: null, error: new Error('Image file is too large. Maximum size is 5MB.') };
    }
    console.log('4. ✓ File size OK:', fileInfo.size, 'bytes');

    // Read file using expo-file-system (reliable across all platforms and build types)
    console.log('5. Reading file with FileSystem...');
    console.log('5a. File URI:', imageUri);
    
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: 'base64',
    });

    console.log('6. File read result:', {
      hasBase64: !!base64,
      base64Length: base64?.length || 0,
      firstChars: base64?.substring(0, 50) || 'none',
    });

    if (!base64 || base64.length === 0) {
      console.error('6. ERROR: Base64 is empty!');
      return { url: null, path: null, error: new Error('Failed to read image file') };
    }
    console.log('6. ✓ File read successfully, length:', base64.length);

    // Determine file extension and MIME type from URI
    // Extract extension from URI (handles various formats like file:///path/image.jpg or content://...)
    let fileExt = 'jpg'; // default
    const uriLower = imageUri.toLowerCase();
    const supportedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    
    for (const ext of supportedExtensions) {
      if (uriLower.includes(`.${ext}`)) {
        fileExt = ext === 'jpeg' ? 'jpg' : ext; // normalize jpeg to jpg
        break;
      }
    }

    // Validate file type
    if (!supportedExtensions.includes(fileExt) && !supportedExtensions.includes(fileExt + 'eg')) {
      console.error('7. ERROR: Unsupported file type:', fileExt);
      return { url: null, path: null, error: new Error('Unsupported image format. Please use JPG, PNG, or WEBP.') };
    }

    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const contentType = mimeTypes[fileExt] || 'image/jpeg';
    console.log('7. File info:', { fileExt, contentType });

    // Convert base64 to Uint8Array for upload
    console.log('8. Converting base64 to bytes...');
    console.log('8a. Checking if atob is available:', typeof atob !== 'undefined');
    
    let binaryString: string;
    try {
      if (typeof atob !== 'undefined') {
        binaryString = atob(base64);
        console.log('8b. Used atob, binary string length:', binaryString.length);
      } else {
        console.log('8b. atob not available, using manual decode');
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
        console.log('8b. Manual decode complete, binary string length:', binaryString.length);
      }
    } catch (decodeError) {
      console.error('8. ERROR: Failed to decode base64:', decodeError);
      return { url: null, path: null, error: decodeError };
    }

    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    console.log('9. Bytes conversion result:', {
      bytesLength: bytes.length,
      firstBytes: Array.from(bytes.slice(0, 10)),
    });

    if (bytes.length === 0) {
      console.error('9. ERROR: Bytes array is empty!');
      return { url: null, path: null, error: new Error('Failed to convert image to bytes') };
    }
    console.log('9. ✓ Bytes conversion successful, length:', bytes.length);

    // Step 1: Delete old profile picture before uploading new one
    console.log('10. Deleting old profile picture...');
    const deleteResult = await deleteOldProfilePicture(userId);
    if (deleteResult.error) {
      console.warn('10. Warning: Could not delete old picture, but continuing:', deleteResult.error);
    } else {
      console.log('10. ✓ Old profile picture deletion completed');
    }

    // Step 2: Create timestamped filename pattern: {userId}/{userId}-{timestamp}.{ext}
    const timestamp = Date.now();
    const fileName = `${userId}-${timestamp}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;
    console.log('11. Upload path:', filePath);
    console.log('11a. Timestamped filename:', fileName);

    // Step 3: Upload the new profile picture
    console.log('12. Uploading to Supabase Storage...');
    console.log('12a. Bucket: profile-photos');
    console.log('12b. Path:', filePath);
    console.log('12c. Content-Type:', contentType);
    console.log('12d. Bytes length:', bytes.length);
    
    const { data, error } = await supabase.storage
      .from('profile-photos')
      .upload(filePath, bytes, {
        contentType,
        cacheControl: '3600',
      });

    console.log('13. Upload response:', {
      hasData: !!data,
      hasError: !!error,
      errorMessage: error?.message,
      errorName: error?.name,
      dataPath: data?.path,
    });

    if (error) {
      console.error('13. ERROR: Upload failed:', error);
      return { url: null, path: null, error };
    }
    console.log('13. ✓ Upload successful!');

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(filePath);

    console.log('14. Public URL:', urlData.publicUrl);
    console.log('14a. Storage path:', filePath);
    console.log('=== UPLOAD PROFILE PHOTO SUCCESS ===');
    
    // Return both URL and path - path is stored in DB, URL is for display
    return { url: urlData.publicUrl, path: filePath, error: null };
  } catch (error) {
    console.error('=== EXCEPTION IN UPLOAD PROFILE PHOTO ===');
    console.error('Error:', error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
    return { url: null, path: null, error };
  }
}

/**
 * Delete profile photo from Supabase Storage
 * Works with both full URLs and storage paths
 * Supports both old format ({userId}/profile.{ext}) and new format ({userId}/{userId}-{timestamp}.{ext})
 */
export async function deleteProfilePhoto(
  photoUrlOrPath: string
): Promise<{ success: boolean; error: any }> {
  try {
    let filePath: string;

    // Check if it's a full URL or just a path
    if (photoUrlOrPath.includes('/profile-photos/')) {
      // Extract file path from URL (format: .../profile-photos/{userId}/...)
      const urlParts = photoUrlOrPath.split('/profile-photos/');
      if (urlParts.length < 2) {
        return { success: false, error: 'Invalid photo URL' };
      }
      // Path should be just {userId}/..., not including bucket name
      const pathPart = urlParts[1];
      if (!pathPart) {
        return { success: false, error: 'Invalid photo URL - no path found' };
      }
      filePath = pathPart.split('?')[0] || ''; // Remove query params if any
    } else {
      // Assume it's already a storage path (format: {userId}/...)
      filePath = photoUrlOrPath;
    }

    console.log('Deleting profile photo from path:', filePath);

    // Delete from Supabase Storage
    const { error } = await supabase.storage
      .from('profile-photos')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting profile photo:', error);
      return { success: false, error };
    }

    console.log('✓ Profile photo deleted successfully');
    return { success: true, error: null };
  } catch (error) {
    console.error('Exception deleting profile photo:', error);
    return { success: false, error };
  }
}

/**
 * Get profile picture public URL from storage path or full URL
 * @param profilePicturePathOrUrl Storage path (e.g., "user-123/user-123-1704123456789.jpg") or full URL
 * @returns Public URL or null if path is invalid
 */
export function getProfilePictureUrl(profilePicturePathOrUrl: string | null): string | null {
  if (!profilePicturePathOrUrl) return null;
  
  // If it's already a full URL, return it (for backward compatibility)
  if (profilePicturePathOrUrl.startsWith('http://') || profilePicturePathOrUrl.startsWith('https://')) {
    return profilePicturePathOrUrl;
  }
  
  // Otherwise, generate public URL from storage path
  const { data } = supabase.storage
    .from('profile-photos')
    .getPublicUrl(profilePicturePathOrUrl);
  
  return data.publicUrl;
}

/**
 * Save profile with profile picture handling
 * Handles three scenarios: upload new, delete, or no change
 */
export async function saveProfileWithPicture(
  userId: string,
  profileData: {
    firstName?: string;
    lastName?: string;
    username?: string;
    bio?: string | null;
    readingInterests?: string[];
  },
  newImageUri: string | null,
  deleteProfilePicture: boolean
): Promise<{ profile: UserProfile | null; error: any }> {
  try {
    let newProfilePhotoUrl: string | null = null;

    // Get current profile to preserve existing photo if no changes
    const { data: currentProfile } = await supabase
      .from('user_profiles')
      .select('profile_photo_url')
      .eq('user_id', userId)
      .single();

    const currentPhotoUrl = (currentProfile as { profile_photo_url: string | null } | null)?.profile_photo_url || null;

    // Handle profile picture changes
    if (deleteProfilePicture) {
      // Scenario 1: User wants to delete their profile picture
      console.log('Deleting profile picture...');
      if (currentPhotoUrl) {
        await deleteProfilePhoto(currentPhotoUrl);
      }
      newProfilePhotoUrl = null;
    } else if (newImageUri) {
      // Scenario 2: User is uploading a new profile picture
      console.log('Uploading new profile picture...');
      const uploadResult = await uploadProfilePhoto(userId, newImageUri);
      
      if (uploadResult.error) {
        return { profile: null, error: uploadResult.error };
      }
      
      newProfilePhotoUrl = uploadResult.url;
      // Note: We store the full URL in profile_photo_url for backward compatibility
      // The storage path is available in uploadResult.path if needed in the future
    } else {
      // Scenario 3: No change to profile picture
      newProfilePhotoUrl = currentPhotoUrl;
    }

    // Update the profile in the database
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (profileData.firstName !== undefined) updateData.first_name = profileData.firstName;
    if (profileData.lastName !== undefined) updateData.last_name = profileData.lastName;
    if (profileData.username !== undefined) updateData.username = profileData.username;
    if (profileData.bio !== undefined) updateData.bio = profileData.bio;
    if (profileData.readingInterests !== undefined)
      updateData.reading_interests = profileData.readingInterests;
    
    // Store the URL in profile_photo_url
    // For new uploads, this is the full public URL
    // For deletions, this is null
    // For no change, we don't update this field
    if (deleteProfilePicture || newImageUri) {
      updateData.profile_photo_url = newProfilePhotoUrl;
    }

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
    console.error('Exception saving profile with picture:', error);
    return { profile: null, error };
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
  account_type: AccountType;
}>; error: any }> {
  try {
    const searchTerm = `%${query}%`;
    
    // Use .or() with PostgREST syntax: column.operator.value,column2.operator.value2
    // Note: ilike is case-insensitive, so we don't need toLowerCase
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, username, first_name, last_name, profile_photo_url, account_type')
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
 * Follow a user
 */
export async function followUser(
  followerId: string,
  followingId: string
): Promise<{ success: boolean; action: FollowAction | null; error: any }> {
  try {
    const { data, error } = await supabase.rpc('request_follow', {
      p_requester_id: followerId,
      p_requested_id: followingId,
    });

    if (error) {
      console.error('Error following user:', error);
      return { success: false, action: null, error };
    }

    const action = (data as FollowAction) || 'following';
    return { success: true, action, error: null };
  } catch (error) {
    console.error('Exception following user:', error);
    return { success: false, action: null, error };
  }
}

export async function getOutgoingFollowRequests(
  requesterId: string
): Promise<{ requests: Array<{ id: string; requested_id: string; status: FollowRequestStatus }>; error: any }> {
  try {
    const { data, error } = await supabase
      .from('follow_requests')
      .select('id, requested_id, status')
      .eq('requester_id', requesterId)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching outgoing follow requests:', error);
      return { requests: [], error };
    }

    return { requests: (data || []) as any, error: null };
  } catch (error) {
    console.error('Exception fetching outgoing follow requests:', error);
    return { requests: [], error };
  }
}

export async function getIncomingFollowRequests(
  requestedId: string
): Promise<{ requests: Array<{ id: string; requester_id: string; status: FollowRequestStatus; created_at: string }>; error: any }> {
  try {
    const { data, error } = await supabase
      .from('follow_requests')
      .select('id, requester_id, status, created_at')
      .eq('requested_id', requestedId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching incoming follow requests:', error);
      return { requests: [], error };
    }

    return { requests: (data || []) as any, error: null };
  } catch (error) {
    console.error('Exception fetching incoming follow requests:', error);
    return { requests: [], error };
  }
}

export async function acceptFollowRequest(
  requestId: string
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase.rpc('accept_follow_request', {
      p_request_id: requestId,
    });

    if (error) {
      console.error('Error accepting follow request:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception accepting follow request:', error);
    return { success: false, error };
  }
}

export async function rejectFollowRequest(
  requestId: string
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase.rpc('reject_follow_request', {
      p_request_id: requestId,
    });

    if (error) {
      console.error('Error rejecting follow request:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception rejecting follow request:', error);
    return { success: false, error };
  }
}

export async function cancelFollowRequest(
  requesterId: string,
  requestedId: string
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('follow_requests')
      .delete()
      .eq('requester_id', requesterId)
      .eq('requested_id', requestedId)
      .eq('status', 'pending');

    if (error) {
      console.error('Error canceling follow request:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception canceling follow request:', error);
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

export async function getBlockStatus(
  viewerId: string,
  targetId: string
): Promise<{ blockedByViewer: boolean; blockedByTarget: boolean; error: any }> {
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocker_id, blocked_id')
      .or(`and(blocker_id.eq.${viewerId},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${viewerId})`);

    if (error) {
      console.error('Error fetching block status:', error);
      return { blockedByViewer: false, blockedByTarget: false, error };
    }

    const blockedByViewer = (data || []).some(
      (row: any) => row.blocker_id === viewerId && row.blocked_id === targetId
    );
    const blockedByTarget = (data || []).some(
      (row: any) => row.blocker_id === targetId && row.blocked_id === viewerId
    );

    return { blockedByViewer, blockedByTarget, error: null };
  } catch (error) {
    console.error('Exception fetching block status:', error);
    return { blockedByViewer: false, blockedByTarget: false, error };
  }
}

export async function blockUser(
  blockerId: string,
  blockedId: string
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase.rpc('block_user', {
      p_blocker_id: blockerId,
      p_blocked_id: blockedId,
    });

    if (error) {
      console.error('Error blocking user:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception blocking user:', error);
    return { success: false, error };
  }
}

export async function unblockUser(
  blockerId: string,
  blockedId: string
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);

    if (error) {
      console.error('Error unblocking user:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception unblocking user:', error);
    return { success: false, error };
  }
}

export async function getBlockedUsers(
  blockerId: string
): Promise<{ users: UserSummary[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', blockerId);

    if (error) {
      console.error('Error fetching blocked users:', error);
      return { users: [], error };
    }

    const blockedIds = (data || []).map((row: any) => row.blocked_id);
    const users = await fetchProfilesByIds(blockedIds);
    return { users, error: null };
  } catch (error) {
    console.error('Exception fetching blocked users:', error);
    return { users: [], error };
  }
}

export async function muteUser(
  muterId: string,
  mutedId: string
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('muted_users')
      .insert({ muter_id: muterId, muted_id: mutedId });

    if (error) {
      console.error('Error muting user:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception muting user:', error);
    return { success: false, error };
  }
}

export async function unmuteUser(
  muterId: string,
  mutedId: string
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('muted_users')
      .delete()
      .eq('muter_id', muterId)
      .eq('muted_id', mutedId);

    if (error) {
      console.error('Error unmuting user:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception unmuting user:', error);
    return { success: false, error };
  }
}

export async function getMutedUsers(
  muterId: string
): Promise<{ users: UserSummary[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('muted_users')
      .select('muted_id')
      .eq('muter_id', muterId);

    if (error) {
      console.error('Error fetching muted users:', error);
      return { users: [], error };
    }

    const mutedIds = (data || []).map((row: any) => row.muted_id);
    const users = await fetchProfilesByIds(mutedIds);
    return { users, error: null };
  } catch (error) {
    console.error('Exception fetching muted users:', error);
    return { users: [], error };
  }
}

export async function checkIfMuted(
  muterId: string,
  mutedId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('muted_users')
      .select('id')
      .eq('muter_id', muterId)
      .eq('muted_id', mutedId)
      .single();

    return !!data && !error;
  } catch (error) {
    return false;
  }
}

export async function checkPendingFollowRequest(
  requesterId: string,
  requestedId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('follow_requests')
      .select('id')
      .eq('requester_id', requesterId)
      .eq('requested_id', requestedId)
      .eq('status', 'pending')
      .single();

    return !!data && !error;
  } catch (error) {
    return false;
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
 * Get list of user IDs that follow the current user
 */
export async function getFollowerIds(
  userId: string
): Promise<{ followerIds: string[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('user_follows')
      .select('follower_id')
      .eq('following_id', userId);

    if (error) {
      console.error('Error fetching follower IDs:', error);
      return { followerIds: [], error };
    }

    const followerIds = (data || []).map((row: any) => row.follower_id);
    return { followerIds, error: null };
  } catch (error) {
    console.error('Exception fetching follower IDs:', error);
    return { followerIds: [], error };
  }
}

const fetchProfilesByIds = async (
  userIds: string[]
): Promise<UserSummary[]> => {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, username, first_name, last_name, profile_photo_url')
    .in('user_id', userIds);

  if (error) {
    console.error('Error fetching profiles:', error);
    return [];
  }

  const map = new Map((data || []).map((row: any) => [row.user_id, row]));
  return userIds.map((id) => map.get(id)).filter(Boolean) as UserSummary[];
};

/**
 * Get followers list with profile data
 */
export async function getFollowersList(
  userId: string
): Promise<{ followers: UserSummary[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('user_follows')
      .select('follower_id, created_at')
      .eq('following_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching followers list:', error);
      return { followers: [], error };
    }

    const followerIds = (data || []).map((row: any) => row.follower_id);
    const followers = await fetchProfilesByIds(followerIds);
    return { followers, error: null };
  } catch (error) {
    console.error('Exception fetching followers list:', error);
    return { followers: [], error };
  }
}

/**
 * Get following list with profile data
 */
export async function getFollowingList(
  userId: string
): Promise<{ following: UserSummary[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('user_follows')
      .select('following_id, created_at')
      .eq('follower_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching following list:', error);
      return { following: [], error };
    }

    const followingIds = (data || []).map((row: any) => row.following_id);
    const following = await fetchProfilesByIds(followingIds);
    return { following, error: null };
  } catch (error) {
    console.error('Exception fetching following list:', error);
    return { following: [], error };
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
