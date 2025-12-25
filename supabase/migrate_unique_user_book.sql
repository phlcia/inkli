-- Ensure each user can only have a book once across all statuses
CREATE UNIQUE INDEX IF NOT EXISTS user_books_unique_book 
ON user_books(user_id, book_id);

