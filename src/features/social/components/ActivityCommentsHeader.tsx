import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type ActivityCommentsHeaderProps = {
  onBack: () => void;
  styles: {
    header: any;
    backButton: any;
    backButtonText: any;
    headerTitle: any;
    headerSpacer: any;
  };
};

export default function ActivityCommentsHeader({
  onBack,
  styles,
}: ActivityCommentsHeaderProps) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Comments</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}
