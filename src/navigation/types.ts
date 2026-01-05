export type FollowersFollowingParams = {
  userId: string;
  username?: string;
  initialTab: 'followers' | 'following';
};

export type ActivityLikesParams = {
  userBookId: string;
};
