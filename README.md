# Inkli

React Native / Expo app for book shelf management, head-to-head ranking, and social reading activity. Backend is Supabase (Postgres + Edge Functions). Book metadata is sourced from Open Library and Google Books APIs. AI-powered recommendations use xAI Grok.

---

## Design System

Defined in `src/config/theme.ts`.

### Colors

| Token | Hex | Usage |
|---|---|---|
| `primaryBlue` | `#4EACE3` | buttons, active states, logo tint |
| `brownText` | `#5A4338` | all body and heading text |
| `creamBackground` | `#F5EDE1` | app-wide background |
| `white` | `#FFFFFF` | card backgrounds, overlays |

### Typography

| Token | Font | Weights |
|---|---|---|
| `logo` | PlayfairDisplay-Black-Italic | 900 |
| `sectionHeader`, `heroTitle` | PlayfairDisplay-Italic | 400 |
| `body`, `button`, `label` | Inter | 300, 400, 500, 600 |

Both font families are loaded via `@expo-google-fonts/*` in `App.tsx` before rendering.

---

## Architecture

### Layer overview

```
App.tsx
├── AuthProvider (AuthContext)           — Supabase session management
└── AppContent
    ├── ErrorHandlerProvider
    ├── GestureHandlerRootView
    ├── OfflineBanner (useNetworkStatus)
    └── NavigationContainer
        ├── AuthStackNavigator          — unauthenticated + post-auth gates
        └── TabNavigator                — main app (5 tabs)
```

### Directory structure

```
src/
├── config/
│   ├── supabase.ts          — Supabase client
│   └── theme.ts             — colors + typography tokens
├── contexts/
│   ├── AuthContext.tsx       — user/session state, sign-in methods
│   └── ErrorHandlerContext.tsx
├── features/
│   ├── auth/                — login, signup screens + OAuth
│   ├── books/               — detail, ranking screens + components
│   ├── home/                — activity feed (HomeScreen)
│   ├── leaderboard/         — LeaderboardScreen
│   ├── onboarding/          — quiz, invite gate
│   ├── profile/             — own + other users' profiles
│   ├── recommendations/     — rec lists + friends-liked lists
│   ├── search/              — book search (SearchScreen) + Ask (AskScreen)
│   ├── shelf/               — shelf view + reorder
│   └── social/              — comments, likes, notifications, followers
├── hooks/
│   ├── useBookRanking.ts    — binary-search ranking state machine
│   ├── useInviteTier.ts     — invite counts + feature unlock state
│   └── useNetworkStatus.ts  — connectivity via NetInfo
├── navigation/
│   ├── AuthStackNavigator.tsx
│   ├── HomeStackNavigator.tsx
│   ├── LeaderboardStackNavigator.tsx
│   ├── ProfileStackNavigator.tsx
│   ├── SearchStackNavigator.tsx
│   ├── TabNavigator.tsx
│   ├── YourShelfStackNavigator.tsx
│   └── types.ts
├── services/
│   ├── account.ts
│   ├── activityCommentLikes.ts
│   ├── activityComments.ts
│   ├── activityFeed.ts
│   ├── activityLikes.ts
│   ├── analytics.ts
│   ├── books.ts             — barrel re-export
│   ├── books/
│   │   ├── community.ts
│   │   ├── cover.ts
│   │   ├── googleBooks.ts
│   │   ├── metadata.ts
│   │   ├── openLibraryLookup.ts
│   │   ├── shelf.ts
│   │   ├── social.ts
│   │   ├── types.ts
│   │   ├── upsert.ts
│   │   └── utils.ts
│   ├── bookDetails.ts
│   ├── bookFeedback.ts
│   ├── comparisons.ts
│   ├── coverResolver.ts
│   ├── enrichment.ts
│   ├── grok.ts
│   ├── invites.ts
│   ├── notifications.ts
│   ├── quiz.ts
│   ├── recommendations.ts
│   ├── recommendationTriggers.ts
│   ├── recommendedUsers.ts
│   ├── supabase.ts          — re-exports supabase client
│   ├── userPrivateData.ts
│   ├── userProfile.ts
│   └── users.ts
└── types/                   — shared TypeScript interfaces
supabase/
├── functions/               — 18 Deno Edge Functions
├── schema.sql               — consolidated schema snapshot
└── migrate_*.sql            — incremental migrations
```

