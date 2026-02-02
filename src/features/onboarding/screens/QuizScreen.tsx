import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors, typography } from '../../../config/theme';
import { getQuizBookPair, skipQuiz } from '../../../services/quiz';
import { createComparison } from '../../../services/comparisons';
import { generateRecommendations } from '../../../services/recommendations';
import { Book } from '../../../services/books';
import QuizBookCard from '../components/QuizBookCard';
import TasteProfileCard from '../components/TasteProfileCard';
import { supabase } from '../../../config/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { AuthStackParamList } from '../../../navigation/AuthStackNavigator';

const QUIZ_COMPARISON_COUNT = 12; // Default number of comparisons

type QuizScreenRouteProp = RouteProp<AuthStackParamList, 'Quiz'>;

interface QuizScreenProps {
  signupParams?: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    username: string;
  };
  onSignupComplete?: () => void;
  onQuizComplete?: () => void;
}

export default function QuizScreen({ signupParams, onSignupComplete, onQuizComplete }: QuizScreenProps) {
  const { user, signUp } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<QuizScreenRouteProp>();
  
  // Get signup params from route if not passed as prop
  const finalSignupParams = signupParams || route.params;
  const [currentPair, setCurrentPair] = useState<{ book1: Book; book2: Book } | null>(null);
  const [comparisonCount, setComparisonCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [quizComplete, setQuizComplete] = useState(false);
  const [tasteProfile, setTasteProfile] = useState<{
    topBooks: Array<{ title: string; id: string }>;
    topGenres: string[];
  } | null>(null);
  const [signingUp, setSigningUp] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);

  // Handle signup if user doesn't exist yet
  useEffect(() => {
    const handleSignup = async () => {
      if (user) {
        // User already exists, proceed with quiz
        setSignupComplete(true);
        return;
      }

      if (!finalSignupParams) {
        // No signup params, user should already be logged in
        return;
      }

      setSigningUp(true);
      try {
        // Create account first
        await signUp(
          finalSignupParams.email,
          finalSignupParams.password,
          finalSignupParams.username,
          finalSignupParams.firstName,
          finalSignupParams.lastName,
          [] // No reading interests - we'll use quiz instead
        );
        setSignupComplete(true);
        if (onSignupComplete) {
          onSignupComplete();
        }
      } catch (error: any) {
        console.error('Error during signup:', error);
        Alert.alert(
          'Signup Error',
          error.message || 'Failed to create account. Please try again.',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } finally {
        setSigningUp(false);
      }
    };

    handleSignup();
  }, [user, finalSignupParams, signUp, navigation, onSignupComplete]);

  const loadNextPair = useCallback(async () => {
    if (!user || !signupComplete) return;

    setLoading(true);
    try {
      const { data, error } = await getQuizBookPair();
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      if (data) {
        setCurrentPair(data);
      } else {
        // No more pairs available
        handleQuizComplete();
      }
    } catch (error) {
      console.error('Error loading quiz pair:', error);
      Alert.alert('Error', 'Failed to load quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [handleQuizComplete, signupComplete, user]);

  useEffect(() => {
    if (user && signupComplete) {
      loadNextPair();
    }
  }, [user, signupComplete, loadNextPair]);

  const handleChoose = async (winnerBook: Book, loserBook: Book) => {
    if (!user || submitting) return;

    setSubmitting(true);
    try {
      const { error } = await createComparison({
        winner_book_id: winnerBook.id,
        loser_book_id: loserBook.id,
        is_onboarding: true,
      });

      if (error) {
        Alert.alert('Error', error.message);
        setSubmitting(false);
        return;
      }

      const newCount = comparisonCount + 1;
      setComparisonCount(newCount);

      if (newCount >= QUIZ_COMPARISON_COUNT) {
        handleQuizComplete();
      } else {
        loadNextPair();
      }
    } catch (error) {
      console.error('Error creating comparison:', error);
      Alert.alert('Error', 'Failed to save comparison. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipComparison = () => {
    if (comparisonCount >= QUIZ_COMPARISON_COUNT - 1) {
      handleQuizComplete();
    } else {
      loadNextPair();
    }
  };

  const handleSkipQuiz = async () => {
    if (!user) return;

    Alert.alert(
      'Skip Quiz',
      'Are you sure you want to skip? You can always take it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await skipQuiz();
              if (error) {
                Alert.alert('Error', error.message);
                return;
              }
              onQuizComplete?.();
              // After skipping, user will be logged in and AuthContext will navigate to main app
              // No need to navigate manually - App.tsx will handle it
            } catch (error) {
              console.error('Error skipping quiz:', error);
              Alert.alert('Error', 'Failed to skip quiz. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleQuizComplete = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Get user's quiz comparisons
      const { data: comparisons, error: compError } = await supabase
        .from('comparisons')
        .select('winner_book_id')
        .eq('user_id', user.id)
        .eq('is_onboarding', true);

      if (compError) {
        console.error('Error fetching comparisons:', compError);
      }

      // Get top books (most wins)
      const winnerCounts = new Map<string, number>();
      if (comparisons) {
        for (const comp of comparisons) {
          winnerCounts.set(comp.winner_book_id, (winnerCounts.get(comp.winner_book_id) || 0) + 1);
        }
      }

      const topBookIds = Array.from(winnerCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);

      const { data: topBooksData } = await supabase
        .from('books')
        .select('id, title')
        .in('id', topBookIds.length > 0 ? topBookIds : ['00000000-0000-0000-0000-000000000000']);

      // Get top genres from winner books
      const { data: bookGenres } = await supabase
        .from('book_genres')
        .select('book_id, genres!inner(name)')
        .in('book_id', topBookIds.length > 0 ? topBookIds : ['00000000-0000-0000-0000-000000000000']);

      const genreCounts = new Map<string, number>();
      if (bookGenres) {
        for (const bg of bookGenres) {
          const genreName = (bg.genres as any)?.name;
          if (genreName) {
            genreCounts.set(genreName, (genreCounts.get(genreName) || 0) + 1);
          }
        }
      }

      const topGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      setTasteProfile({
        topBooks: (topBooksData || []).map(b => ({ id: b.id, title: b.title })),
        topGenres,
      });

      // Mark quiz as completed
      await supabase
        .from('user_profiles')
        .update({ completed_onboarding_quiz: true, skipped_onboarding_quiz: false })
        .eq('user_id', user.id);

      setQuizComplete(true);
    } catch (error) {
      console.error('Error completing quiz:', error);
      Alert.alert('Error', 'Failed to complete quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleContinueToRecommendations = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Generate initial recommendations
      const { error } = await generateRecommendations();
      if (error) {
        console.error('Error generating recommendations:', error);
        Alert.alert('Recommendations', 'We could not save recommendations yet. You can refresh later.');
      } else {
        Alert.alert('Recommendations Ready', 'Your recommendations are saved and ready to view.');
      }
      onQuizComplete?.();
      // After quiz completion, user is logged in and AuthContext will navigate to main app
      // App.tsx will automatically show TabNavigator when user exists
      // The recommendations will be available when user navigates to that screen
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Show loading during signup
  if (signingUp || !signupComplete) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
          <Text style={styles.loadingText}>
            {signingUp ? 'Creating your account...' : 'Loading quiz...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !currentPair && !quizComplete) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryBlue} />
          <Text style={styles.loadingText}>Loading quiz...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (quizComplete && tasteProfile) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
        <ScrollView contentContainerStyle={styles.completeContainer}>
          <Text style={styles.completeTitle}>Quiz Complete!</Text>
          <TasteProfileCard topBooks={tasteProfile.topBooks} topGenres={tasteProfile.topGenres} />
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinueToRecommendations}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.continueButtonText}>Get Recommendations</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!currentPair) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>No more book pairs available</Text>
          <TouchableOpacity style={styles.continueButton} onPress={handleQuizComplete}>
            <Text style={styles.continueButtonText}>Complete Quiz</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleSkipQuiz} style={styles.skipButton}>
          <Text style={styles.skipButtonText}>Skip Quiz</Text>
        </TouchableOpacity>
        <Text style={styles.progressText}>
          {comparisonCount}/{QUIZ_COMPARISON_COUNT}
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.questionText}>Which book do you prefer?</Text>
        <View style={styles.booksContainer}>
          <QuizBookCard
            book={currentPair.book1}
            onChoose={() => handleChoose(currentPair.book1, currentPair.book2)}
            disabled={submitting}
          />
          <Text style={styles.vsText}>VS</Text>
          <QuizBookCard
            book={currentPair.book2}
            onChoose={() => handleChoose(currentPair.book2, currentPair.book1)}
            disabled={submitting}
          />
        </View>
        <TouchableOpacity
          style={styles.skipComparisonButton}
          onPress={handleSkipComparison}
          disabled={submitting}
        >
          <Text style={styles.skipComparisonText}>Skip this comparison</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
    justifyContent: 'center',
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  skipButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    shadowColor: colors.primaryBlue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  skipButtonText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.white,
    opacity: 1,
  },
  progressText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionText: {
    fontSize: 24,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    textAlign: 'center',
    marginBottom: 24,
  },
  booksContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  vsText: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginHorizontal: 8,
    alignSelf: 'center',
  },
  skipComparisonButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    shadowColor: colors.primaryBlue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  skipComparisonText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.white,
    opacity: 1,
  },
  completeContainer: {
    flex: 1,
    paddingTop: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeTitle: {
    fontSize: 32,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    textAlign: 'center',
    marginBottom: 20,
  },
  continueButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
  },
  continueButtonText: {
    fontSize: 18,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
});
