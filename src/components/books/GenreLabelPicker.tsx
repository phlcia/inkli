import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { colors, typography } from '../../config/theme';
import GenreChip from '../filters/GenreChip';
import CustomLabelInput from '../filters/CustomLabelInput';
import { PRESET_GENRES } from '../../utils/genreMapper';
import { getSuggestedGenres } from '../../utils/genreMapper';

interface GenreLabelPickerProps {
  visible: boolean;
  onClose: () => void;
  onSave: (genres: string[], customLabels: string[]) => void;
  apiCategories?: string[] | null; // Raw API categories for display/reference
  initialGenres?: string[]; // Pre-existing genres (for editing)
  initialCustomLabels?: string[]; // Pre-existing custom labels (for editing)
  customLabelSuggestions: string[]; // User's existing custom labels for auto-complete
  bookId?: string; // Optional book ID for genre mapping logging
  loading?: boolean;
}

export default function GenreLabelPicker({
  visible,
  onClose,
  onSave,
  apiCategories,
  initialGenres,
  initialCustomLabels,
  customLabelSuggestions,
  bookId,
  loading = false,
}: GenreLabelPickerProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(initialGenres || []);
  const [selectedCustomLabels, setSelectedCustomLabels] = useState<string[]>(initialCustomLabels || []);
  const [mappedGenres, setMappedGenres] = useState<string[]>([]);
  const [mappingGenres, setMappingGenres] = useState(true);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  // Map API categories to suggested genres when component opens or API categories change
  useEffect(() => {
    if (visible && apiCategories && !initialGenres) {
      // Only auto-map if editing existing book with no genres
      setMappingGenres(true);
      getSuggestedGenres(apiCategories, bookId)
        .then((suggestions) => {
          setMappedGenres(suggestions);
          // Pre-select mapped genres if user hasn't selected any yet
          if (selectedGenres.length === 0) {
            setSelectedGenres(suggestions);
          }
          setMappingGenres(false);
        })
        .catch((error) => {
          console.error('Error mapping genres:', error);
          setMappedGenres([]);
          setMappingGenres(false);
        });
    } else if (visible && initialGenres) {
      // Editing existing book - use existing genres
      setMappedGenres(initialGenres);
      setSelectedGenres(initialGenres);
      setMappingGenres(false);
    } else if (!visible) {
      // Reset when modal closes
      setSelectedGenres([]);
      setSelectedCustomLabels([]);
      setMappedGenres([]);
      setMappingGenres(false);
    }
  }, [visible, apiCategories, initialGenres, bookId]);

  // Animate modal appearance
  useEffect(() => {
    if (visible) {
      // Animate fade and scale in
      Animated.spring(fadeAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      // Animate fade and scale out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim]);

  const opacity = fadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const scale = fadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  const handleGenreToggle = (genre: string) => {
    setSelectedGenres((prev) => {
      if (prev.includes(genre)) {
        return prev.filter((g) => g !== genre);
      } else {
        return [...prev, genre];
      }
    });
  };

  const handleSave = () => {
    // Auto-apply logic: if user selected no genres, use mapped suggestions or fallback
    let finalGenres = selectedGenres;
    if (finalGenres.length === 0) {
      // Use mapped genres if available, otherwise fallback
      finalGenres = mappedGenres.length > 0 ? mappedGenres : ['Fiction'];
    }

    // Never save with empty genres array
    if (finalGenres.length === 0) {
      finalGenres = ['Fiction'];
    }

    onSave(finalGenres, selectedCustomLabels);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
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
            styles.modalContent,
            {
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Edit Shelves</Text>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                onPress={handleSave}
                style={styles.saveButton}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* API Categories Reference (if available) */}
            {apiCategories && apiCategories.length > 0 && (
              <View style={styles.apiCategoriesSection}>
                <Text style={styles.sectionLabel}>Original Categories</Text>
                <Text style={styles.apiCategoriesText}>
                  {apiCategories.join(', ')}
                </Text>
                <Text style={styles.apiCategoriesHint}>
                  These are the original categories from the book's source. Select preset genres below.
                </Text>
              </View>
            )}

            {/* Preset Genres Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Genres</Text>
              {mappingGenres && !initialGenres ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.primaryBlue} />
                  <Text style={styles.loadingText}>Mapping genres...</Text>
                </View>
              ) : (
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
              )}
              <Text style={styles.hint}>
                {selectedGenres.length === 0
                  ? 'No genres selected. Mapped suggestions will be applied on save.'
                  : `Selected: ${selectedGenres.length} genre${selectedGenres.length === 1 ? '' : 's'}`}
              </Text>
            </View>

            {/* Custom Labels Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Custom Labels</Text>
              <Text style={styles.hint}>Add your own tags (optional)</Text>
              <CustomLabelInput
                selectedLabels={selectedCustomLabels}
                onLabelsChange={setSelectedCustomLabels}
                suggestions={customLabelSuggestions}
              />
            </View>
          </ScrollView>
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
  modalContent: {
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
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  saveButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.brownText,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
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
  sectionLabel: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 4,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  hint: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    marginTop: 8,
  },
  apiCategoriesSection: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brownText + '20',
  },
  apiCategoriesText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.8,
    marginBottom: 4,
  },
  apiCategoriesHint: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
});