### Auth flow

The root `AppContent` component drives navigation based on state checks evaluated in order:

1. **Password recovery pending** (`pendingPasswordRecovery` in `AuthContext`) → `AuthStackNavigator` at `ResetPassword`
2. **No user** → `AuthStackNavigator` (starts at `Welcome`, or `SignIn` with a success message after password reset)
3. **New user** (< 10 min since signup) who has not completed or skipped the quiz → `AuthStackNavigator` at `Quiz`
4. **User** with fewer than 4 sent invites and no `grandfathered_invite_unlock` → `AuthStackNavigator` at `InviteGate`
5. **Otherwise** → `TabNavigator`

Deep-linked invite URLs (`/invite/:code`) are intercepted at app launch and stored in AsyncStorage for post-auth redemption. Password reset deep links (`/reset-password`) are handled by extracting the Supabase auth code (PKCE) or token (implicit) and establishing a recovery session.

---

## Implemented Features

### Auth

- Email/password signup (username, display name, reading interests collected at signup)
- Sign in via email address, username, or phone number (username/phone resolved server-side via edge functions)
- Apple Sign In — native `expo-apple-authentication` on iOS, web OAuth fallback on Android
- Google Sign In — `@react-native-google-signin/google-signin` native SDK
- Account deactivation (soft-delete via `deactivated_at`)
- Permanent account deletion (password or "DELETE" confirmation for OAuth users)
- Password change (re-verifies current password first)
- **Forgot password** (`ForgotPasswordScreen`) — email or username input; resolves username via `resolve-username` edge function, then calls `supabase.auth.resetPasswordForEmail`. Shows success state without navigating away.
- **Reset password** (`ResetPasswordScreen`) — shown when the app receives a `PASSWORD_RECOVERY` auth event (triggered by tapping the reset email link). Validates password requirements + confirmation match, calls `supabase.auth.updateUser`, signs out, and returns the user to `SignIn` with a success message.

### Onboarding

- **Comparison quiz** (`QuizScreen`) — shown to new users within 10 minutes of signup. Presents pairs of starter books; each choice is stored as a `Comparison` row and used to seed initial rankings.
- **Invite gate** (`InviteGateScreen`) — soft wall requiring the user to share at least 4 invites before accessing the full app. Users with `grandfathered_invite_unlock = true` bypass it.

### Books

**Search**
- Open Library full-text search (`/search.json`) with custom relevance scoring (title similarity, author match, ISBN exact match, recency)
- Results enriched with Google Books metadata (description, publisher, ISBNs, cover, page count)
- Community stats (average rank score, member count) overlaid from the local `books_stats` table

**Book detail**
- Book metadata (description, page count, genres, first published year)
- Community stats: global average + friends' average from `books_stats`
- Shelf counts (how many users have it read / currently reading / want to read)
- Friends' rankings for that book (paginated)
- Other readers who ranked it but aren't followed

**Shelf management**
- Add to shelf with status (`read`, `currently_reading`, `want_to_read`), rating (`liked`, `fine`, `disliked`), notes, per-user genre tags, and custom labels
- Reading progress slider (0–100%) for `currently_reading` books; changes create activity cards
- Multiple read sessions per book (started/finished date pairs in `user_book_read_sessions`)
- Remove from shelf
- Reorder shelf via drag-and-drop (`ReorderShelfScreen`)
- Custom label management: create, apply, delete across all books atomically

**Ranking**
- Head-to-head binary search insertion sort (`BookRankingScreen`) — new books are compared against existing books in the same tier until the insertion point is found
- Rank scores are stored as `NUMERIC(6,3)` in the `[0, 3.5]`, `(3.5, 6.5]`, `(6.5, 10.0]` tiers for `disliked`, `fine`, `liked`
- Batch rank redistribution when a top-tier book is removed

