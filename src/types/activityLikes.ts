export interface ActivityLike {
  id: string;
  user_book_id: string;
  user_id: string;
  created_at: string;
  user?: {
    id: string;
    username: string;
    avatar_url?: string;
  };
}
