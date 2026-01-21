import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../../config/theme';
import { PRESET_GENRES } from '../../utils/genreMapper';

interface GenreChipProps {
  genre: string;
  selected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

export default function GenreChip({ 
  genre, 
  selected, 
  onPress, 
  onLongPress 
}: GenreChipProps) {
  // Only custom labels (not preset genres) support long-press deletion
  const isCustomLabel = !PRESET_GENRES.includes(genre as any);
  
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      onLongPress={isCustomLabel && onLongPress ? onLongPress : undefined}
      delayLongPress={500}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {genre}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.brownText + '40',
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {
    backgroundColor: colors.primaryBlue,
    borderColor: colors.primaryBlue,
  },
  chipText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
});