**Comparisons**
- Each head-to-head choice is persisted as a `comparisons` row via the `comparisons-create` edge function, which also updates `rank_score` on both user_books

**Book feedback**
- Users can report bad book data (title, cover, description, etc.) via `BookFeedbackForm`

### Social

**Activity feed** (`HomeScreen`)
- Paginated feed of followed users' shelf activity, sourced from `activity_cards` via RPC `get_followed_activity_cards`
- Feed source is configurable via `EXPO_PUBLIC_FEED_SOURCE` env var (`activity_cards` | `user_books` | `auto`)
- Each card shows the book, user, status, rank score, read count, like/comment counts

**Likes and comments**
- Like/unlike a shelf entry (`activity_likes`) — toggle via unique constraint
- Threaded comments on shelf entries (`activity_comments`) with parent/child replies
- Like individual comments (`activity_comment_likes`)
- Full CRUD on own comments (add, edit, delete)

**Notifications**
- Types: `like`, `comment`, `follow`, `follow_request`, `follow_accept`, `follow_reject`
- Unread count tracked via `notifications_last_seen_at` on `user_profiles`
- App icon badge reflects unread count (badge-only permission, no alerts/sounds)
- Badge cleared when app returns to foreground

**Following**
- Follow public accounts directly (RPC `request_follow`)
- Follow requests for private accounts (RPC `accept_follow_request`, `reject_follow_request`)
- Cancel outgoing follow request
- Unfollow (also removes follow notification)
- View followers/following lists

**Privacy**
- Block users (RPC `block_user`) — hides content in both directions, prevents new follows
- Unblock
- Mute users — excluded from feed and notifications
- `account_type` (`public` | `private`) controls content visibility

### Search and discovery

**Book search** — Open Library + Google Books enrichment pipeline (see Books section)

**User search** — search by username or name (ilike query on `user_profiles`)

**Recommended users** — shown on the Search screen:
- Contact-based: device phone contacts matched against `user_private_data` via `match-contacts` edge function
- Graph-based: friends-of-friends via `get_recommended_users` SQL RPC (mutual follower count)
- Both sources merged and deduped; contacts take priority

**Ask** (`AskScreen`) — conversational AI book recommendations via xAI Grok (`grok-ask` edge function). Suggestions are enriched with Google Books metadata client-side and presented as tappable book cards.

### Recommendations

- Personalized recommendations generated server-side by `recommendations-generate` edge function and stored in `recommendations` table
- Auto-refresh triggered when user accumulates ≥ 10 comparisons since last refresh, or ≥ 7 days have passed
- `shown_at` and `clicked_at` tracked per recommendation
- Friends-liked list: books recently rated `liked` or scored ≥ 6.5 by followed users

### Profile

- View own profile: shelf counts, followers/following, reading interests, bio
- View other users' profiles
- Edit profile: name, username, bio, reading interests, profile photo (upload/delete via Supabase Storage)
- Profile photos stored in `profile-photos` bucket with pattern `{userId}/{userId}-{timestamp}.{ext}`
- Account settings: change password, toggle public/private, deactivate, delete account

### Invites

Home activity feed and Recommended for You are always available (not gated). Five lockable features (unlocked via invite points):

- `community_scores` — Community average scores (rating circles) on book detail
- `activity_feed` — (Reserved; home feed is always on.)
- `friend_recommendations` — **From your friends** (shelf tab: books recently liked/rated by followed users)
- `friends_rankings` — Friends' rankings for a book on book detail
- `leaderboard_circles` — Leaderboard screen and book circles

- Each successful invite earns an `unspent_invite_point`
- Points are spent via `spend-invite-point` edge function to unlock individual features
- `grandfathered_invite_unlock` bypasses all feature gates
- Invite links use deep link scheme `https://inkliapp.com/invite/{code}`
- Native share sheet used to send; a "send" is counted when the share sheet is dismissed

### Analytics

