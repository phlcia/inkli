import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../../../config/theme';

interface TasteProfileCardProps {
  topBooks: Array<{ title: string; id: string }>;
  topGenres: string[];
}

export default function TasteProfileCard({ topBooks, topGenres }: TasteProfileCardProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Reading Taste</Text>
      <View style={styles.section}>
        <Text style={styles.label}>You loved:</Text>
        <View style={styles.items}>
          {topBooks.slice(0, 3).map((book, index) => (
            <Text key={book.id} style={styles.item}>
              {book.title}
              {index < Math.min(topBooks.length, 3) - 1 ? ', ' : ''}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>You're into:</Text>
        <View style={styles.items}>
          {topGenres.slice(0, 3).map((genre, index) => (
            <Text key={genre} style={styles.item}>
              {genre}
              {index < Math.min(topGenres.length, 3) - 1 ? ', ' : ''}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 24,
    margin: 20,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontFamily: typography.heroTitle,
    color: colors.brownText,
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 8,
  },
  items: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  item: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.8,
  },
});
