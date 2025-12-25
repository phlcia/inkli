import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../config/theme';

export default function OnboardingTabBar() {
  return (
    <View style={styles.container}>
      <View style={styles.tab}>
        <Text style={styles.tabIcon}>🏠</Text>
      </View>
      <View style={styles.tab}>
        <Text style={styles.tabIcon}>🔍</Text>
      </View>
      <View style={styles.tab}>
        <Text style={[styles.tabIcon, styles.tabIconActive]}>👤</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.creamBackground,
    borderTopWidth: 1,
    borderTopColor: colors.brownText,
    borderTopOpacity: 0.1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
    minHeight: 60,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
  },
  tabIcon: {
    fontSize: 24,
    opacity: 0.3,
  },
  tabIconActive: {
    opacity: 1,
  },
});
