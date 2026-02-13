import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';
import { Image, View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../config/theme';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabase';
import HomeStackNavigator from './HomeStackNavigator';
import YourShelfStackNavigator from './YourShelfStackNavigator';
import SearchStackNavigator from './SearchStackNavigator';
import LeaderboardStackNavigator from './LeaderboardStackNavigator';
import ProfileStackNavigator from './ProfileStackNavigator';
import homeIcon from '../../assets/home.png';
import yourShelfIcon from '../../assets/shelf.png';
import searchIcon from '../../assets/search.png';
import leaderboardIcon from '../../assets/leaderboard.png';

const Tab = createBottomTabNavigator();

// Profile icon component that shows profile photo or circular avatar
function ProfileTabIcon({ focused }: { focused: boolean }) {
  const { user } = useAuth();
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchProfilePhoto = async () => {
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('profile_photo_url')
          .eq('user_id', user.id)
          .single();
        
        if (data?.profile_photo_url) {
          setProfilePhotoUrl(data.profile_photo_url);
        }
      } catch (error) {
        console.error('Error fetching profile photo:', error);
      }
    };

    fetchProfilePhoto();
  }, [user]);

  const getInitial = () => {
    if (!user?.email) return 'U';
    return user.email?.split('@')[0]?.charAt(0)?.toUpperCase() || 'U';
  };

  if (profilePhotoUrl) {
    return (
      <Image
        source={{ uri: profilePhotoUrl }}
        style={[
          styles.profileIcon,
          focused && styles.profileIconFocused,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.profileIcon,
        styles.profileIconPlaceholder,
        focused && styles.profileIconFocused,
      ]}
    >
      <Text style={styles.profileIconText}>{getInitial()}</Text>
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primaryBlue,
        tabBarInactiveTintColor: colors.brownText,
        headerStyle: {
          backgroundColor: colors.creamBackground,
        },
        headerTintColor: colors.brownText,
        tabBarStyle: {
          backgroundColor: colors.creamBackground,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <Image
              source={homeIcon}
              style={{
                width: 40,
                height: 40,
              }}
              tintColor={focused ? colors.primaryBlue : colors.brownText}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tab.Screen
        name="Your Shelf"
        component={YourShelfStackNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <Image
              source={yourShelfIcon}
              style={{
                width: 40,
                height: 40,
              }}
              tintColor={focused ? colors.primaryBlue : colors.brownText}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchStackNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <Image
              source={searchIcon}
              style={{
                width: 40,
                height: 40,
              }}
              tintColor={focused ? colors.primaryBlue : colors.brownText}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardStackNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <Image
              source={leaderboardIcon}
              style={{
                width: 40,
                height: 40,
              }}
              tintColor={focused ? colors.primaryBlue : colors.brownText}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
        listeners={({ navigation, route }) => ({
          tabPress: () => {
            const state = route.state as any;
            if (state?.type === 'stack' && state.index > 0 && state.key) {
              navigation.dispatch({
                ...StackActions.popToTop(),
                target: state.key,
              });
            }
          },
        })}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  profileIcon: {
    width: 22,
    height: 22,
    borderRadius: 14,
  },
  profileIconPlaceholder: {
    backgroundColor: colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIconFocused: {
    borderWidth: 2,
    borderColor: colors.primaryBlue,
  },
  profileIconText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
});
