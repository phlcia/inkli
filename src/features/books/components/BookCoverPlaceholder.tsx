import React from 'react';
import { View, Text } from 'react-native';

type BookCoverPlaceholderProps = {
  title: string;
  author: string;
  width?: number;
  height?: number;
};

export function BookCoverPlaceholder({
  title,
  author,
  width = 120,
  height = 180,
}: BookCoverPlaceholderProps) {
  const getColorFromString = (value: string) => {
    const palette = [
      '#4EACE3',
      '#6FB8D6',
      '#2FA463',
      '#CFA15F',
      '#B8845A',
      '#8FB7A5',
      '#9B7B6C',
      '#7FA4C8',
    ];
    const hash = value.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    return palette[Math.abs(hash) % palette.length];
  };

  const bgColor = getColorFromString(title);
  const initials = title
    .split(' ')
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return (
    <View
      style={{
        width,
        height,
        backgroundColor: bgColor,
        borderRadius: 8,
        padding: 12,
        justifyContent: 'space-between',
      }}
    >
      <Text
        style={{
          color: 'white',
          fontSize: 48,
          fontWeight: '700',
          opacity: 0.9,
        }}
      >
        {initials}
      </Text>
      <View>
        <Text
          numberOfLines={3}
          style={{
            color: 'white',
            fontSize: 12,
            fontWeight: '600',
            marginBottom: 4,
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: 'white',
            fontSize: 10,
            opacity: 0.8,
          }}
        >
          {author}
        </Text>
      </View>
    </View>
  );
}
