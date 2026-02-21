import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { colors, typography } from '../../../config/theme';
import { Book } from '../../../services/books';

const SCREEN_WIDTH = Dimensions.get('window').width;
const NARROW = SCREEN_WIDTH < 360;
// 40 = content paddingHorizontal*2, 16+16 = card margin*2 each side, 16 = vs marginHorizontal*2
const CARD_WIDTH = NARROW
  ? SCREEN_WIDTH - 40 - 32
  : (SCREEN_WIDTH - 40 - 16 - 16 - 16) / 2;

interface QuizBookCardProps {
  book: Book;
  onChoose: () => void;
  disabled?: boolean;
}

export default function QuizBookCard({ book, onChoose, disabled }: QuizBookCardProps) {
  const authorText = book.authors?.join(', ') || 'Unknown Author';
  const chooseLabel = `Choose ${book.title} by ${authorText}`;

  return (
    <View style={[styles.container, disabled && styles.disabled, { width: CARD_WIDTH }]}>
      {book.cover_url ? (
        <Image source={{ uri: book.cover_url }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Text style={styles.coverPlaceholderText}>
            {(book.title || '?').trim().charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={3}>
          {book.title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {authorText}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={onChoose}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={chooseLabel}
        accessibilityHint="Selects this book as your preference"
        accessibilityState={{ disabled: !!disabled }}
      >
        <Text style={styles.buttonText}>Choose this</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    margin: 8,
    alignItems: 'center',
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  disabled: {
    opacity: 0.5,
  },
  cover: {
    width: 120,
    height: 180,
    borderRadius: 8,
    marginBottom: 12,
  },
  coverPlaceholder: {
    width: 120,
    height: 180,
    borderRadius: 8,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  coverPlaceholderText: {
    fontSize: 48,
    fontFamily: typography.heroTitle,
    color: colors.white,
  },
  info: {
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
    minHeight: 80,
  },
  title: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  author: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
    textAlign: 'center',
  },
});
