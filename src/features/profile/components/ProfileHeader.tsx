import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type ProfileHeaderProps = {
  title: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  styles: Record<string, object>;
};

export default function ProfileHeader({ title, onBack, rightSlot, styles }: ProfileHeaderProps) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerLeftSpacer} />
      )}
      <View style={styles.logoContainer}>
        <Text style={styles.logo}>{title}</Text>
      </View>
      <View style={styles.headerRight}>{rightSlot}</View>
    </View>
  );
}
