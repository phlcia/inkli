-- Optimize auth.uid() initplan usage in RLS policies and drop duplicate index

-- 1) Drop duplicate index on activity_likes
DROP INDEX IF EXISTS idx_activity_likes_user_id;

-- 2) Update RLS policies to use initplan-stable auth.uid()
ALTER POLICY "Anyone can view public profile fields"
  ON user_profiles
  USING (can_view_profile((select auth.uid()), user_id));

ALTER POLICY "Users can update own profile"
  ON user_profiles
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can insert own profile"
  ON user_profiles
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can insert own follows"
  ON user_follows
  WITH CHECK (
    (select auth.uid()) = follower_id
    AND NOT is_blocked_between(follower_id, following_id)
  );

ALTER POLICY "Users can delete own follows"
  ON user_follows
  USING ((select auth.uid()) = follower_id);

ALTER POLICY "Users can view relevant follow requests"
  ON follow_requests
  USING ((select auth.uid()) = requester_id OR (select auth.uid()) = requested_id);

ALTER POLICY "Users can create follow requests"
  ON follow_requests
  WITH CHECK (
    (select auth.uid()) = requester_id
    AND NOT is_blocked_between(requester_id, requested_id)
  );

ALTER POLICY "Users can respond to follow requests"
  ON follow_requests
  USING ((select auth.uid()) = requested_id);

ALTER POLICY "Users can respond to follow requests"
  ON follow_requests
  WITH CHECK ((select auth.uid()) = requested_id);

ALTER POLICY "Users can delete their follow requests"
  ON follow_requests
  USING ((select auth.uid()) = requester_id OR (select auth.uid()) = requested_id);

ALTER POLICY "Users can view block relationships involving them"
  ON blocked_users
  USING ((select auth.uid()) = blocker_id OR (select auth.uid()) = blocked_id);

ALTER POLICY "Users can create blocks as themselves"
  ON blocked_users
  WITH CHECK ((select auth.uid()) = blocker_id);

ALTER POLICY "Users can delete blocks as themselves"
  ON blocked_users
  USING ((select auth.uid()) = blocker_id);

ALTER POLICY "Users can view muted users"
  ON muted_users
  USING ((select auth.uid()) = muter_id);

ALTER POLICY "Users can create mutes as themselves"
  ON muted_users
  WITH CHECK ((select auth.uid()) = muter_id);

ALTER POLICY "Users can delete mutes as themselves"
  ON muted_users
  USING ((select auth.uid()) = muter_id);

ALTER POLICY "User books are readable by viewers"
  ON user_books
  USING (can_view_content((select auth.uid()), user_id));

ALTER POLICY "Users can manage their own user books"
  ON user_books
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can manage their own user books"
  ON user_books
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Activity cards are readable by viewers"
  ON activity_cards
  USING (can_view_content((select auth.uid()), user_id));

ALTER POLICY "Users can create their own activity cards"
  ON activity_cards
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can update their own activity cards"
  ON activity_cards
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can delete their own activity cards"
  ON activity_cards
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Activity likes are readable by viewers"
  ON activity_likes
  USING (can_view_content((select auth.uid()), user_id));

ALTER POLICY "Users can like activity as themselves"
  ON activity_likes
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can unlike their activity likes"
  ON activity_likes
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Activity comments are readable by viewers"
  ON activity_comments
  USING (can_view_content((select auth.uid()), user_id));

ALTER POLICY "Users can add comments as themselves"
  ON activity_comments
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can update their comments"
  ON activity_comments
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can update their comments"
  ON activity_comments
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can delete their comments"
  ON activity_comments
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Comment likes are readable by viewers"
  ON activity_comment_likes
  USING (can_view_content((select auth.uid()), user_id));

ALTER POLICY "Users can like comments as themselves"
  ON activity_comment_likes
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can unlike their comment likes"
  ON activity_comment_likes
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can read own notifications"
  ON notifications
  USING ((select auth.uid()) = recipient_id);

ALTER POLICY "Users can create notifications as actor"
  ON notifications
  WITH CHECK ((select auth.uid()) = actor_id);

ALTER POLICY "Users can read own recommendations"
  ON recommendations
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can update own recommendations"
  ON recommendations
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can insert own recommendations"
  ON recommendations
  WITH CHECK ((select auth.uid()) = user_id);
