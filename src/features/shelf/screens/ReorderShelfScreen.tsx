import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  NestableDraggableFlatList,
  NestableScrollContainer,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { getUserBooks, updateTierScoresBatch, UserBook } from '../../../services/books';
import { YourShelfStackParamList } from '../../../navigation/YourShelfStackNavigator';

type RatingTier = 'liked' | 'fine' | 'disliked';

type ReorderNavigationProp = NativeStackNavigationProp<YourShelfStackParamList, 'ReorderShelf'>;

const TIER_BOUNDARIES = {
  disliked: { min: 0, max: 3.5 },
  fine: { min: 3.5, max: 6.5 },
  liked: { min: 6.5, max: 10.0 },
} as const;

export default function ReorderShelfScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<ReorderNavigationProp>();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [reorderBooks, setReorderBooks] = useState<{
    liked: UserBook[];
    fine: UserBook[];
    disliked: UserBook[];
  }>({ liked: [], fine: [], disliked: [] });

  const loadReadBooks = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const userBooks = await getUserBooks(user.id);
      const tiers = { liked: [] as UserBook[], fine: [] as UserBook[], disliked: [] as UserBook[] };
      userBooks.forEach((book) => {
        if (book.status !== 'read') return;
        if (book.rating === 'liked') tiers.liked.push(book);
        else if (book.rating === 'fine') tiers.fine.push(book);
        else if (book.rating === 'disliked') tiers.disliked.push(book);
      });
      const sortByRank = (a: UserBook, b: UserBook) =>
        (b.rank_score ?? -Infinity) - (a.rank_score ?? -Infinity);
      tiers.liked.sort(sortByRank);
      tiers.fine.sort(sortByRank);
      tiers.disliked.sort(sortByRank);
      setReorderBooks(tiers);
    } catch (error) {
      console.error('Error loading read books:', error);
      Alert.alert('Error', 'Failed to load your read books.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadReadBooks();
  }, [loadReadBooks]);

  const roundScore = (score: number): number => Math.round(score * 1000) / 1000;

  const computeTierScores = useCallback((tier: RatingTier, tierBooks: UserBook[]) => {
    const { min, max } = TIER_BOUNDARIES[tier];
    const count = tierBooks.length;
    if (count === 0) return [];
    const range = max - min;

    return tierBooks.map((book, index) => ({
      id: book.id,
      score: roundScore(range * (count - index) / count + min),
    }));
  }, []);

  const handleTierDragEnd = useCallback((tier: RatingTier, newData: UserBook[]) => {
    setReorderBooks((prev) => ({ ...prev, [tier]: newData }));
  }, []);

  const handleDone = useCallback(async () => {
    if (!user?.id) {
      navigation.navigate('YourShelfMain');
      return;
    }

    setIsSaving(true);
    try {
      const tiers: RatingTier[] = ['liked', 'fine', 'disliked'];
      for (const tier of tiers) {
        const updates = computeTierScores(tier, reorderBooks[tier]);
        if (updates.length > 0) {
          await updateTierScoresBatch(user.id, tier, updates, { touchUpdatedAt: false });
        }
      }
    } catch (error) {
      console.error('Error saving reorder:', error);
      Alert.alert('Failed to save order', 'Your changes were not saved. Please try again.');
    } finally {
      setIsSaving(false);
      navigation.navigate('YourShelfMain', { refresh: true, initialTab: 'read' });
    }
  }, [user?.id, navigation, computeTierScores, reorderBooks]);

  const tierTitles: Record<RatingTier, string> = useMemo(
    () => ({
      liked: 'Liked',
      fine: 'Fine',
      disliked: 'Disliked',
    }),
    []
  );

  const renderReorderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<UserBook>) => {
      const title = item.book?.title ?? 'Untitled';
      return (
        <View style={[styles.bookRow, isActive && styles.bookRowActive]}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {title}
          </Text>
          <TouchableOpacity
            style={styles.dragHandle}
            delayLongPress={120}
            onLongPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              drag();
            }}
            disabled={isSaving}
            activeOpacity={0.6}
          >
            <Text style={styles.dragHandleText}>≡</Text>
          </TouchableOpacity>
        </View>
      );
    },
    [isSaving]
  );

  const hasBooks =
    reorderBooks.liked.length > 0 || reorderBooks.fine.length > 0 || reorderBooks.disliked.length > 0;

  if (!user?.id) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Drag to reorder:</Text>
        <TouchableOpacity
          style={[styles.doneButton, isSaving && styles.doneButtonDisabled]}
          onPress={handleDone}
          disabled={isSaving}
        >
          <Text style={styles.doneButtonText}>{isSaving ? 'Saving...' : 'Done'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
        </View>
      ) : !hasBooks ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No ranked read books yet.</Text>
          <Text style={styles.emptySubtext}>Rank a book to start ordering your tiers.</Text>
        </View>
      ) : (
        <NestableScrollContainer
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {(Object.keys(tierTitles) as RatingTier[]).map((tier) => {
            const tierBooks = reorderBooks[tier];
            if (tierBooks.length === 0) return null;
            return (
              <View key={tier} style={styles.tierSection}>
                <Text style={styles.tierTitle}>{tierTitles[tier]}</Text>
                <NestableDraggableFlatList
                  data={tierBooks}
                  onDragEnd={({ data }) => handleTierDragEnd(tier, data)}
                  keyExtractor={(item) => item.id}
                  renderItem={renderReorderItem}
                  scrollEnabled={false}
                  activationDistance={8}
                />
              </View>
            );
          })}
        </NestableScrollContainer>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    fontWeight: '600',
  },
  doneButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryBlue,
  },
  doneButtonDisabled: {
    opacity: 0.6,
  },
  doneButtonText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  tierSection: {
    marginBottom: 20,
  },
  tierTitle: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  bookRowActive: {
    opacity: 0.85,
  },
  bookTitle: {
    flex: 1,
    marginRight: 12,
    fontSize: 15,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  dragHandle: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  dragHandleText: {
    fontSize: 18,
    color: '#999',
    fontFamily: typography.body,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    textAlign: 'center',
  },
});
