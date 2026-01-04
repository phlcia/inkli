import React from 'react';
import { useRoute, RouteProp } from '@react-navigation/native';
import ShelfScreen from '../components/ShelfScreen';
import { SearchStackParamList } from '../navigation/SearchStackNavigator';

type UserShelfRoute = RouteProp<SearchStackParamList, 'UserShelf'>;

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
