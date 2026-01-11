import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../config/theme';
import SearchScreen from '../features/search/screens/SearchScreen';
import BookDetailScreen from '../features/books/screens/BookDetailScreen';
import BookRankingScreen from '../features/books/screens/BookRankingScreen';
import UserProfileScreen from '../features/profile/screens/UserProfileScreen';
import UserShelfScreen from '../features/social/screens/UserShelfScreen';
import FollowersFollowingScreen from '../features/social/screens/FollowersFollowingScreen';
import ActivityLikesScreen from '../features/social/screens/ActivityLikesScreen';
import ActivityCommentsScreen from '../features/social/screens/ActivityCommentsScreen';
import {
  FollowersFollowingParams,
  ActivityLikesParams,
  ActivityCommentsParams,
} from './types';

export type SearchStackParamList = {
  SearchMain: undefined;
  BookDetail: { book: any }; // Enriched book data
  BookRanking: {
    book: any;
    userBookId: string;
    initialStatus: 'read' | 'currently_reading' | 'want_to_read';
    previousStatus?: 'read' | 'currently_reading' | 'want_to_read' | null;
    wasNewBook?: boolean;
  };
  UserProfile: { userId: string; username?: string };
  UserShelf: {
    userId: string;
    username?: string;
    initialTab?: 'read' | 'currently_reading' | 'want_to_read';
  };
  FollowersFollowing: FollowersFollowingParams;
  ActivityLikes: ActivityLikesParams;
  ActivityComments: ActivityCommentsParams;
};

const Stack = createNativeStackNavigator<SearchStackParamList>();

export default function SearchStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.creamBackground,
        },
      }}
    >
      <Stack.Screen name="SearchMain" component={SearchScreen} />
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
        name="UserProfile" 
        component={UserProfileScreen} 
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="UserShelf" 
        component={UserShelfScreen} 
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FollowersFollowing"
        component={FollowersFollowingScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
          headerShown: false,
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
    </Stack.Navigator>
  );
}
