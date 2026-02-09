import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CompositeNavigationProp,
  RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors, typography } from '../../../config/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { ProfileStackParamList } from '../../../navigation/ProfileStackNavigator';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';
import { ActivityCommentsParams } from '../../../navigation/types';
import { supabase } from '../../../config/supabase';
import { UserBook } from '../../../services/books';
import { fetchBookWithUserStatus } from '../../../services/bookDetails';
import { formatDateRange } from '../../../utils/dateRanges';
import { useToggleWantToRead } from '../../books/hooks/useToggleWantToRead';
import ActivityCommentsHeader from '../components/ActivityCommentsHeader';
import ActivityCommentsList from '../components/ActivityCommentsList';
import { useActivityComments } from '../hooks/useActivityComments';

type ActivityCommentsRoute = RouteProp<
  { ActivityComments: ActivityCommentsParams },
  'ActivityComments'
>;

export default function ActivityCommentsScreen() {
  const { user: currentUser } = useAuth();
  type ActivityCommentsNavigation = CompositeNavigationProp<
    StackNavigationProp<ProfileStackParamList, 'ActivityComments'>,
    StackNavigationProp<SearchStackParamList, 'ActivityComments'>
  >;

  const navigation = useNavigation<ActivityCommentsNavigation>();
  const route = useRoute<ActivityCommentsRoute>();
  const { userBookId } = route.params;

  const {
    rows,
    loading,
    refreshing,
    commentText,
    posting,
    replyTo,
    likeCounts,
    likedKeys,
    mentionResults,
    showMentions,
    mentionLoading,
    selection,
    activeMentionIndex,
    headerUserBook,
    headerActionText,
    headerAvatarUrl,
    headerAvatarFallback,
    headerViewerStatus,
    currentUserAvatarUrl,
    currentUserAvatarFallback,
    setReplyTo,
    setShowMentions,
    handleRefresh,
    handlePost,
    handleToggleLike,
    handleChangeText,
    handleSelectionChange,
    handleSelectMention,
    handleMentionKeyPress,
  } = useActivityComments({
    currentUser,
    userBookId,
    headerParams: {
      userBook: route.params.userBook || null,
      actionText: route.params.actionText || '',
      avatarUrl: route.params.avatarUrl || null,
      avatarFallback: route.params.avatarFallback || 'U',
      viewerStatus: route.params.viewerStatus ?? null,
    },
  });
  const [viewerShelfMap, setViewerShelfMap] = useState<
    Record<string, { id: string; status: UserBook['status'] }>
  >({});
  const handleToggleWantToRead = useToggleWantToRead({
    currentUserId: currentUser?.id,
    viewerShelfMap,
    setViewerShelfMap,
  });
  const canMention = !!currentUser?.id;

  useEffect(() => {
    const loadViewerShelfStatus = async () => {
      if (!currentUser?.id || !headerUserBook?.book_id) {
        setViewerShelfMap({});
        return;
      }

      const { data, error } = await supabase
        .from('user_books')
        .select('id, book_id, status')
        .eq('user_id', currentUser.id)
        .eq('book_id', headerUserBook.book_id)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('Error loading viewer shelf status:', error);
        }
        setViewerShelfMap({});
        return;
      }

      if (!data?.book_id) {
        setViewerShelfMap({});
        return;
      }

      setViewerShelfMap({
        [data.book_id]: { id: data.id, status: data.status },
      });
    };

    void loadViewerShelfStatus();
  }, [currentUser?.id, headerUserBook?.book_id]);

  const handleBookPress = async (userBook: UserBook) => {
    if (!currentUser || !userBook.book) return;

    try {
      const { book, userBook: userBookData } = await fetchBookWithUserStatus(
        userBook.book_id,
        currentUser.id
      );
      navigation.navigate('BookDetail', {
        book: {
          ...book,
          userBook: userBookData || null,
        },
      });
    } catch (error) {
      console.error('Error loading book details:', error);
      Alert.alert('Error', 'Could not load book details');
    }
  };

  const handlePressCommentLikes = (commentId: string) => {
    navigation.navigate('ActivityLikes', { commentId });
  };

  const handleMentionPress = async (username: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, username')
        .eq('username', username)
        .single();

      if (error || !data) return;
      navigateToProfile(data.user_id, data.username);
    } catch (error) {
      console.error('Error navigating to mention profile:', error);
    }
  };

  const renderMentionText = (text: string) => {
    const parts: React.ReactNode[] = [];
    const mentionRegex = /@([A-Za-z0-9_]+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(text)) !== null) {
      const start = match.index;
      const beforeChar = start > 0 ? text[start - 1] : '';
      if (beforeChar && !/\s/.test(beforeChar)) {
        continue;
      }

      if (start > lastIndex) {
        parts.push(
          <Text key={`text-${start}`} style={styles.commentText}>
            {text.slice(lastIndex, start)}
          </Text>
        );
      }

      const mentionUsername = match[1];
      parts.push(
        <Text
          key={`mention-${start}`}
          style={styles.mentionText}
          onPress={() => handleMentionPress(mentionUsername)}
        >
          @{mentionUsername}
        </Text>
      );

      lastIndex = start + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(
        <Text key={`text-${lastIndex}`} style={styles.commentText}>
          {text.slice(lastIndex)}
        </Text>
      );
    }

    return parts.length ? parts : <Text style={styles.commentText}>{text}</Text>;
  };

  const navigateToProfile = (userId: string, username: string) => {
    if (currentUser?.id === userId) return;
    navigation.navigate('UserProfile', {
      userId,
      username,
    });
  };



  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ActivityCommentsHeader onBack={() => navigation.goBack()} styles={styles} />

      <ActivityCommentsList
        loading={loading}
        rows={rows}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        headerUserBook={headerUserBook}
        headerActionText={headerActionText}
        headerAvatarUrl={headerAvatarUrl}
        headerAvatarFallback={headerAvatarFallback}
        headerViewerStatus={
          headerUserBook?.book_id
            ? viewerShelfMap[headerUserBook.book_id]?.status || null
            : headerViewerStatus
        }
        onToggleWantToRead={
          currentUser?.id && headerUserBook
            ? () => handleToggleWantToRead(headerUserBook)
            : undefined
        }
        onPressBook={handleBookPress}
        formatDateRange={formatDateRange}
        onReply={setReplyTo}
        likeCounts={likeCounts}
        likedKeys={likedKeys}
        currentUserId={currentUser?.id}
        onToggleLike={handleToggleLike}
        onPressLikes={handlePressCommentLikes}
        onNavigateProfile={navigateToProfile}
        renderMentionText={renderMentionText}
        styles={styles}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <View style={styles.inputBar}>
          {currentUserAvatarUrl ? (
            <Image
              source={{ uri: currentUserAvatarUrl }}
              style={styles.inputAvatar}
            />
          ) : (
            <View style={styles.inputAvatarPlaceholder}>
              <Text style={styles.avatarText}>{currentUserAvatarFallback}</Text>
            </View>
          )}
          <View style={styles.inputWrapper}>
            {replyTo && (
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerText}>
                  Replying to @{replyTo.user?.username || 'user'}
                </Text>
                <TouchableOpacity onPress={() => setReplyTo(null)}>
                  <Text style={styles.replyBannerClose}>×</Text>
                </TouchableOpacity>
              </View>
            )}
            {showMentions && canMention && (
              <View style={styles.mentionList}>
                {mentionLoading ? (
                  <View style={styles.mentionLoadingRow}>
                    <ActivityIndicator size="small" color={colors.primaryBlue} />
                    <Text style={styles.mentionLoadingText}>Searching...</Text>
                  </View>
                ) : (
                  <FlatList
                    data={mentionResults}
                    keyExtractor={(item) => item.user_id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item, index }) => (
                      <TouchableOpacity
                        style={[
                          styles.mentionItem,
                          index === activeMentionIndex && styles.mentionItemActive,
                        ]}
                        onPress={() => handleSelectMention(item)}
                        activeOpacity={0.7}
                      >
                        {item.avatar_url ? (
                          <Image
                            source={{ uri: item.avatar_url }}
                            style={styles.mentionAvatar}
                          />
                        ) : (
                          <View style={styles.mentionAvatarPlaceholder}>
                            <Text style={styles.avatarText}>
                              {item.username.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.mentionUsername}>@{item.username}</Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                      <View style={styles.mentionEmpty}>
                        <Text style={styles.mentionEmptyText}>No matches</Text>
                      </View>
                    }
                  />
                )}
              </View>
            )}
            <TextInput
              style={styles.textInput}
              placeholder="Comment or tag a friend"
              placeholderTextColor={`${colors.brownText}99`}
              value={commentText}
              onChangeText={handleChangeText}
              onSelectionChange={(event) =>
                handleSelectionChange(event.nativeEvent.selection)
              }
              onKeyPress={(event) => handleMentionKeyPress(event.nativeEvent.key)}
              onBlur={() => setShowMentions(false)}
              selection={selection}
              multiline
            />
          </View>
          <TouchableOpacity
            style={styles.postButtonContainer}
            onPress={handlePost}
            disabled={posting || !commentText.trim()}
          >
            <Text
              style={[
                styles.postButton,
                (posting || !commentText.trim()) && styles.postButtonDisabled,
              ]}
            >
              Post
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    marginTop: Platform.OS === 'ios' ? 8 : 16,
    marginLeft: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonText: {
    fontSize: 24,
    color: colors.brownText,
    fontWeight: 'bold',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: typography.logo,
    color: colors.primaryBlue,
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  activityHeader: {
    marginBottom: 16,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.brownText}1A`,
  },
  replyRow: {
    paddingLeft: 36,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: `${colors.brownText}33`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  inputAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  inputAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: `${colors.brownText}33`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  commentContent: {
    flex: 1,
    paddingRight: 8,
  },
  usernameText: {
    fontSize: 15,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  inlineCommentText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  commentText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
  },
  mentionText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  replyText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: `${colors.brownText}AA`,
  },
  likeCountText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: `${colors.brownText}AA`,
  },
  likeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeIcon: {
    width: 18,
    height: 18,
    tintColor: colors.brownText,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: `${colors.brownText}1A`,
    backgroundColor: colors.creamBackground,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
    justifyContent: 'center',
  },
  mentionList: {
    maxHeight: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${colors.brownText}1A`,
    backgroundColor: colors.white,
    marginBottom: 8,
    overflow: 'hidden',
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mentionItemActive: {
    backgroundColor: `${colors.primaryBlue}14`,
  },
  mentionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
  },
  mentionAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.creamBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  mentionUsername: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  mentionLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  mentionLoadingText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: `${colors.brownText}AA`,
  },
  mentionEmpty: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mentionEmptyText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: `${colors.brownText}AA`,
  },
  textInput: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    maxHeight: 100,
  },
  postButtonContainer: {
    alignSelf: 'center',
  },
  postButton: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  postButtonDisabled: {
    opacity: 0.4,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: `${colors.primaryBlue}14`,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 6,
  },
  replyBannerText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.primaryBlue,
  },
  replyBannerClose: {
    fontSize: 16,
    color: colors.primaryBlue,
  },
});
