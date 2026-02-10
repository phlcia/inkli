import React from 'react';
import { useRoute, RouteProp } from '@react-navigation/native';
import ShelfScreen from '../../shelf/components/ShelfScreen';
type UserShelfRoute = RouteProp<{
  UserShelf: {
    userId: string;
    username?: string;
    initialTab?: 'read' | 'currently_reading' | 'want_to_read';
  };
}, 'UserShelf'>;

export default function UserShelfScreen() {
  const route = useRoute<UserShelfRoute>();
  const { userId, username, initialTab } = route.params;

  return (
    <ShelfScreen
      ownerUserId={userId}
      headerTitle={username ? `@${username}'s Shelf` : 'Shelf'}
      initialTab={initialTab}
    />
  );
}
