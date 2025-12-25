-- Fix foreign key constraint to point to auth.users instead of users table
-- Run this in your Supabase SQL Editor

-- First, drop the existing foreign key constraint if it exists
ALTER TABLE user_books 
DROP CONSTRAINT IF EXISTS user_books_user_id_fkey;

-- Recreate the foreign key constraint pointing to auth.users
ALTER TABLE user_books
ADD CONSTRAINT user_books_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;