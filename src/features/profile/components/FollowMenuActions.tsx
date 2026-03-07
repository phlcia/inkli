import React from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../../../config/theme';
import dropdownIcon from '../../../../assets/dropdown.png';

type FollowMenuActionsProps = {
  followLoading: boolean;
  isFollowing: boolean;
  followRequestPending: boolean;
  followLabel: string;
  isMuted: boolean;
  blockedByViewer: boolean;
  followMenuOpen: boolean;
  onToggleFollow: () => void;
  onToggleMenu: () => void;
  onMutePress: () => void;
  onBlockPress: () => void;
  onReportPress: () => void;
  styles: Record<string, object>;
};

export default function FollowMenuActions({
  followLoading,
  isFollowing,
  followRequestPending,
  followLabel,
  isMuted,
  blockedByViewer,
  followMenuOpen,
  onToggleFollow,
  onToggleMenu,
  onMutePress,
  onBlockPress,
  onReportPress,
  styles,
}: FollowMenuActionsProps) {
  const isActive = isFollowing || followRequestPending;

  return (
    <View style={styles.actionButtons}>
      <View style={styles.followGroup}>
        <TouchableOpacity
          style={[
            styles.followButton,
            isActive && styles.followingButton,
            styles.followButtonConnected,
          ]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggleFollow();
          }}
          disabled={followLoading}
        >
          {followLoading ? (
            <ActivityIndicator
              size="small"
              color={isActive ? colors.brownText : colors.white}
            />
          ) : (
            <Text
              style={[
                styles.followButtonText,
                isActive && styles.followingButtonText,
              ]}
            >
              {followLabel}
            </Text>
          )}
        </TouchableOpacity>
        <>
          <TouchableOpacity
            style={[styles.followMenuTrigger, isActive && styles.followingButton]}
            onPress={onToggleMenu}
            activeOpacity={0.8}
          >
            <Image
              source={dropdownIcon}
              style={[
                styles.followMenuTriggerIcon,
                isActive && styles.followMenuTriggerIconFollowing,
              ]}
              resizeMode="contain"
            />
          </TouchableOpacity>
          {followMenuOpen && (
            <View style={styles.followMenu}>
              <TouchableOpacity style={styles.followMenuItem} onPress={() => {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onMutePress();
              }}>
                <Text style={styles.followMenuItemText}>{isMuted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.followMenuItem} onPress={() => {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onBlockPress();
              }}>
                <Text style={styles.followMenuItemText}>{blockedByViewer ? 'Unblock' : 'Block'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.followMenuItem} onPress={() => {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onReportPress();
              }}>
                <Text style={styles.followMenuItemText}>Report User</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      </View>
    </View>
  );
}