Filter usage in the shelf view is tracked to `filter_events`:
- `filter_applied` (debounced 300ms, includes genre/label selections and result count)
- `filter_cleared`
- `custom_label_deleted`

---

## Service Functions Reference

### `services/account.ts`
| Function | Description |
|---|---|
| `deactivateAccount(userId)` | Sets `deactivated_at`, then signs out |
| `deleteAccount(userId, passwordOrConfirmation, isOAuthUser)` | Calls `delete-account` edge function |
| `updatePassword(userEmail, currentPassword, newPassword)` | Re-authenticates then updates password |

### `services/activityFeed.ts`
| Function | Description |
|---|---|
| `fetchFollowedActivityCards(userId, options?)` | Paginated feed of followed users via RPC `get_followed_activity_cards` |
| `fetchUserActivityCards(userId, options?)` | Paginated activity for a single user from `activity_cards` |

### `services/activityComments.ts`
| Function | Description |
|---|---|
| `addComment(userBookId, userId, commentText)` | Insert top-level comment |
| `addReply(userBookId, userId, parentCommentId, commentText)` | Insert threaded reply |
| `getActivityComments(userBookId, limit, offset)` | Fetch comments with user profiles |
| `deleteComment(commentId, userId)` | Delete own comment |
| `updateComment(commentId, userId, newText)` | Update own comment |
| `getCommentsCount(userBookId)` | Read denormalized count from `user_books.comments_count` |

### `services/activityLikes.ts`
| Function | Description |
|---|---|
| `toggleLike(userBookId, userId)` | Insert or delete like via unique constraint; returns `{ liked }` |
| `getActivityLikes(userBookId, limit, offset)` | List users who liked |
| `checkUserLiked(userBookId, userId)` | Boolean check |
| `getLikesCount(userBookId)` | Count from `activity_likes` |

### `services/activityCommentLikes.ts`
| Function | Description |
|---|---|
| `toggleCommentLike(commentId, userId)` | Like or unlike a comment |
| `getCommentLikes(commentIds, userId?)` | Batch fetch counts + liked-by-user set |
| `getCommentLikesList(commentId, limit, offset)` | List users who liked a comment |

### `services/analytics.ts`
| Function | Description |
|---|---|
| `trackFilterApplied(selectedGenres, selectedCustomLabels, shelfContext, resultCount, userId)` | Record filter usage event |
| `trackFilterCleared(shelfContext, userId)` | Record filter clear event |
| `trackCustomLabelDeleted(label, booksAffected, context, userId)` | Record custom label deletion |

### `services/books/shelf.ts`
| Function | Description |
|---|---|
| `addBookToShelf(bookData, status, userId, options?)` | Upsert book + create/update user_books entry |
| `addExistingBookToShelf(bookId, status, userId, options?)` | Add already-stored book to shelf by ID |
| `checkUserHasBook(bookId, userId)` | Returns `{ exists, userBookId, currentStatus }` |
| `updateReadingProgress(userId, bookId, progressPercent, createActivity?)` | Update percent; optionally emit activity card |
| `getReadingProgress(userId, bookId)` | Return current progress percent |
| `getUserBooks(userId)` | All shelf entries ordered by rating then rank_score |
| `updateTierScoresBatch(userId, tier, updatedBooks, options?)` | Batch rank_score update for a rating tier |
| `updateBookStatus(userBookId, newStatus, options?)` | Change shelf status |
| `updateUserBookDetails(userBookId, userId, updates, options?)` | Update rating, notes, custom_labels, user_genres |
| `removeBookFromShelf(userBookId)` | Delete user_book row |
| `redistributeRanksForRating(userId, rating)` | Recalculate rank_scores evenly across a tier |
| `getUserBookCounts(userId)` | Count entries by status |
| `getUserBooksByRating(userId, rating)` | Books in a specific tier ordered by rank_score |
| `getRecentUserBooks(userId, limit?)` | Recently updated user_books |
| `getReadSessions(userBookId)` | All read sessions for a user_book |
| `addReadSession(userBookId, dates)` | Create a read session (started/finished) |
| `updateReadSession(sessionId, dates)` | Update a read session |
| `deleteReadSession(sessionId)` | Delete a read session |
| `removeCustomLabelFromAllBooks(userId, labelToRemove)` | Batch remove label via `remove_custom_label` RPC |

