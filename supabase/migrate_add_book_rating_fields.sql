-- Add rating, notes, and date fields to user_books table
ALTER TABLE user_books 
ADD COLUMN IF NOT EXISTS rating TEXT CHECK (rating IN ('liked', 'fine', 'disliked')),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS started_date DATE,
ADD COLUMN IF NOT EXISTS finished_date DATE;

