import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '../../../config/theme';

interface ReadingInterestsScreenProps {
  onComplete: (interests: string[], onError?: (message: string) => void) => void;
  onBack?: () => void;
}

const READING_CATEGORIES = [
  'Non-Fiction',
  'Business',
  'Fantasy',
  'Fiction',
  'Comic/Anime',
  'Technology',
  'Mystery',
  'Biography',
  'Thriller',
  'Romance',
  'Poetry',
  'Historical Fiction',
];

export default function ReadingInterestsScreen({
  onComplete,
  onBack,
}: ReadingInterestsScreenProps) {
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handleNext = async () => {
    if (loading) return;

    setLoading(true);
    
    const handleError = (message: string) => {
      setLoading(false);
      Alert.alert(
        'Signup Issue',
        message,
        [{ text: 'OK' }]
      );
    };

    try {
      await onComplete(selectedInterests, handleError);
      // If we get here without error, signup was successful
      // The auth context will automatically navigate to the main app
    } catch (error: any) {
      setLoading(false);
      Alert.alert(
        'Error',
        error.message || 'Failed to complete signup. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.creamBackground} />
      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.title}>what are you interested in reading?</Text>

        {/* Categories Grid */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.categoriesContainer}
          showsVerticalScrollIndicator={false}
        >
          {READING_CATEGORIES.map((category) => {
            const isSelected = selectedInterests.includes(category);
            return (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryTag,
                  isSelected && styles.categoryTagSelected,
                ]}
                onPress={() => toggleInterest(category)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    isSelected && styles.categoryTextSelected,
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Next Button */}
        <TouchableOpacity
          style={[styles.nextButton, loading && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={Boolean(loading)}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.nextButtonText}>Next</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    textAlign: 'center',
    marginBottom: 32,
  },
  scrollView: {
    flex: 1,
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 24,
    paddingBottom: 20,
  },
  categoryTag: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brownText,
    backgroundColor: 'transparent',
    marginRight: 12,
    marginBottom: 12,
  },
  categoryTagSelected: {
    backgroundColor: colors.primaryBlue,
    borderColor: colors.primaryBlue,
  },
  categoryText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.brownText,
  },
  categoryTextSelected: {
    color: colors.white,
  },
  nextButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    color: colors.white,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '600',
  },
});