### `services/books/googleBooks.ts`
| Function | Description |
|---|---|
| `searchBooks(query)` | Open Library search with relevance scoring; returns top 20 |
| `searchBooksWithStats(query)` | Search + overlay community stats from `books` table |
| `enrichBookWithGoogleBooks(olBook)` | Merge Open Library book with Google Books data |
| `buildBookFromOpenLibrary(olBook)` | Build book object from Open Library data only (fallback) |
| `searchGoogleBooks(title, author, year?)` | Direct Google Books API search |
| `enrichForAsk(suggestion)` | Enrich AI-suggested title/author for the Ask feature |
| `validateEnrichmentForSearch(enrichedBook, originalOlBook)` | Validate GB enrichment safety |
| `checkDatabaseForBook(openLibraryId?, googleBooksId?)` | Check if book already exists in DB |
| `saveBookToDatabase(enrichedBook)` | Upsert via `books-upsert` edge function |
| `clearGoogleBooksCache()` | Clear in-memory Google Books cache |

### `services/books/community.ts`
| Function | Description |
|---|---|
| `updateBookCommunityStats(bookId)` | Trigger `books-update-community-stats` edge function |
| `getBookCircles(bookId, userId?)` | Global + friends' avg score and count from `books_stats` |
| `getBookShelfCounts(bookId)` | Read/currently_reading/want_to_read counts from `books_stats` |

### `services/books/social.ts`
| Function | Description |
|---|---|
| `getFriendsRecentLiked(userId, limit?)` | Books recently liked/ranked ≥ 6.5 by followed users |
| `getFriendsRankingsForBook(bookId, userId, options?)` | Paginated friends' rankings for a specific book |
| `getOtherReadersForBook(bookId, userId, options?)` | Non-followed users who ranked this book |

### `services/books/upsert.ts`
| Function | Description |
|---|---|
| `upsertBookViaEdge(enrichedBook)` | Upsert book via `books-upsert` edge function; returns `{ book, book_id }` |

### `services/books/openLibraryLookup.ts`
| Function | Description |
|---|---|
| `lookupOpenLibraryIdByTitleAuthor(title, author?)` | Quick OL search; returns work ID (e.g. `/works/OL12345W`) or null |

### `services/bookDetails.ts`
| Function | Description |
|---|---|
| `fetchBookWithUserStatus(bookId, userId?)` | Fetch book row + optional user's shelf entry |

### `services/bookFeedback.ts`
| Function | Description |
|---|---|
| `submitBookFeedback(params)` | Submit book data issue via `book-feedback` edge function |

### `services/comparisons.ts`
| Function | Description |
|---|---|
| `createComparison(params)` | Create head-to-head ranking via `comparisons-create` edge function |
| `getUserComparisons(userId, options?)` | Fetch user's comparison history |

### `services/coverResolver.ts`
| Function | Description |
|---|---|
| `resolveCoverUrl(book)` | Resolve cover URL: DB → Google Books → Open Library; LRU cache + dedup pending |
| `verifyImageUrl(url)` | HEAD request to verify image exists and has content |
| `cacheToDatabase(book, coverUrl)` | Persist resolved cover URL to `books` table |

### `services/enrichment.ts`
| Function | Description |
|---|---|
| `enrichBook(bookId, openlibraryId)` | Enrich book via `books-enrich` edge function |

### `services/grok.ts`
| Function | Description |
|---|---|
| `askGrokForBooks(messages, userContent, options?)` | Call `grok-ask` edge function; parse and return book suggestions |

