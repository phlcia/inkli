import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, typography } from '../../config/theme';
import GenreChip from './GenreChip';
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
  onDeleteCustomLabel?: (label: string) => Promise<void>;
}

export default function FilterPanel({
  visible,
  onClose,
  selectedGenres: initialSelectedGenres,
  selectedCustomLabels: initialSelectedCustomLabels,
  onFiltersChange,
  resultCount,
  shelfContext: _shelfContext,
  customLabelSuggestions,
  onClearFilters,
  onTrackFilterApplied,
  onTrackFilterCleared,
  onDeleteCustomLabel,
}: FilterPanelProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(initialSelectedGenres);
  const [selectedCustomLabels, setSelectedCustomLabels] = useState<string[]>(initialSelectedCustomLabels);
  const slideAnim = React.useRef(new Animated.Value(0)).current;
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const prevVisibleRef = React.useRef(visible);

  // Sync with parent state ONLY when modal first opens
  useEffect(() => {
    const justOpened = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;
    
    if (justOpened) {
      // Modal just opened - sync from parent
      setSelectedGenres(initialSelectedGenres);
      setSelectedCustomLabels(initialSelectedCustomLabels);
    }
    
    // Animation
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, initialSelectedGenres, initialSelectedCustomLabels, slideAnim]);

  // Real-time filtering: update parent when local filters change
  useEffect(() => {
    // Always notify parent of filter changes (even when clearing)
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
    // NOTE: Don't include onFiltersChange in deps - it would cause infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenres, selectedCustomLabels, resultCount, onTrackFilterApplied]);

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

  const handleDeleteLabel = useCallback(async (label: string) => {
    // Haptic feedback on long-press
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      'Delete Shelf',
      `Remove "${label}" from all your books? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await onDeleteCustomLabel?.(label);
              // Clear from local selection if currently selected
              setSelectedCustomLabels((prev) => prev.filter((l) => l !== label));
            } catch (_error) {
              Alert.alert('Error', 'Failed to delete shelf');
            }
          },
        },
      ]
    );
  }, [onDeleteCustomLabel]);

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
            {/* Preset Shelves Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Preset Shelves</Text>
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

            {/* Your Shelves Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Shelves</Text>
              {/* Show existing custom labels as clickable chips */}
              {customLabelSuggestions.length > 0 ? (
                <>
                  <View style={styles.chipsContainer}>
                    {customLabelSuggestions.map((label) => (
                      <GenreChip
                        key={label}
                        genre={label}
                        selected={selectedCustomLabels.includes(label)}
                        onPress={() => {
                          setSelectedCustomLabels((prev) =>
                            prev.includes(label)
                              ? prev.filter((l) => l !== label)
                              : [...prev, label]
                          );
                        }}
                        onLongPress={onDeleteCustomLabel ? () => handleDeleteLabel(label) : undefined}
                      />
                    ))}
                  </View>
                  {onDeleteCustomLabel && (
                    <Text style={styles.deleteHint}>Long-press a shelf to delete it</Text>
                  )}
                </>
              ) : (
                <Text style={styles.emptyHint}>
                  No custom shelves yet. Add them from a book's detail page.
                </Text>
              )}
            </View>

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
    minHeight: 300,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
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
    paddingBottom: 20,
  },
  section: {
    marginBottom: 16,
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
  emptyHint: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  deleteHint: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.5,
    fontStyle: 'italic',
    marginTop: 8,
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
