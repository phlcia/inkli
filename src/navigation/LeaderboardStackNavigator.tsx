import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../config/theme';
import LeaderboardScreen from '../features/leaderboard/screens/LeaderboardScreen';
import UserProfileScreen from '../features/profile/screens/UserProfileScreen';
import BookDetailScreen from '../features/books/screens/BookDetailScreen';
import BookRankingScreen from '../features/books/screens/BookRankingScreen';
import FollowersFollowingScreen from '../features/social/screens/FollowersFollowingScreen';
import ActivityLikesScreen from '../features/social/screens/ActivityLikesScreen';
import ActivityCommentsScreen from '../features/social/screens/ActivityCommentsScreen';
import UserShelfScreen from '../features/social/screens/UserShelfScreen';
import {
  ActivityLikesParams,
  ActivityCommentsParams,
  BookRankingParams,
  FollowersFollowingParams,
} from './types';

export type LeaderboardStackParamList = {
  LeaderboardMain: undefined;
  UserProfile: { userId: string; username?: string };
  BookDetail: { book: any };
  BookRanking: BookRankingParams;
  ActivityLikes: ActivityLikesParams;
  ActivityComments: ActivityCommentsParams;
  FollowersFollowing: FollowersFollowingParams;
  UserShelf: {
    userId: string;
    username?: string;
    initialTab?: 'read' | 'currently_reading' | 'want_to_read';
  };
};

const Stack = createNativeStackNavigator<LeaderboardStackParamList>();

export default function LeaderboardStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.creamBackground,
        },
      }}
    >
      <Stack.Screen name="LeaderboardMain" component={LeaderboardScreen} />
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="BookDetail"
        component={BookDetailScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="BookRanking"
        component={BookRankingScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="ActivityLikes"
        component={ActivityLikesScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="ActivityComments"
        component={ActivityCommentsScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="FollowersFollowing"
        component={FollowersFollowingScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="UserShelf"
        component={UserShelfScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
}