### `services/invites.ts`
| Function | Description |
|---|---|
| `fetchInviteProfile(userId)` | Invite code, sent/successful counts, unspent points, grandfathered flag |
| `fetchUnlockedFeatures(userId)` | List of unlocked feature keys |
| `acceptInvite(inviteCode)` | Call `accept-invite` edge function |
| `spendInvitePoint(featureKey)` | Call `spend-invite-point` edge function |
| `shareInviteLink()` | Create a single-use invite link via `create-invite-link` and open native share sheet |
| `storePendingInviteCode(code)` | Save deep-linked code to AsyncStorage |
| `getPendingInviteCode()` | Read pending code from AsyncStorage |
| `clearPendingInviteCode()` | Remove pending code from AsyncStorage |

### `services/notifications.ts`
| Function | Description |
|---|---|
| `fetchNotifications(userId, limit?)` | Fetch notifications with actor profiles and book/comment context |
| `fetchUnreadNotificationsCount(userId)` | Count notifications since `notifications_last_seen_at` |
| `getNotificationsLastSeen(userId)` | Read last-seen timestamp |
| `updateNotificationsLastSeen(userId, timestamp?)` | Update last-seen timestamp |
| `requestBadgePermission()` | Request iOS badge-only notification permission |
| `setBadgeCount(count)` | Set app icon badge number |
| `clearBadge()` | Reset app icon badge to 0 |

### `services/quiz.ts`
| Function | Description |
|---|---|
| `getQuizBookPair()` | Call `quiz-start`; returns a random pair of starter books |
| `skipQuiz()` | Call `quiz-skip`; sets `skipped_onboarding_quiz = true` |

### `services/recommendations.ts`
| Function | Description |
|---|---|
| `fetchRecommendations(userId, options?)` | Fetch stored recommendations ordered by score |
| `markRecommendationsShown(recommendationIds)` | Batch-set `shown_at` |
| `markRecommendationClicked(recommendationId)` | Set `clicked_at` |
| `generateRecommendations()` | Call `recommendations-generate` edge function |
| `refreshRecommendations()` | Call `recommendations-refresh` edge function |

### `services/recommendationTriggers.ts`
| Function | Description |
|---|---|
| `checkAndTriggerRecommendations(userId)` | Refresh if ≥ 10 comparisons or ≥ 7 days since last refresh |
| `onUserAction(userId, action)` | Increment rankings counter then check trigger |

### `services/recommendedUsers.ts`
| Function | Description |
|---|---|
| `getContactMatches(userId)` | Match device contacts via `match-contacts` edge function |
| `getGraphRecommendations(userId, limit?)` | Friends-of-friends via `get_recommended_users` RPC |
| `getMergedRecommendedUsers(userId)` | Merge both sources; contacts preferred; uses `Promise.allSettled` |

### `services/userProfile.ts`
| Function | Description |
|---|---|
| `getUserProfile(userId)` | Fetch profile row |
| `checkUsernameAvailability(username)` | Check via `check_username_available` RPC (bypasses RLS) |
| `checkIfFollowing(followerId, followingId)` | Boolean check |
| `updateUserProfile(userId, updates)` | Update name, username, bio, reading interests, photo URL |
| `uploadProfilePhoto(userId, imageUri)` | Upload to `profile-photos` bucket; deletes old photo first |
| `deleteProfilePhoto(photoUrlOrPath)` | Delete file from storage |
| `getProfilePictureUrl(pathOrUrl)` | Resolve full public URL from storage path or existing URL |
| `saveProfileWithPicture(userId, profileData, newImageUri, deleteProfilePicture)` | Combined profile save with photo handling |
| `searchMembers(query)` | ilike search on username and name; returns public profile fields |
| `followUser(followerId, followingId)` | RPC `request_follow`; returns `'following'` or `'requested'` |
| `getOutgoingFollowRequests(requesterId)` | Pending outgoing requests |
| `getIncomingFollowRequests(requestedId)` | Pending incoming requests |
| `acceptFollowRequest(requestId)` | RPC `accept_follow_request` |
| `rejectFollowRequest(requestId)` | RPC `reject_follow_request` |
| `cancelFollowRequest(requesterId, requestedId)` | Delete pending request row |
| `unfollowUser(followerId, followingId)` | Delete follow row + remove follow notification |
| `getBlockStatus(viewerId, targetId)` | Returns `{ blockedByViewer, blockedByTarget }` |
| `blockUser(blockerId, blockedId)` | RPC `block_user` |
| `unblockUser(blockerId, blockedId)` | Delete from `blocked_users` |
| `getBlockedUsers(blockerId)` | List blocked users with profiles |
| `muteUser(muterId, mutedId)` | Insert to `muted_users` |
| `unmuteUser(muterId, mutedId)` | Delete from `muted_users` |
| `getMutedUsers(muterId)` | List muted users with profiles |
| `checkIfMuted(muterId, mutedId)` | Boolean check |
| `checkPendingFollowRequest(requesterId, requestedId)` | Boolean check |
| `getFollowingIds(userId)` / `getFollowerIds(userId)` | Arrays of user IDs |
| `getFollowersList(userId)` / `getFollowingList(userId)` | Arrays of `UserSummary` with profiles |
| `getFollowerCount(userId)` / `getFollowingCount(userId)` | Counts |

