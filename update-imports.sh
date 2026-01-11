#!/bin/bash

# Script to update all import paths after reorganizing the codebase
# Run this script from the project root directory

set -e  # Exit on error

echo "🔄 Updating import paths..."

# ============================================================================
# 1. UPDATE NAVIGATION FILES
# ============================================================================

echo "📁 Updating navigation files..."

# AuthStackNavigator.tsx
sed -i '' "s|from '../screens/WelcomeScreen'|from '../features/auth/screens/WelcomeScreen'|g" src/navigation/AuthStackNavigator.tsx
sed -i '' "s|from '../screens/CreateAccountScreen'|from '../features/auth/screens/CreateAccountScreen'|g" src/navigation/AuthStackNavigator.tsx
sed -i '' "s|from '../screens/SignUpEmailScreen'|from '../features/auth/screens/SignUpEmailScreen'|g" src/navigation/AuthStackNavigator.tsx
sed -i '' "s|from '../screens/SetupProfileScreen'|from '../features/auth/screens/SetupProfileScreen'|g" src/navigation/AuthStackNavigator.tsx
sed -i '' "s|from '../screens/ReadingInterestsScreen'|from '../features/auth/screens/ReadingInterestsScreen'|g" src/navigation/AuthStackNavigator.tsx
sed -i '' "s|from '../screens/SignInScreen'|from '../features/auth/screens/SignInScreen'|g" src/navigation/AuthStackNavigator.tsx

# HomeStackNavigator.tsx
sed -i '' "s|from '../screens/HomeScreen'|from '../features/home/screens/HomeScreen'|g" src/navigation/HomeStackNavigator.tsx
sed -i '' "s|from '../screens/BookDetailScreen'|from '../features/books/screens/BookDetailScreen'|g" src/navigation/HomeStackNavigator.tsx
sed -i '' "s|from '../screens/ActivityLikesScreen'|from '../features/social/screens/ActivityLikesScreen'|g" src/navigation/HomeStackNavigator.tsx
sed -i '' "s|from '../screens/ActivityCommentsScreen'|from '../features/social/screens/ActivityCommentsScreen'|g" src/navigation/HomeStackNavigator.tsx
sed -i '' "s|from '../screens/UserProfileScreen'|from '../features/profile/screens/UserProfileScreen'|g" src/navigation/HomeStackNavigator.tsx
sed -i '' "s|from '../screens/UserShelfScreen'|from '../features/social/screens/UserShelfScreen'|g" src/navigation/HomeStackNavigator.tsx
sed -i '' "s|from '../screens/NotificationsScreen'|from '../features/social/screens/NotificationsScreen'|g" src/navigation/HomeStackNavigator.tsx

# ProfileStackNavigator.tsx
sed -i '' "s|from '../screens/ProfileScreen'|from '../features/profile/screens/ProfileScreen'|g" src/navigation/ProfileStackNavigator.tsx
sed -i '' "s|from '../screens/EditProfileScreen'|from '../features/profile/screens/EditProfileScreen'|g" src/navigation/ProfileStackNavigator.tsx
sed -i '' "s|from '../screens/BookDetailScreen'|from '../features/books/screens/BookDetailScreen'|g" src/navigation/ProfileStackNavigator.tsx
sed -i '' "s|from '../screens/FollowersFollowingScreen'|from '../features/social/screens/FollowersFollowingScreen'|g" src/navigation/ProfileStackNavigator.tsx
sed -i '' "s|from '../screens/ActivityLikesScreen'|from '../features/social/screens/ActivityLikesScreen'|g" src/navigation/ProfileStackNavigator.tsx
sed -i '' "s|from '../screens/ActivityCommentsScreen'|from '../features/social/screens/ActivityCommentsScreen'|g" src/navigation/ProfileStackNavigator.tsx
sed -i '' "s|from '../screens/UserProfileScreen'|from '../features/profile/screens/UserProfileScreen'|g" src/navigation/ProfileStackNavigator.tsx

