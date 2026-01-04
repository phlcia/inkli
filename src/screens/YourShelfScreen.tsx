import React, { useState, useEffect } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import ShelfScreen from '../components/ShelfScreen';
import { YourShelfStackParamList } from '../navigation/YourShelfStackNavigator';

type YourShelfScreenNavigationProp = NativeStackNavigationProp<
  YourShelfStackParamList,
  'YourShelfMain'
>;

export default function YourShelfScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<YourShelfScreenNavigationProp>();
  const route = useRoute();
  const [initialTab, setInitialTab] = useState<'read' | 'currently_reading' | 'want_to_read'>('read');
  const [refreshKey, setRefreshKey] = useState(0);

  // Listen for route params changes (triggered when ranking completes)
  useEffect(() => {
    const params = (route.params as any);
    if (params?.refresh) {
      setRefreshKey((prev) => prev + 1);
      // Clear the param to avoid repeated refreshes
      (navigation as any).setParams({ refresh: undefined });
    }
  }, [route.params, navigation]);

  // Handle route params to set initial tab (from ProfileScreen shelf cards)
  useEffect(() => {
    const params = (route.params as any);
    if (params?.initialTab) {
      const validTab = ['read', 'currently_reading', 'want_to_read'].includes(params.initialTab)
        ? params.initialTab
        : 'read';
      setInitialTab(validTab);
      // Clear the param to avoid repeated switches
      (navigation as any).setParams({ initialTab: undefined });
    }
  }, [route.params, navigation]);
  if (!user?.id) {
    return null;
  }

  return (
    <ShelfScreen
      ownerUserId={user.id}
      headerTitle="Your Shelf"
      initialTab={initialTab}
      refreshKey={refreshKey}
    />
  );
}