### `services/users.ts`
| Function | Description |
|---|---|
| `searchUsersForMention(query, currentUserId, limit?)` | Search mutual connections first, fall back to global username search |

### `services/userPrivateData.ts`
| Function | Description |
|---|---|
| `getPrivateData(userId)` | Fetch email/phone; auto-creates row if missing |
| `updatePrivateData(userId, updates)` | Update private fields |

---

## Custom Hooks

### `useBookRanking(initialBooks?)`

Encapsulates the binary search insertion sort state machine for ranking. Used in `BookRankingScreen`.

```ts
const ranking = useBookRanking(existingBooks);
ranking.startInserting(newBook, tier);  // 'liked' | 'fine' | 'disliked'
ranking.chooseNewBook();                // new book wins comparison
ranking.chooseExistingBook();           // existing book wins
ranking.skipToBottom();                 // place new book last in tier
ranking.getCurrentComparison();         // { bookA, bookB } | null
ranking.isComplete();                   // boolean
ranking.getResult();                    // { books, insertedBook } | null
```

### `useInviteTier()`

Manages invite state and feature unlocks. Subscribes to Supabase Realtime on `user_invites` and `user_unlocked_features` for live updates.

```ts
const {
  hasFeature,        // (featureKey: FeatureKey) => boolean
  unspentPoints,
  inviteCount,
  sentCount,
  isWallCleared,     // grandfathered || sentCount >= 4
  availableToUnlock, // FeatureKey[]
  inviteCode,
  loading,
} = useInviteTier();
```

### `useNetworkStatus()`

```ts
const { isOnline } = useNetworkStatus();  // uses NetInfo, not navigator.onLine
```

---

## Supabase Edge Functions

All functions are in `supabase/functions/`. They run as Deno services.

| Function | Method | Purpose |
|---|---|---|
| `accept-invite` | POST | Accept an invite code; update counts on both users |
| `book-feedback` | POST | Store a book data issue report |
| `books-enrich` | POST | Fetch Open Library data and update a book record |
| `books-update-community-stats` | POST | Recalculate `community_average_score` and `community_rank_count` on `books` |
| `books-update-genres` | POST | Update global book genres (deprecated in favour of `user_genres`) |
| `books-upsert` | POST | Insert or update a book record; returns `{ book, book_id }` |
| `comparisons-create` | POST | Record a head-to-head choice; update both `user_books.rank_score` values |
| `delete-account` | POST | Permanently delete user (verifies password for email users) |
| `grok-ask` | POST | Proxy to xAI Grok API; returns structured book suggestions |
| `match-contacts` | POST | Match a list of phone numbers against `user_private_data` |
| `quiz-skip` | POST | Mark `skipped_onboarding_quiz = true` on `user_profiles` |
| `quiz-start` | GET | Return a random pair of starter books, excluding already-compared pairs |
| `recalculate-ranks` | POST | Recalculate all rank scores for a user within each tier |
| `recommendations-generate` | POST | Generate and store personalized book recommendations |
| `recommendations-refresh` | POST | Regenerate recommendations and reset the comparison counter |
| `resolve-phone` | POST | Look up email address for a phone number (used by sign-in) |
| `resolve-username` | POST | Look up email address for a username (used by sign-in) |
| `spend-invite-point` | POST | Deduct one point and insert a row into `user_unlocked_features` |
| `create-invite-link` | POST | Create a single-use, 24h invite link and increment sent count |

