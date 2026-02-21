import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { colors, typography } from '../../../config/theme';
import { SearchStackParamList } from '../../../navigation/SearchStackNavigator';
import { useAuth } from '../../../contexts/AuthContext';
import { useErrorHandler } from '../../../contexts/ErrorHandlerContext';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import {
  searchBooks,
  enrichBookWithGoogleBooks,
  checkDatabaseForBook,
  saveBookToDatabase,
  checkUserHasBook,
} from '../../../services/books';
import { resolveCoverUrl, CoverResolvableBook } from '../../../services/coverResolver';
import {
  askGrokForBooks,
  GrokMessage,
  GrokBookSuggestion,
  GrokMalformedJsonError,
} from '../../../services/grok';
import {
  getCacheKey,
  getCachedAskResponse,
  setCachedAskResponse,
  shouldSkipCache,
} from '../../../utils/askCache';

type AskScreenNavigationProp = StackNavigationProp<SearchStackParamList, 'SearchMain'>;

export interface HydratedBookResult {
  book: any | null;
  reason: string;
  onShelf: boolean;
}

interface AskMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  books?: HydratedBookResult[];
  error?: string;
}

const SUGGESTED_CHIPS = [
  'Something cozy',
  'Emotionally devastating',
  'Fast-paced thriller',
  'Light and funny',
];