# SearchStackNavigator.tsx
sed -i '' "s|from '../screens/SearchScreen'|from '../features/search/screens/SearchScreen'|g" src/navigation/SearchStackNavigator.tsx
sed -i '' "s|from '../screens/BookDetailScreen'|from '../features/books/screens/BookDetailScreen'|g" src/navigation/SearchStackNavigator.tsx
sed -i '' "s|from '../screens/BookRankingScreen'|from '../features/books/screens/BookRankingScreen'|g" src/navigation/SearchStackNavigator.tsx
sed -i '' "s|from '../screens/UserProfileScreen'|from '../features/profile/screens/UserProfileScreen'|g" src/navigation/SearchStackNavigator.tsx
sed -i '' "s|from '../screens/UserShelfScreen'|from '../features/social/screens/UserShelfScreen'|g" src/navigation/SearchStackNavigator.tsx
sed -i '' "s|from '../screens/FollowersFollowingScreen'|from '../features/social/screens/FollowersFollowingScreen'|g" src/navigation/SearchStackNavigator.tsx
sed -i '' "s|from '../screens/ActivityLikesScreen'|from '../features/social/screens/ActivityLikesScreen'|g" src/navigation/SearchStackNavigator.tsx
sed -i '' "s|from '../screens/ActivityCommentsScreen'|from '../features/social/screens/ActivityCommentsScreen'|g" src/navigation/SearchStackNavigator.tsx

# YourShelfStackNavigator.tsx
sed -i '' "s|from '../screens/YourShelfScreen'|from '../features/shelf/screens/YourShelfScreen'|g" src/navigation/YourShelfStackNavigator.tsx
sed -i '' "s|from '../screens/BookDetailScreen'|from '../features/books/screens/BookDetailScreen'|g" src/navigation/YourShelfStackNavigator.tsx

# TabNavigator.tsx
sed -i '' "s|from '../screens/LeaderboardScreen'|from '../features/leaderboard/screens/LeaderboardScreen'|g" src/navigation/TabNavigator.tsx

echo "✅ Navigation files updated"

# ============================================================================
# 2. UPDATE SCREEN FILES - Component imports
# ============================================================================

echo "📱 Updating screen files - component imports..."

# BookDetailScreen.tsx - BookCoverPlaceholder is now in same feature
sed -i '' "s|from '../components/BookCoverPlaceholder'|from '../components/BookCoverPlaceholder'|g" src/features/books/screens/BookDetailScreen.tsx

# BookRankingScreen.tsx - BookComparisonModal is in same feature, DatePickerModal moved to ui
sed -i '' "s|from '../components/BookComparisonModal'|from '../components/BookComparisonModal'|g" src/features/books/screens/BookRankingScreen.tsx
sed -i '' "s|from '../components/DatePickerModal'|from '../../../components/ui/DatePickerModal'|g" src/features/books/screens/BookRankingScreen.tsx

# EditProfileScreen.tsx - ProfilePhotoActionSheet is in same feature
sed -i '' "s|from '../components/ProfilePhotoActionSheet'|from '../components/ProfilePhotoActionSheet'|g" src/features/profile/screens/EditProfileScreen.tsx

# ActivityCommentsScreen.tsx - RecentActivityCard is in same feature
sed -i '' "s|from '../components/RecentActivityCard'|from '../components/RecentActivityCard'|g" src/features/social/screens/ActivityCommentsScreen.tsx

# HomeScreen.tsx - RecentActivityCard is cross-feature (from social)
sed -i '' "s|from '../components/RecentActivityCard'|from '../../social/components/RecentActivityCard'|g" src/features/home/screens/HomeScreen.tsx

# ProfileScreen.tsx - RecentActivityCard is cross-feature (from social)
sed -i '' "s|from '../components/RecentActivityCard'|from '../../social/components/RecentActivityCard'|g" src/features/profile/screens/ProfileScreen.tsx

# UserProfileScreen.tsx - RecentActivityCard is cross-feature (from social)
sed -i '' "s|from '../components/RecentActivityCard'|from '../../social/components/RecentActivityCard'|g" src/features/profile/screens/UserProfileScreen.tsx

# YourShelfScreen.tsx - ShelfScreen is in same feature
sed -i '' "s|from '../components/ShelfScreen'|from '../components/ShelfScreen'|g" src/features/shelf/screens/YourShelfScreen.tsx

# UserShelfScreen.tsx - ShelfScreen is cross-feature (from shelf)
sed -i '' "s|from '../components/ShelfScreen'|from '../../../shelf/components/ShelfScreen'|g" src/features/social/screens/UserShelfScreen.tsx

echo "✅ Component imports updated"

# ============================================================================
# 3. UPDATE SCREEN FILES - Config/Contexts/Services/Navigation imports
# ============================================================================

echo "🔧 Updating screen files - config/contexts/services/navigation imports..."

