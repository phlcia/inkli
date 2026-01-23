import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../config/theme';
import YourShelfScreen from '../features/shelf/screens/YourShelfScreen';
import BookDetailScreen from '../features/books/screens/BookDetailScreen';
import BookRankingScreen from '../features/books/screens/BookRankingScreen';
import { BookRankingParams } from './types';

export type YourShelfStackParamList = {
  YourShelfMain: {
    initialTab?: 'read' | 'currently_reading' | 'want_to_read' | 'recommended';
    refresh?: boolean;
  };
  BookDetail: { book: any }; // Enriched book data
  BookRanking: BookRankingParams;
};

const Stack = createNativeStackNavigator<YourShelfStackParamList>();

export default function YourShelfStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.creamBackground,
        },
      }}
    >
      <Stack.Screen name="YourShelfMain" component={YourShelfScreen} />
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
    </Stack.Navigator>
  );
}
