import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { colors, typography } from '../../config/theme';
import GenreChip from './GenreChip';
import CustomLabelInput from './CustomLabelInput';
import { PRESET_GENRES } from '../../utils/genreMapper';
import { ShelfContext } from '../../services/analytics';

interface FilterPanelProps {
  visible: boolean;
  onClose: () => void;
  selectedGenres: string[];
  selectedCustomLabels: string[];
  onFiltersChange: (genres: string[], customLabels: string[]) => void;
  resultCount: number;
  shelfContext: ShelfContext;
  customLabelSuggestions: string[];
  onClearFilters: () => void;
  onTrackFilterApplied?: (genres: string[], customLabels: string[], resultCount: number) => void;
  onTrackFilterCleared?: () => void;
}

export default function FilterPanel({
  visible,
  onClose,
  selectedGenres: initialSelectedGenres,
  selectedCustomLabels: initialSelectedCustomLabels,
  onFiltersChange,
  resultCount,
  shelfContext,
  customLabelSuggestions,
  onClearFilters,
  onTrackFilterApplied,
  onTrackFilterCleared,
}: FilterPanelProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(initialSelectedGenres);
  const [selectedCustomLabels, setSelectedCustomLabels] = useState<string[]>(initialSelectedCustomLabels);
  const slideAnim = React.useRef(new Animated.Value(0)).current;
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Sync with parent state when visible changes
  useEffect(() => {
    if (visible) {
      setSelectedGenres(initialSelectedGenres);
      setSelectedCustomLabels(initialSelectedCustomLabels);
      // Animate fade and scale in
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      // Animate fade and scale out
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, initialSelectedGenres, initialSelectedCustomLabels, slideAnim]);

  // Real-time filtering: immediately update parent when filters change
  useEffect(() => {
    onFiltersChange(selectedGenres, selectedCustomLabels);

    // Debounce analytics tracking (300ms after last change)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Only track if filters are actually applied (not empty)
    if ((selectedGenres.length > 0 || selectedCustomLabels.length > 0) && onTrackFilterApplied) {
      debounceTimerRef.current = setTimeout(() => {
        onTrackFilterApplied(selectedGenres, selectedCustomLabels, resultCount);
      }, 300);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [selectedGenres, selectedCustomLabels, onFiltersChange, resultCount, onTrackFilterApplied]);

  const handleGenreToggle = useCallback((genre: string) => {
    setSelectedGenres((prev) => {
      if (prev.includes(genre)) {
        return prev.filter((g) => g !== genre);
      } else {
        return [...prev, genre];
      }
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedGenres([]);
    setSelectedCustomLabels([]);
    onClearFilters();
    // Immediately track filter cleared (no debounce)
    if (onTrackFilterCleared) {
      onTrackFilterCleared();
    }
  }, [onClearFilters, onTrackFilterCleared]);

  const opacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const scale = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  const hasActiveFilters = selectedGenres.length > 0 || selectedCustomLabels.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.panel,
            {
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Filter Books</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Preset Genres Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Genres</Text>
              <View style={styles.chipsContainer}>
                {PRESET_GENRES.map((genre) => (
                  <GenreChip
                    key={genre}
                    genre={genre}
                    selected={selectedGenres.includes(genre)}
                    onPress={() => handleGenreToggle(genre)}
                  />
                ))}
              </View>
            </View>

            {/* Custom Labels Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Custom Labels</Text>
              <CustomLabelInput
                selectedLabels={selectedCustomLabels}
                onLabelsChange={setSelectedCustomLabels}
                suggestions={customLabelSuggestions}
              />
            </View>

            {/* Results Count */}
            {hasActiveFilters && (
              <View style={styles.resultsContainer}>
                <Text style={styles.resultsText}>
                  {resultCount} {resultCount === 1 ? 'result' : 'results'}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Footer with Clear Button */}
          {hasActiveFilters && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClearFilters}
              >
                <Text style={styles.clearButtonText}>Clear Filters</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    backgroundColor: colors.creamBackground,
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.brownText + '20',
  },
  title: {
    fontSize: 24,
    fontFamily: typography.sectionHeader,
    color: colors.brownText,
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.primaryBlue,
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: typography.sectionHeader,
    color: colors.brownText,
    marginBottom: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  resultsContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 8,
    alignItems: 'center',
  },
  resultsText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.brownText + '20',
    backgroundColor: colors.creamBackground,
  },
  clearButton: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brownText + '40',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
});