function titleMatch(a: string, b: string): boolean {
  const na = (a || '').trim().toLowerCase();
  const nb = (b || '').trim().toLowerCase();
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

async function hydrateOne(
  suggestion: GrokBookSuggestion,
  userId: string | undefined
): Promise<HydratedBookResult> {
  try {
    const query = `${suggestion.title} ${suggestion.author}`.trim();
    const results = await searchBooks(query);
    const first = results.find(
      (r) =>
        titleMatch(r.title || '', suggestion.title) ||
        (r.authors && r.authors.some((auth: string) => auth.toLowerCase().includes(suggestion.author.toLowerCase())))
    ) || results[0];
    if (!first) {
      return { book: null, reason: suggestion.reason, onShelf: false };
    }
    const existing = await checkDatabaseForBook(first.open_library_id, null);
    const enriched = await enrichBookWithGoogleBooks(first);
    const coverUrl = await resolveCoverUrl(enriched as CoverResolvableBook);
    const book = existing
      ? { ...existing, cover_url: coverUrl || existing.cover_url, authors: existing.authors || [] }
      : { ...enriched, cover_url: coverUrl || enriched.cover_url };
    let onShelf = false;
    if (userId && book.id) {
      const check = await checkUserHasBook(book.id, userId);
      onShelf = check.exists;
    }
    return { book, reason: suggestion.reason, onShelf };
  } catch {
    return { book: null, reason: suggestion.reason, onShelf: false };
  }
}

function AskBookCard({
  result,
  onPressBook,
}: {
  result: HydratedBookResult;
  onPressBook: (book: any) => void;
}) {
  const { book, reason } = result;

  if (!book) {
    return (
      <View style={styles.askCard}>
        <Text style={styles.askCardTitle} numberOfLines={2}>{result.reason || 'Book not found'}</Text>
        <Text style={styles.askCardReason}>Could not find a matching book</Text>
      </View>
    );
  }

  const coverUrl = book.cover_url;
  const hasCover = Boolean(coverUrl) && !/image not available/i.test(coverUrl || '');
  const placeholderColor = '#4EACE3';

  return (
    <TouchableOpacity
      style={styles.askCard}
      onPress={() => onPressBook(book)}
      activeOpacity={0.8}
    >
      <View style={styles.askCardRow}>
        {hasCover ? (
          <Image source={{ uri: coverUrl ?? '' }} style={styles.askCardCover} resizeMode="contain" />
        ) : (
          <View style={[styles.askCardCoverPlaceholder, { backgroundColor: placeholderColor }]}>
            <Text style={styles.askCardCoverLetter}>
              {(book.title || '?').trim().charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.askCardInfo}>
          <Text style={styles.askCardTitle} numberOfLines={2}>{book.title}</Text>
          <Text style={styles.askCardAuthor} numberOfLines={1}>
            {book.authors?.join(', ') || 'Unknown Author'}
          </Text>
          {reason ? (
            <Text style={styles.askCardReason} numberOfLines={2}>{reason}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function AskScreen() {
  const navigation = useNavigation<AskScreenNavigationProp>();
  const { user } = useAuth();
  const { handleApiError } = useErrorHandler();
  const { isOnline } = useNetworkStatus();
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [malformedRetry, setMalformedRetry] = useState(false);
  const requestIdRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      (scrollRef.current as any)?.scrollToEnd?.({ animated: true });
    }, 150);
    return () => clearTimeout(timer);
  }, [messages.length, isLoading]);

  const buildGrokMessages = useCallback((): GrokMessage[] => {
    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  const hydrateSuggestions = useCallback(
    async (suggestions: GrokBookSuggestion[]): Promise<HydratedBookResult[]> => {
      const hydrated = await Promise.all(
        suggestions.map((s) => hydrateOne(s, user?.id))
      );
      return hydrated;
    },
    [user?.id]
  );

  const handleBookPress = useCallback(
    async (book: any) => {
      try {
        const existing = await checkDatabaseForBook(book.open_library_id, book.google_books_id);
        if (existing) {
          const forDetail = {
            ...existing,
            cover_url: existing.cover_url,
            authors: existing.authors || [],
          };
          navigation.navigate('BookDetail', { book: forDetail });
          return;
        }
        const enriched = await enrichBookWithGoogleBooks(book);
        try {
          const saved = await saveBookToDatabase(enriched);
          navigation.navigate('BookDetail', { book: saved });
        } catch {
          navigation.navigate('BookDetail', { book: enriched });
        }
      } catch (error) {
        handleApiError(error, 'load book');
        navigation.navigate('BookDetail', { book });
      }
    },
    [navigation, handleApiError]
  );

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    if (!isOnline) {
      handleApiError(new Error('You\'re offline'), 'Ask');
      return;
    }

    setInputText('');
    const userMsg: AskMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    const requestId = ++requestIdRef.current;

    const appendAssistant = (content: string, books?: HydratedBookResult[], error?: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content,
          books,
          error,
        },
      ]);
    };

    try {
      const grokMessages = buildGrokMessages();
      let response;

      if (!shouldSkipCache(text)) {
        const cacheKey = getCacheKey(text);
        const cached = getCachedAskResponse(cacheKey);
        if (cached?.books?.length) {
          if (requestId !== requestIdRef.current) return;
          const hydrated = await hydrateSuggestions(cached.books as GrokBookSuggestion[]);
          appendAssistant(cached.rawContent || 'Here are some picks:', hydrated);
          setIsLoading(false);
          return;
        }
      }

      response = await askGrokForBooks(grokMessages, text);
      if (requestId !== requestIdRef.current) return;

      if (!response.books.length) {
        appendAssistant("I couldn't find suggestions for that—try rephrasing.");
        setIsLoading(false);
        return;
      }

      const hydrated = await hydrateSuggestions(response.books);
      if (requestId !== requestIdRef.current) return;

      const anyFound = hydrated.some((h) => h.book != null);
      if (!anyFound) {
        appendAssistant("I couldn't find those exact books—try rephrasing.");
      } else {
        appendAssistant('Here are some picks:', hydrated);
      }

      if (!shouldSkipCache(text)) {
        setCachedAskResponse(getCacheKey(text), { ...response, rawContent: response.rawContent });
      }
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      if (e instanceof GrokMalformedJsonError) {
        if (!malformedRetry) {
          setMalformedRetry(true);
          try {
            const retryResponse = await askGrokForBooks(buildGrokMessages(), text);
            if (requestId !== requestIdRef.current) return;
            if (retryResponse.books?.length) {
              const hydrated = await hydrateSuggestions(retryResponse.books);
              appendAssistant('Here are some picks:', hydrated);
            } else {
              appendAssistant("Something went wrong with that response—try rephrasing your mood.");
            }
          } catch {
            appendAssistant("Something went wrong with that response—try rephrasing your mood.", undefined, 'malformed');
          }
          setMalformedRetry(false);
        } else {
          appendAssistant("Something went wrong with that response—try rephrasing your mood.", undefined, 'malformed');
        }
      } else {
        const message = e instanceof Error ? e.message : 'Something went wrong';
        const isTimeout = message.toLowerCase().includes('timeout');
        const is503 = message.toLowerCase().includes('not configured');
        if (is503) {
          appendAssistant('Ask is not configured right now. Try again later.', undefined, 'config');
        } else if (isTimeout) {
          appendAssistant('Request timed out.', undefined, 'timeout');
        } else {
          appendAssistant(message, undefined, 'error');
        }
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    inputText,
    isLoading,
    isOnline,
    buildGrokMessages,
    hydrateSuggestions,
    malformedRetry,
    handleApiError,
  ]);

  const handleRetry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      setInputText(lastUser.content);
      setMessages((prev) => prev.filter((m) => m.id !== lastUser.id));
    }
  }, [messages]);

  const renderMessage = useCallback(
    ({ item }: { item: AskMessage }) => {
      if (item.role === 'user') {
        return (
          <View style={styles.userBubbleWrap}>
            <View style={styles.userBubble}>
              <Text style={styles.userBubbleText}>{item.content}</Text>
            </View>
          </View>
        );
      }
      return (
        <View style={styles.assistantBubbleWrap}>
          <View style={styles.assistantBubble}>
            {item.error ? (
              <>
                <Text style={styles.assistantText}>{item.content}</Text>
                {(item.error === 'timeout' || item.error === 'error') && (
                  <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                {item.books?.length ? (
                  <Text style={styles.assistantText}>Here are some picks:</Text>
                ) : item.content ? (
                  <Text style={styles.assistantText}>{item.content}</Text>
                ) : null}
                {item.books?.length ? (
                  <View style={styles.booksList}>
                    {item.books.map((r, idx) => (
                      <AskBookCard
                        key={`${r.reason}-${idx}`}
                        result={r}
                        onPressBook={handleBookPress}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>
      );
    },
    [handleRetry, handleBookPress]
  );

  const isEmpty = messages.length === 0;

  return (
    <View style={styles.container}>

      <KeyboardAwareScrollView
        ref={scrollRef as any}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        extraScrollHeight={20}
        enableOnAndroid
        showsVerticalScrollIndicator={false}
      >
        {isEmpty ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>What are you in the mood for?</Text>
            <View style={styles.chipsRow}>
              {SUGGESTED_CHIPS.map((label) => (
                <TouchableOpacity
                  key={label}
                  style={styles.chip}
                  onPress={() => {
                    setInputText(label);
                  }}
                >
                  <Text style={styles.chipText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        )}
        {isLoading ? (
          <View style={styles.assistantBubbleWrap}>
            <View style={[styles.assistantBubble, styles.typingBubble]}>
              <ActivityIndicator size="small" color={colors.primaryBlue} />
              <Text style={styles.typingText}>Finding books…</Text>
            </View>
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Describe a mood or vibe..."
          placeholderTextColor={colors.brownText}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!isLoading}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isLoading}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.creamBackground,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyTitle: {
    fontFamily: typography.heroTitle,
    fontSize: 24,
    color: colors.brownText,
    textAlign: 'center',
    marginBottom: 24,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  chip: {
    backgroundColor: colors.white,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primaryBlue,
  },
  chipText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.brownText,
  },
  userBubbleWrap: {
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  userBubble: {
    maxWidth: '85%',
    backgroundColor: colors.primaryBlue,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderBottomRightRadius: 4,
  },
  userBubbleText: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.white,
  },
  assistantBubbleWrap: {
    alignSelf: 'stretch',
    alignItems: 'stretch',
    marginBottom: 12,
  },
  assistantBubble: {
    width: '100%',
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 12,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  assistantText: {
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    marginBottom: 8,
  },
  retryButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.primaryBlue,
    borderRadius: 8,
  },
  retryButtonText: {
    fontFamily: typography.button,
    fontSize: 14,
    color: colors.white,
    fontWeight: '600',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.brownText,
    marginLeft: 8,
  },
  booksList: {
    gap: 12,
  },
  askCard: {
    backgroundColor: colors.creamBackground,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E8E0D8',
  },
  askCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  askCardCover: {
    width: 56,
    aspectRatio: 2 / 3,
    borderRadius: 6,
    marginRight: 12,
  },
  askCardCoverPlaceholder: {
    width: 56,
    aspectRatio: 2 / 3,
    borderRadius: 6,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  askCardCoverLetter: {
    color: colors.white,
    fontSize: 22,
    fontFamily: typography.body,
    fontWeight: '700',
  },
  askCardInfo: {
    flex: 1,
  },
  askCardTitle: {
    fontFamily: typography.body,
    fontSize: 15,
    color: colors.brownText,
    fontWeight: '600',
    marginBottom: 2,
  },
  askCardAuthor: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.brownText,
    opacity: 0.8,
    marginBottom: 4,
  },
  askCardReason: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.brownText,
    opacity: 0.7,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: colors.creamBackground,
    borderTopWidth: 1,
    borderTopColor: '#E8E0D8',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    backgroundColor: colors.white,
    borderRadius: 8,
  },
  sendButton: {
    backgroundColor: colors.primaryBlue,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontFamily: typography.button,
    fontSize: 16,
    color: colors.white,
    fontWeight: '600',
  },
});