# These need to go from '../' to '../../../' (2 more levels up)
# Update all files in features/*/screens/

# Config imports
find src/features -name "*.tsx" -type f | xargs sed -i '' "s|from '../config/theme'|from '../../../config/theme'|g"
find src/features -name "*.tsx" -type f | xargs sed -i '' "s|from '../config/supabase'|from '../../../config/supabase'|g"

# Contexts imports
find src/features -name "*.tsx" -type f | xargs sed -i '' "s|from '../contexts/AuthContext'|from '../../../contexts/AuthContext'|g"

# Services imports
find src/features -name "*.tsx" -type f | xargs sed -i '' "s|from '../services/|from '../../../services/|g"

# Navigation imports
find src/features -name "*.tsx" -type f | xargs sed -i '' "s|from '../navigation/|from '../../../navigation/|g"

# Utils imports
find src/features -name "*.tsx" -type f | xargs sed -i '' "s|from '../utils/|from '../../../utils/|g"

# Types imports (from src/types)
find src/features -name "*.tsx" -type f | xargs sed -i '' "s|from '../types/|from '../../../types/|g"

echo "✅ Config/contexts/services/navigation imports updated"

# ============================================================================
# 4. UPDATE COMPONENT FILES - If they import from config/services/etc
# ============================================================================

echo "🧩 Updating component files..."

# Update component files that might import from config/services
# Auth components
find src/features/auth/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../config/|from '../../../config/|g" 2>/dev/null || true
find src/features/auth/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../contexts/|from '../../../contexts/|g" 2>/dev/null || true
find src/features/auth/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../services/|from '../../../services/|g" 2>/dev/null || true

# Book components
find src/features/books/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../config/|from '../../../config/|g" 2>/dev/null || true
find src/features/books/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../contexts/|from '../../../contexts/|g" 2>/dev/null || true
find src/features/books/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../services/|from '../../../services/|g" 2>/dev/null || true

# Profile components
find src/features/profile/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../config/|from '../../../config/|g" 2>/dev/null || true
find src/features/profile/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../contexts/|from '../../../contexts/|g" 2>/dev/null || true
find src/features/profile/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../services/|from '../../../services/|g" 2>/dev/null || true

# Social components
find src/features/social/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../config/|from '../../../config/|g" 2>/dev/null || true
find src/features/social/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../contexts/|from '../../../contexts/|g" 2>/dev/null || true
find src/features/social/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../services/|from '../../../services/|g" 2>/dev/null || true
find src/features/social/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../types/|from '../../../types/|g" 2>/dev/null || true

# Shelf components
find src/features/shelf/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../config/|from '../../../config/|g" 2>/dev/null || true
find src/features/shelf/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../contexts/|from '../../../contexts/|g" 2>/dev/null || true
find src/features/shelf/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../services/|from '../../../services/|g" 2>/dev/null || true
find src/features/shelf/components -name "*.tsx" -type f | xargs sed -i '' "s|from '../../navigation/|from '../../../navigation/|g" 2>/dev/null || true

# UI components (DatePicker, DatePickerModal)
find src/components/ui -name "*.tsx" -type f | xargs sed -i '' "s|from '../config/|from '../../config/|g" 2>/dev/null || true
find src/components/ui -name "*.tsx" -type f | xargs sed -i '' "s|from '../contexts/|from '../../contexts/|g" 2>/dev/null || true
find src/components/ui -name "*.tsx" -type f | xargs sed -i '' "s|from '../services/|from '../../services/|g" 2>/dev/null || true

echo "✅ Component files updated"

# ============================================================================
# 5. SPECIAL FIXES
# ============================================================================

echo "🔍 Applying special fixes..."

# Fix DatePicker.tsx if it imports DatePickerModal (check if needed)
# This would be in src/components/ui/DatePicker.tsx if DatePicker uses DatePickerModal

# Fix any double-replacement issues (shouldn't happen, but just in case)
# sed -i '' "s|from '../../../../|from '../../../|g" src/features/**/*.tsx 2>/dev/null || true

echo "✅ Special fixes applied"

# ============================================================================
# DONE
# ============================================================================

echo ""
echo "✨ All import paths have been updated!"
echo ""
echo "📋 Next steps:"
echo "   1. Run: npm run lint (or yarn lint) to check for any issues"
echo "   2. Try building: npm start"
echo "   3. Test navigation to ensure everything works"
echo ""