import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../config/theme';
import ProfileScreen from '../features/profile/screens/ProfileScreen';
import EditProfileScreen from '../features/profile/screens/EditProfileScreen';
import BookDetailScreen from '../features/books/screens/BookDetailScreen';
import FollowersFollowingScreen from '../features/social/screens/FollowersFollowingScreen';
import ActivityLikesScreen from '../features/social/screens/ActivityLikesScreen';
import ActivityCommentsScreen from '../features/social/screens/ActivityCommentsScreen';
import UserProfileScreen from '../features/profile/screens/UserProfileScreen';
import {
  FollowersFollowingParams,
  ActivityLikesParams,
  ActivityCommentsParams,
} from './types';

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditProfile: undefined;
  BookDetail: { book: any }; // Enriched book data
  FollowersFollowing: FollowersFollowingParams;
  ActivityLikes: ActivityLikesParams;
  ActivityComments: ActivityCommentsParams;
  UserProfile: { userId: string; username?: string };
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.creamBackground,
        },
      }}
    >
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
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
        name="FollowersFollowing"
        component={FollowersFollowingScreen}
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
        }}
      />
      <Stack.Screen
        name="ActivityComments"
        component={ActivityCommentsScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
    </Stack.Navigator>
  );
}