---

## Database Schema

Main tables and their purpose. Full DDL is in `supabase/schema.sql`.

| Table | Purpose |
|---|---|
| `books` | Book metadata: title, authors, ISBNs, description, cover_url, `community_average_score`, `community_rank_count` |
| `books_stats` | Denormalized per-book stats: global avg score, review count, shelf counts by status |
| `user_profiles` | Public profile: name, username, bio, photo URL, account_type (`public`/`private`), invite fields, onboarding flags, `notifications_last_seen_at` |
| `user_private_data` | Owner-only: email, phone |
| `user_books` | Shelf entries: `status`, `rating` (`liked`/`fine`/`disliked`), `rank_score` (NUMERIC 6,3), `progress_percent`, `notes`, `custom_labels[]`, `user_genres[]`, `likes_count`, `comments_count` |
| `user_book_read_sessions` | Multiple started/finished date pairs per `user_book` |
| `activity_cards` | Feed events: shelf changes and reading progress updates |
| `activity_likes` | Likes on `user_books` entries (unique per user+book) |
| `activity_comments` | Threaded comments on `user_books`; `parent_comment_id` for replies |
| `activity_comment_likes` | Likes on `activity_comments` |
| `notifications` | Notification events: `like`, `comment`, `follow`, `follow_request`, `follow_accept`, `follow_reject` |
| `comparisons` | Head-to-head ranking history: `winner_book_id`, `loser_book_id`, `is_onboarding` |
| `recommendations` | Generated book recommendations: `score`, `reason`, `algorithm_version`, `shown_at`, `clicked_at` |
| `user_follows` | Directed follow graph (public accounts) |
| `follow_requests` | Pending follow requests (private accounts); status: `pending`/`accepted`/`rejected` |
| `blocked_users` | Block relationships; enforced in RLS and helper functions |
| `muted_users` | Mute relationships; excluded from feed and notifications |
| `user_invites` | Per-invite records: `inviter_user_id`, `invitee_user_id`, `accepted_at` |
| `user_unlocked_features` | Per-user unlocked feature keys |
| `filter_events` | Shelf filter usage analytics |

Key RLS helper functions: `can_view_profile`, `can_view_content`, `is_blocked_between`, `is_muted_between`, `should_notify`.

Key RPCs: `get_followed_activity_cards`, `get_followed_user_books_activity`, `get_recommended_users`, `get_friends_book_stats`, `request_follow`, `accept_follow_request`, `reject_follow_request`, `block_user`, `check_username_available`, `remove_custom_label`, `increment_sent_invites_count`, `increment_rankings_counter`, `update_user_book_rank_scores_no_touch`, `update_user_book_status_no_touch`, `update_user_book_details_no_touch`.

---

## Setup

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo`)
- A Supabase project with the schema applied

### Environment variables

Create a `.env` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY=<google-books-api-key>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios-client-id>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>

# Optional — controls activity feed data source (default: activity_cards)
EXPO_PUBLIC_FEED_SOURCE=activity_cards
```

`EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` is optional; the app falls back to unauthenticated requests (lower quota).

### Running locally

```bash
npm install
npx expo start
```

Press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

### Database

Apply the schema to a fresh Supabase project:

```bash
# Using the Supabase CLI
supabase db reset --linked     # applies schema.sql + migrations
```

Or run `supabase/schema.sql` manually via the Supabase SQL editor.

Edge functions must be deployed separately:

```bash
supabase functions deploy
```

### Supabase Storage

Create a `profile-photos` bucket (public read access) in your Supabase project. The RLS policy on storage allows authenticated users to upload to their own `{userId}/` prefix.
