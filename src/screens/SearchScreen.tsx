import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors, typography } from '../config/theme';
import { searchBooksWithStats, enrichBookWithGoogleBooks, checkDatabaseForBook } from '../services/books';
import { searchMembers, followUser, unfollowUser, getFollowingIds } from '../services/userProfile';
import { SearchStackParamList } from '../navigation/SearchStackNavigator';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabase';

type SearchScreenNavigationProp = StackNavigationProp<SearchStackParamList, 'SearchMain'>;

type TabType = 'books' | 'members';

interface MemberResult {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  profile_photo_url: string | null;
}

interface RecentSearch {
  id: string;
  title: string;
  authors?: string[];
  cover_url: string | null;
  open_library_id: string;
  timestamp: number;
}

interface RecentMemberSearch {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  profile_photo_url: string | null;
  timestamp: number;
}

// Storage keys for recent searches (scoped per user)
const RECENT_SEARCHES_KEY = 'recent_book_searches';
const RECENT_MEMBER_SEARCHES_KEY = 'recent_member_searches';

export default function SearchScreen() {
  const navigation = useNavigation<SearchScreenNavigationProp>();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('books');
  const [bookResults, setBookResults] = useState<any[]>([]);
  const [memberResults, setMemberResults] = useState<MemberResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [recentMemberSearches, setRecentMemberSearches] = useState<RecentMemberSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrichingBookId, setEnrichingBookId] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load recent searches and following IDs on mount
  useEffect(() => {
    loadRecentSearches();
    loadRecentMemberSearches();
    if (user?.id) {
      loadFollowingIds();
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`user_follows:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_follows',
          filter: `follower_id=eq.${user.id}`,
        },
        () => {
          loadFollowingIds();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const getRecentSearchesKey = () =>
    user?.id ? `${RECENT_SEARCHES_KEY}:${user.id}` : RECENT_SEARCHES_KEY;
  const getRecentMemberSearchesKey = () =>
    user?.id ? `${RECENT_MEMBER_SEARCHES_KEY}:${user.id}` : RECENT_MEMBER_SEARCHES_KEY;

  const loadRecentSearches = async () => {
    try {
      // Use AsyncStorage to load recent searches
      const stored = await AsyncStorage.getItem(getRecentSearchesKey());
      if (stored) {
        const searches = JSON.parse(stored);
        setRecentSearches(searches);
      }
    } catch (error) {
      console.error('Error loading recent searches:', error);
      setRecentSearches([]);
    }
  };

  const saveRecentSearch = async (book: any) => {
    try {
      const newSearch: RecentSearch = {
        id: book.open_library_id || String(Date.now()),
        title: book.title,
        authors: book.authors,
        cover_url: book.cover_url,
        open_library_id: book.open_library_id,
        timestamp: Date.now(),
      };

      // Remove duplicate if exists
      const filtered = recentSearches.filter(s => s.open_library_id !== newSearch.open_library_id);
      
      // Add to front, keep only 5 most recent
      const updated = [newSearch, ...filtered].slice(0, 5);
      
      setRecentSearches(updated);
      
      // Save to AsyncStorage
      await AsyncStorage.setItem(getRecentSearchesKey(), JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving recent search:', error);
    }
  };

  const removeRecentSearch = async (bookId: string) => {
    try {
      const updated = recentSearches.filter(s => s.open_library_id !== bookId);
      setRecentSearches(updated);
      
      // Update AsyncStorage
      await AsyncStorage.setItem(getRecentSearchesKey(), JSON.stringify(updated));
    } catch (error) {
      console.error('Error removing recent search:', error);
    }
  };

  const clearAllRecentSearches = async () => {
    try {
      setRecentSearches([]);
      await AsyncStorage.removeItem(getRecentSearchesKey());
    } catch (error) {
      console.error('Error clearing recent searches:', error);
    }
  };

  const loadRecentMemberSearches = async () => {
    try {
      const stored = await AsyncStorage.getItem(getRecentMemberSearchesKey());
      if (stored) {
        const searches = JSON.parse(stored);
        setRecentMemberSearches(searches);
      }
    } catch (error) {
      console.error('Error loading recent member searches:', error);
      setRecentMemberSearches([]);
    }
  };

  const saveRecentMemberSearch = async (member: MemberResult) => {
    try {
      const newSearch: RecentMemberSearch = {
        user_id: member.user_id,
        username: member.username,
        first_name: member.first_name,
        last_name: member.last_name,
        profile_photo_url: member.profile_photo_url,
        timestamp: Date.now(),
      };

      // Remove duplicate if exists
      const filtered = recentMemberSearches.filter(s => s.user_id !== newSearch.user_id);
      
      // Add to front, keep only 5 most recent
      const updated = [newSearch, ...filtered].slice(0, 5);
      
      setRecentMemberSearches(updated);
      
      // Save to AsyncStorage
      await AsyncStorage.setItem(getRecentMemberSearchesKey(), JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving recent member search:', error);
    }
  };

  const removeRecentMemberSearch = async (userId: string) => {
    try {
      const updated = recentMemberSearches.filter(s => s.user_id !== userId);
      setRecentMemberSearches(updated);
      
      // Update AsyncStorage
      await AsyncStorage.setItem(getRecentMemberSearchesKey(), JSON.stringify(updated));
    } catch (error) {
      console.error('Error removing recent member search:', error);
    }
  };

  const clearAllRecentMemberSearches = async () => {
    try {
      setRecentMemberSearches([]);
      await AsyncStorage.removeItem(getRecentMemberSearchesKey());
    } catch (error) {
      console.error('Error clearing recent member searches:', error);
    }
  };

  const loadFollowingIds = async () => {
    if (!user?.id) return;
    const { followingIds: ids } = await getFollowingIds(user.id);
    setFollowingIds(new Set(ids));
  };


  const performBookSearch = async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setBookResults([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const books = await searchBooksWithStats(searchQuery);
      setBookResults(books);
    } catch (error) {
      console.error('Error searching books:', error);
      setBookResults([]);
    } finally {
      setLoading(false);
    }
  };

  const performMemberSearch = async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setMemberResults([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { members, error } = await searchMembers(searchQuery);
      if (error) {
        console.error('Error searching members:', error);
        setMemberResults([]);
      } else {
        const filtered = user?.id
          ? members.filter((member) => member.user_id !== user.id)
          : members;
        setMemberResults(filtered);
      }
    } catch (error) {
      console.error('Error searching members:', error);
      setMemberResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (activeTab === 'books') {
      await performBookSearch(query);
    } else {
      await performMemberSearch(query);
    }
  };

  // Debounced search as user types
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (query.trim().length < 2) {
      setBookResults([]);
      setMemberResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    debounceTimerRef.current = setTimeout(() => {
      if (activeTab === 'books') {
        performBookSearch(query);
      } else {
        performMemberSearch(query);
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, activeTab]);

  const handleBookPress = async (book: any) => {
    try {
      setEnrichingBookId(book.open_library_id);
      
      // Save to recent searches
      await saveRecentSearch(book);
      
      const existingBook = await checkDatabaseForBook(book.open_library_id, null);
      
      if (existingBook) {
        const bookForDetail = {
          ...existingBook,
          cover_url: existingBook.cover_url,
          authors: existingBook.authors || [],
        };
        setEnrichingBookId(null);
        navigation.navigate('BookDetail', { book: bookForDetail });
        return;
      }
      
      const enrichedBook = await enrichBookWithGoogleBooks(book);
      navigation.navigate('BookDetail', { book: enrichedBook });
    } catch (error) {
      console.error('Error loading book details:', error);
      navigation.navigate('BookDetail', { book });
    } finally {
      setEnrichingBookId(null);
    }
  };

  const handleFollowPress = async (memberId: string) => {
    if (!user?.id) return;
    
    setFollowLoading(prev => new Set(prev).add(memberId));
    
    try {
      const isFollowing = followingIds.has(memberId);
      if (isFollowing) {
        const { error } = await unfollowUser(user.id, memberId);
        if (!error) {
          setFollowingIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(memberId);
            return newSet;
          });
        }
      } else {
        const { error } = await followUser(user.id, memberId);
        if (!error) {
          setFollowingIds(prev => new Set(prev).add(memberId));
        }
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
    } finally {
      setFollowLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(memberId);
        return newSet;
      });
    }
  };

  const handleMemberPress = async (member: MemberResult) => {
    // Save to recent member searches
    await saveRecentMemberSearch(member);
    
    navigation.navigate('UserProfile', { userId: member.user_id, username: member.username });
    console.log('Member pressed:', member.username);
  };

  const renderBookItem = ({ item }: { item: any }) => {
    const isEnriching = enrichingBookId === item.open_library_id;
    const coverUrl = item.cover_url;

    return (
      <TouchableOpacity
        style={styles.bookItem}
        onPress={() => handleBookPress(item)}
        disabled={isEnriching}
      >
        {coverUrl && (
          <Image source={{ uri: coverUrl }} style={styles.bookCover} resizeMode="contain" />
        )}
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>
            {item.authors?.join(', ') || 'Unknown Author'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRecentSearchItem = ({ item }: { item: RecentSearch }) => {
    return (
      <TouchableOpacity
        style={styles.bookItem}
        onPress={() => handleBookPress(item)}
      >
        {item.cover_url && (
          <Image source={{ uri: item.cover_url }} style={styles.bookCover} resizeMode="contain" />
        )}
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>
            {item.authors?.join(', ') || 'Unknown Author'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => removeRecentSearch(item.open_library_id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.removeButtonText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderMemberItem = ({ item }: { item: MemberResult }) => {
    const isFollowing = followingIds.has(item.user_id);
    const isLoading = followLoading.has(item.user_id);
    const fullName = `${item.first_name} ${item.last_name}`;

    return (
      <TouchableOpacity
        style={styles.memberItem}
        onPress={() => handleMemberPress(item)}
      >
        {item.profile_photo_url ? (
          <Image 
            source={{ uri: item.profile_photo_url }} 
            style={styles.memberPhoto} 
          />
        ) : (
          <View style={styles.memberPhotoPlaceholder}>
            <Text style={styles.memberPhotoPlaceholderText}>
              {item.first_name.charAt(0)}{item.last_name.charAt(0)}
            </Text>
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{fullName}</Text>
          <Text style={styles.memberUsername}>@{item.username}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.followButton,
            isFollowing && styles.followingButton,
            isLoading && styles.followButtonDisabled
          ]}
          onPress={(e) => {
            e.stopPropagation();
            handleFollowPress(item.user_id);
          }}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={isFollowing ? colors.brownText : colors.white} />
          ) : (
            <Text style={[
              styles.followButtonText,
              isFollowing && styles.followingButtonText
            ]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderRecentMemberItem = ({ item }: { item: RecentMemberSearch }) => {
    const fullName = `${item.first_name} ${item.last_name}`;

    return (
      <TouchableOpacity
        style={styles.memberItem}
        onPress={() => navigation.navigate('UserProfile', { userId: item.user_id, username: item.username })}
      >
        {item.profile_photo_url ? (
          <Image 
            source={{ uri: item.profile_photo_url }} 
            style={styles.memberPhoto} 
          />
        ) : (
          <View style={styles.memberPhotoPlaceholder}>
            <Text style={styles.memberPhotoPlaceholderText}>
              {item.first_name.charAt(0)}{item.last_name.charAt(0)}
            </Text>
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{fullName}</Text>
          <Text style={styles.memberUsername}>@{item.username}</Text>
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={(e) => {
            e.stopPropagation();
            removeRecentMemberSearch(item.user_id);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.removeButtonText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Show recent searches when no query
  const showRecentSearches = activeTab === 'books' && query.trim().length < 2 && recentSearches.length > 0;
  const showRecentMemberSearches = activeTab === 'members' && query.trim().length < 2 && recentMemberSearches.length > 0;
  const results = activeTab === 'books' ? bookResults : memberResults;
  const placeholder = activeTab === 'books' ? 'Search for books...' : 'Search for members...';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>Search</Text>
        </View>
        <View style={styles.headerRight}>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={placeholder}
            placeholderTextColor={colors.brownText}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'books' && styles.activeTab]}
            onPress={() => setActiveTab('books')}
          >
            <Text style={[styles.tabText, activeTab === 'books' && styles.activeTabText]}>
              Books
            </Text>
            {activeTab === 'books' && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'members' && styles.activeTab]}
            onPress={() => setActiveTab('members')}
          >
            <Text style={[styles.tabText, activeTab === 'members' && styles.activeTabText]}>
              Members
            </Text>
            {activeTab === 'members' && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        </View>

        {/* Recent Searches Section */}
        {showRecentSearches && (
          <View style={styles.recentSearchesSection}>
            <View style={styles.recentSearchesHeader}>
              <Text style={styles.recentSearchesTitle}>Recent Searches</Text>
              <TouchableOpacity onPress={clearAllRecentSearches}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={recentSearches}
              renderItem={renderRecentSearchItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContainer}
            />
          </View>
        )}

        {/* Recent Member Searches Section */}
        {showRecentMemberSearches && (
          <View style={styles.recentSearchesSection}>
            <View style={styles.recentSearchesHeader}>
              <Text style={styles.recentSearchesTitle}>Recent Searches</Text>
              <TouchableOpacity onPress={clearAllRecentMemberSearches}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={recentMemberSearches}
              renderItem={renderRecentMemberItem}
              keyExtractor={(item) => item.user_id}
              contentContainerStyle={styles.listContainer}
            />
          </View>
        )}

        {/* Search Results */}
        {!showRecentSearches && !showRecentMemberSearches && (
          loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primaryBlue} />
            </View>
          ) : (
            <FlatList
              data={results}
              renderItem={activeTab === 'books' ? renderBookItem : renderMemberItem}
              keyExtractor={(item) => {
                if (activeTab === 'books') {
                  return (item as any).open_library_id || (item as any).title || String(Math.random());
                } else {
                  return (item as MemberResult).user_id;
                }
              }}
              contentContainerStyle={styles.listContainer}
            />
          )
        )}
      </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  logoContainer: {
    flex: 1,
    flexShrink: 1,
    marginRight: 16,
  },
  logo: {
    fontSize: 32,
    fontFamily: typography.logo,
    color: colors.primaryBlue,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 16,
    flexShrink: 0,
  },
  headerIcon: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 20,
    color: colors.brownText,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.brownText,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    backgroundColor: colors.white,
  },
  searchButton: {
    backgroundColor: colors.primaryBlue,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: colors.white,
    fontFamily: typography.button,
    fontSize: 16,
    fontWeight: '500',
  },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  activeTab: {
    // Active styling handled by text and underline
  },
  tabText: {
    fontSize: 16,
    fontFamily: typography.body,
    color: '#9E9E9E',
  },
  activeTabText: {
    color: colors.primaryBlue,
    fontWeight: '500',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primaryBlue,
  },
  recentSearchesSection: {
    flex: 1,
  },
  recentSearchesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recentSearchesTitle: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
  },
  clearAllText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.primaryBlue,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingBottom: 16,
  },
  bookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bookCover: {
    width: 60,
    aspectRatio: 2/3,
    borderRadius: 4,
    marginRight: 12,
  },
  bookInfo: {
    flex: 1,
    height: 90,
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    marginBottom: 4,
    fontWeight: '600',
  },
  bookAuthor: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.7,
  },
  removeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  removeButtonText: {
    fontSize: 24,
    color: colors.brownText,
    opacity: 0.5,
    fontWeight: '300',
  },
  memberItem: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  memberPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  memberPhotoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: colors.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberPhotoPlaceholderText: {
    fontSize: 18,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 2,
  },
  memberUsername: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    opacity: 0.6,
  },
  followButton: {
    backgroundColor: colors.primaryBlue,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followingButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.brownText,
  },
  followButtonDisabled: {
    opacity: 0.6,
  },
  followButtonText: {
    fontSize: 14,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '500',
  },
  followingButtonText: {
    color: colors.brownText,
  },
});
