export interface ActivityComment {
  id: string;
  user_book_id: string;
  user_id: string;
  comment_text: string;
  created_at: string;
  updated_at: string;
  parent_comment_id?: string | null;
  likes_count?: number | null;
  user?: {
    user_id: string;
    username: string;
    avatar_url?: string;
  };
}
