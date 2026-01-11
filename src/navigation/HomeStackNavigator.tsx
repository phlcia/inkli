import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../config/theme';
import HomeScreen from '../features/home/screens/HomeScreen';
import BookDetailScreen from '../features/books/screens/BookDetailScreen';
import ActivityLikesScreen from '../features/social/screens/ActivityLikesScreen';
import ActivityCommentsScreen from '../features/social/screens/ActivityCommentsScreen';
import UserProfileScreen from '../features/profile/screens/UserProfileScreen';
import UserShelfScreen from '../features/social/screens/UserShelfScreen';
import NotificationsScreen from '../features/social/screens/NotificationsScreen';
import { ActivityLikesParams, ActivityCommentsParams } from './types';

export type HomeStackParamList = {
  HomeMain: undefined;
  BookDetail: { book: any };
  ActivityLikes: ActivityLikesParams;
  ActivityComments: ActivityCommentsParams;
  UserProfile: { userId: string; username?: string };
  UserShelf: {
    userId: string;
    username?: string;
    initialTab?: 'read' | 'currently_reading' | 'want_to_read';
  };
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.creamBackground,
        },
      }}
    >
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
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
        name="UserProfile"
        component={UserProfileScreen}
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
