import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography } from '../../../config/theme';
import { Book } from '../../../services/books';

interface QuizBookCardProps {
  book: Book;
  onChoose: () => void;
  disabled?: boolean;
}

export default function QuizBookCard({ book, onChoose, disabled }: QuizBookCardProps) {
  return (
    <TouchableOpacity
      style={[styles.container, disabled && styles.disabled]}
      onPress={onChoose}
      disabled={disabled}
      activeOpacity={0.7}
    >
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
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {book.authors?.join(', ') || 'Unknown Author'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={onChoose}
        disabled={disabled}
      >
        <Text style={styles.buttonText}>Choose this</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  buttonText: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
});
