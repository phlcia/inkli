import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, typography } from '../../../config/theme';
import { generateRecommendations, refreshRecommendations, Recommendation } from '../../../services/recommendations';
import RecommendationCard from '../components/RecommendationCard';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';

export default function RecommendationsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecommendations = useCallback(async (isRefresh = false) => {
    if (!user) return;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const { data, error: recError } = await generateRecommendations();
      if (recError) {
        setError(recError.message);
        return;
      }
      if (data) {
        setRecommendations(data);
      } else {
        setError('No recommendations available');
      }
    } catch (err) {
      console.error('Error loading recommendations:', err);
      setError('Failed to load recommendations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadRecommendations();
    }, [loadRecommendations])
  );

  const handleRefresh = useCallback(async () => {
    if (!user) return;

    setRefreshing(true);
    setError(null);

    try {
      const { data, error: recError } = await refreshRecommendations();
      if (recError) {
        setError(recError.message);
        return;
      }
      if (data) {
        setRecommendations(data);
      } else {
        setError('No recommendations available');
      }
    } catch (err) {
      console.error('Error refreshing recommendations:', err);
      setError('Failed to refresh recommendations');
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  const handleBookPress = useCallback((bookId: string) => {
    // Navigate to book detail
    // This will need to be implemented based on your navigation structure
    console.log('Navigate to book:', bookId);
  }, []);

  const handleRankBook = useCallback((bookId: string) => {
    // Navigate to comparison/ranking flow
    // This will need to be implemented based on your navigation structure
    console.log('Rank book:', bookId);
    Alert.alert('Rank Book', 'Ranking feature will be implemented');
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
          <Text style={styles.loadingText}>Loading recommendations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      <View style={styles.header}>
        <Text style={styles.title}>Recommendations</Text>
        <TouchableOpacity onPress={handleRefresh} disabled={refreshing} style={styles.refreshButton}>
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.primaryBlue} />
          ) : (
            <Text style={styles.refreshButtonText}>Refresh</Text>
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadRecommendations()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : recommendations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No recommendations yet.</Text>
          <Text style={styles.emptySubtext}>Make some comparisons to get personalized recommendations!</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primaryBlue} />
          }
        >
          {recommendations.map((rec) => {
            if (!rec.book) return null;
            return (
              <RecommendationCard
                key={rec.book_id}
                book={rec.book}
                reasoning={rec.reasoning}
                onPress={() => handleBookPress(rec.book_id)}
                onRank={() => handleRankBook(rec.book_id)}
              />
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
  },
  refreshButton: {
    padding: 8,
  },
  refreshButtonText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 20,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 10,
    paddingBottom: 20,
  },
});
