CREATE TABLE book_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL,
  issue_type text NOT NULL,
  description text,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_book_feedback_book_id ON book_feedback(book_id);
CREATE INDEX idx_book_feedback_created_at ON book_feedback(created_at);
