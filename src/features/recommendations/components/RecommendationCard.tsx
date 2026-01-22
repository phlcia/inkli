import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography } from '../../../config/theme';
import { Book } from '../../../services/books';

interface RecommendationCardProps {
  book: Book;
  reasoning: string;
  onPress: () => void;
  onRank: () => void;
}

export default function RecommendationCard({
  book,
  reasoning,
  onPress,
  onRank,
}: RecommendationCardProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.content}>
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
          <Text style={styles.reasoning}>{reasoning}</Text>
          <TouchableOpacity style={styles.rankButton} onPress={onRank}>
            <Text style={styles.rankButtonText}>Rank this book</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flexDirection: 'row',
    padding: 16,
  },
  cover: {
    width: 80,
    height: 120,
    borderRadius: 8,
    marginRight: 16,
  },
  coverPlaceholder: {
    width: 80,
    height: 120,
    borderRadius: 8,
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  coverPlaceholderText: {
    fontSize: 32,
    fontFamily: typography.heroTitle,
    color: colors.white,
  },
  info: {
    flex: 1,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 4,
  },
  author: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
    marginBottom: 8,
  },
  reasoning: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.8,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  rankButton: {
    backgroundColor: colors.primaryBlue,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  rankButtonText: {
    fontSize: 14,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
});
