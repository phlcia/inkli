# Inkli - Book Ranking App

A social book ranking and discovery app built with Expo (React Native), Supabase, and Open Library API. Inkli helps readers organize their bookshelves, rank their favorite reads, and discover new books through community rankings.

## 🎨 Design System

### Colors
- **Primary Blue**: `#4EACE3` (buttons, logo, accents)
- **Brown Text**: `#5A4338` (all text)
- **Cream Background**: `#F5EDE1` (app background)
- **White**: `#FFFFFF` (text inside buttons, cards)

### Typography
- **Playfair Display Italic**: logo "inkli", section headers, hero titles
- **Inter Light 300**: body text, UI elements
- **Inter** (varied weights): buttons, labels, emphasis

## 🚀 Features

### ✅ Implemented Features

#### Authentication & User Profiles
- **Multi-provider authentication**: Email/password, Apple Sign In, Google Sign In
- **Sign-in options**: Sign in with username or email
- **User profiles**: Username, single name field, bio, reading interests
- **Profile photos**: Upload and manage profile pictures via Supabase Storage
- **Auto-profile creation**: Automatic profile creation on signup via database triggers
- **Account settings**: Private account screen for email/phone, password change, public/private account type, account deactivation, and account deletion (with password or confirmation)
- **Phone number**: Phone input and validation in sign-up and account settings

#### Book Management
- **Book search**: Search using Open Library API with Google Books enrichment
- **Simplified search results**: Clean book preview cards showing only cover image, title, and author
- **Book enrichment**: Automatic merging of data from Open Library and Google Books APIs
- **Smart book matching**: ISBN and title/author matching between data sources
- **Book shelf**: Organize books by status (Read, Currently Reading, Want to Read) with tabbed interface
- **Book details**: View and edit ratings (liked/fine/disliked), notes, start/finish dates, reading progress (input-based)
- **Auto-save**: Notes and dates automatically save as you type/select them
- **Book feedback**: Submit feedback (e.g. wrong cover, wrong metadata) from book detail screen
- **Genre & label filtering**: Filter books by preset genres and custom labels
- **Custom labels**: Create and manage custom labels for book organization
- **Read sessions**: Track multiple read sessions with start/finish dates for each book
- **Reading progress**: Input-based progress (e.g. percentage or page) on book detail
- **Community stats**: See average scores and member counts for books
- **Secure catalog writes**: `public.books` is read-only to clients; inserts handled by Edge Function

#### Ranking System
- **Binary search ranking**: Efficient O(log n) pairwise comparison system for ranking books
- **Category-based ranking**: Separate rankings for "liked", "fine", and "disliked" books
- **Precise scoring**: High-precision fractional scores (5+ decimal places) for accurate ordering
- **Score range**: Scores from 1.0 to 10.0 (10.0 is the maximum for "liked" books)
- **Rank persistence**: Rankings stored in database with automatic recalculation support

#### Social Features
- **Activity feed**: Home feed with followed users' activity, cursor pagination, pull-to-refresh
- **Activity cards**: Unified `RecentActivityCard` UI with likes/comments and book context
- **Leaderboard**: Global rankings based on books read count
- **User following**: Follow/unfollow other users
- **Member search**: Search for users by username or name
- **Profile viewing**: View other users' profiles and reading stats
- **Comments & likes**: Activity comments/likes with counts and detail screens
- **Notifications**: In-app notifications for follow requests, likes, comments, and other interactions
- **Followers/Following**: View and manage followers and following lists
- **Account privacy**: Public/private account types with follow request system
- **Block & mute**: Block or mute users for content moderation

#### Recommendations & Discovery
- **Onboarding quiz**: Quiz with book comparisons to build initial recommendations
- **Personalized recommendations**: Book recommendations based on reading history and preferences
- **Book circles**: See which users in your network have read specific books
- **Friends' rankings**: View friends' rankings and ratings for books

#### Navigation & UI
- **Tab navigation**: Home, Your Shelf, Search, Leaderboard, Profile
- **Stack navigation**: Nested navigation for search results, profile editing, and account settings
- **Onboarding flow**: Welcome screen, account creation, profile setup, taste quiz
- **Responsive design**: Safe area handling, keyboard avoidance (KeyboardAwareScrollView, debouncing)
- **Haptic feedback**: Tactile feedback for interactions (expo-haptics)
- **Error handling**: Error handling context and user feedback across sign-up, account settings, and quiz
- **Profile activity feed**: Paginated user activity feed on profile screen

### 🚧 In Progress / Needs Work

#### UI/UX Polish
- ✅ Activity cards with notes and dates display
- ✅ Simplified search result cards (image, title, author only)
- ✅ Auto-save for notes and dates
- Loading states could be more consistent across screens
- Error handling and user feedback messages
- Empty states for all screens
- ✅ Pull-to-refresh functionality
- Skeleton loaders for better perceived performance

#### Ranking System
- ✅ Notes and dates read display on activity cards
- ✅ Auto-save functionality for notes and dates
- ✅ Database precision fixed to support scores up to 10.0
- ✅ Drag-to-reorder alternative to binary search (for users who prefer it)
- ✅ Reading progress (input-based) on book detail
- Ranking history/undo functionality
- Export rankings feature

#### Search & Discovery
- ✅ Simplified search result cards (cleaner UI)
- ✅ Genre and custom label filtering
- ✅ Book recommendations based on reading history
- Advanced search filters (author, year, publication date range, etc.)
- Trending books section
- Recently added books by followed users

#### Performance Optimizations
- ✅ Image caching and optimization
- ✅ Pagination for large book lists
- Virtualized lists for better scroll performance
- ✅ Optimistic UI updates

## 📋 Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- Expo CLI (`npm install -g expo-cli`)
- Supabase account
- (Optional) Google Books API key

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Supabase

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Copy your project URL and anon key
3. Open `src/config/supabase.ts` and replace:
   - `YOUR_SUPABASE_URL` with your Supabase project URL
   - `YOUR_SUPABASE_ANON_KEY` with your Supabase anon key

### 3. Set Up Database Schema

Run all migration files in order in your Supabase SQL Editor. The repo contains many migrations in `supabase/` (e.g. user profiles, books, ranking, activity, notifications, privacy, account deactivation, user private data, reading progress, book feedback). Use the consolidated `supabase/schema.sql` if available; otherwise run `supabase/migrate_*.sql` in dependency order. Key areas covered:

- User profiles, bio, profile photos, single name field (`migrate_first_last_to_name`)
- Books, Open Library, ratings, notes, dates, rank score, community stats
- Activity feed, likes, comments, activity cards
- User follows, RLS, account type (public/private), block/mute
- Account deactivation and private data (`migrate_add_deactivated_at`, `migrate_user_private_data`)
- Reading progress, book feedback, recommendations

### 4. Deploy Edge Functions

- `supabase/functions/recalculate-ranks` (optional): maintenance rank recalculation
- `supabase/functions/books-upsert`: authenticated book upsert with validation (required)
- `supabase/functions/delete-account`: account deletion (required for delete-account flow)
- `supabase/functions/book-feedback`: submit book feedback from app (optional)

### 5. Configure Google Books API (Optional)

1. Get a Google Books API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a `.env` file in the project root:
   ```
   EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY=your_api_key_here
   ```
3. The API key is optional - the app works without it but with lower rate limits

### 6. Run the App

```bash
npm start
```

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go app.

## 📁 Project Structure

```
inkli/
├── src/
│   ├── components/
│   │   ├── books/
│   │   │   └── GenreLabelPicker.tsx     # Genre and label picker component
│   │   ├── filters/
│   │   │   ├── CustomLabelInput.tsx     # Custom label input component
│   │   │   ├── FilterPanel.tsx          # Filtration panel for books
│   │   │   └── GenreChip.tsx            # Genre chip component
│   │   └── ui/
│   │       └── DateRangePickerModal.tsx # Date range picker modal
│   ├── config/
│   │   ├── supabase.ts                  # Supabase client configuration
│   │   └── theme.ts                     # Colors and typography config
│   ├── contexts/
│   │   └── AuthContext.tsx              # Authentication context provider
│   ├── features/
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   │   └── OnboardingTabBar.tsx # Custom tab bar for onboarding
│   │   │   └── screens/
│   │   │       ├── CreateAccountScreen.tsx
│   │   │       ├── LoginScreen.tsx
│   │   │       ├── SetupProfileScreen.tsx
│   │   │       ├── SignInScreen.tsx
│   │   │       ├── SignUpEmailScreen.tsx
│   │   │       └── WelcomeScreen.tsx
│   │   ├── books/
│   │   │   ├── components/
│   │   │   │   ├── BookActionModal.tsx  # Book actions (edit, remove)
│   │   │   │   ├── BookComparisonModal.tsx # Binary search comparison UI
│   │   │   │   └── BookCoverPlaceholder.tsx # Placeholder for book covers
│   │   │   └── screens/
│   │   │       ├── BookDetailScreen.tsx # Book detail view
│   │   │       └── BookRankingScreen.tsx # Book ranking with notes and dates
│   │   ├── home/
│   │   │   └── screens/
│   │   │       └── HomeScreen.tsx       # Home activity feed
│   │   ├── leaderboard/
│   │   │   └── screens/
│   │   │       └── LeaderboardScreen.tsx # Global leaderboard
│   │   ├── onboarding/
│   │   │   ├── components/
│   │   │   │   ├── QuizBookCard.tsx     # Book card for onboarding quiz
│   │   │   │   └── TasteProfileCard.tsx # Profile card for taste quiz
│   │   │   └── screens/
│   │   │       └── QuizScreen.tsx       # Onboarding quiz screen
│   │   ├── profile/
│   │   │   ├── components/
│   │   │   │   ├── ProfileHeader.tsx            # Profile header component
│   │   │   │   └── ProfilePhotoActionSheet.tsx  # Profile photo actions
│   │   │   └── screens/
│   │   │       ├── AccountSettingsScreen.tsx    # Private account settings (email, phone, password, deactivate/delete)
│   │   │       ├── EditProfileScreen.tsx
│   │   │       ├── ProfileScreen.tsx             # User profile with activity feed
│   │   │       └── UserProfileScreen.tsx        # Public profile view
│   │   ├── recommendations/
│   │   │   └── components/
│   │   │       └── RecommendationsList.tsx # Book recommendations list
│   │   ├── search/
│   │   │   └── screens/
│   │   │       └── SearchScreen.tsx     # Book search
│   │   ├── shelf/
│   │   │   ├── components/
│   │   │   │   └── ShelfScreen.tsx      # Shelf view component
│   │   │   └── screens/
│   │   │       └── YourShelfScreen.tsx  # User's book shelf
│   │   └── social/
│   │       ├── components/
│   │       │   └── RecentActivityCard.tsx # Activity card UI component
│   │       └── screens/
│   │           ├── ActivityCommentsScreen.tsx # Activity comments thread
│   │           ├── ActivityLikesScreen.tsx    # Activity likes list
│   │           ├── FollowersFollowingScreen.tsx # Followers/following list
│   │           ├── NotificationsScreen.tsx    # Notifications screen
│   │           └── UserShelfScreen.tsx        # Public shelves
│   ├── hooks/
│   │   └── useBookRanking.ts            # Binary search ranking hook
│   ├── navigation/
│   │   ├── AuthStackNavigator.tsx       # Authentication flow navigation
│   │   ├── HomeStackNavigator.tsx       # Home feed stack
│   │   ├── ProfileStackNavigator.tsx    # Profile screen stack
│   │   ├── SearchStackNavigator.tsx     # Search screen stack
│   │   ├── TabNavigator.tsx             # Bottom tab navigation
│   │   ├── YourShelfStackNavigator.tsx  # Your Shelf stack
│   │   └── types.ts                     # Navigation types
│   ├── services/
│   │   ├── account.ts                   # Account deactivation, deletion, password update
│   │   ├── activityCommentLikes.ts      # Comment likes API
│   │   ├── activityComments.ts          # Activity comments API
│   │   ├── activityFeed.ts              # Home feed RPC + pagination
│   │   ├── activityLikes.ts             # Activity likes API
│   │   ├── analytics.ts                 # Analytics service
│   │   ├── bookFeedback.ts              # Book feedback submission (wrong cover, metadata, etc.)
│   │   ├── books.ts                     # Book-related API functions
│   │   ├── comparisons.ts               # Book comparison service
│   │   ├── coverResolver.ts             # Cover URL resolution service
│   │   ├── enrichment.ts                # Book enrichment service
│   │   ├── notifications.ts             # Notifications service
│   │   ├── quiz.ts                      # Onboarding quiz service
│   │   ├── recommendations.ts           # Book recommendations service
│   │   ├── supabase.ts                  # Supabase service exports
│   │   ├── userPrivateData.ts           # User private data (email, phone) read/update
│   │   ├── userProfile.ts               # User profile API functions
│   │   └── users.ts                     # User management service
│   ├── types/
│   │   ├── activityCards.ts             # Activity card types
│   │   ├── activityComments.ts          # Activity comment types
│   │   ├── activityLikes.ts             # Activity like types
│   │   └── users.ts                     # User types
│   └── utils/
│       ├── bookFilters.ts               # Book filtering utilities
│       ├── bookHelpers.ts               # Book helper functions
│       ├── bookRanking.ts               # Binary search ranking algorithm
│       ├── dateUtils.ts                 # Date utility functions
│       ├── genreMapper.ts               # Genre mapping utilities
│       └── rankScoreColors.ts           # Score color utilities
├── supabase/
│   ├── schema.sql                       # Consolidated schema (current)
│   ├── migrate_*.sql                    # Individual migration files
│   ├── functions/
│   │   ├── recalculate-ranks/           # Edge function for rank recalculation
│   │   └── books-upsert/                # Edge function for book upsert
│   └── check_and_fix_ranking.sql        # Ranking troubleshooting script
├── assets/                              # Images and icons
├── App.tsx                              # Main app entry point
└── package.json                         # Dependencies
```

### Architecture Overview

The codebase follows a **feature-based architecture** where domain-specific code is organized into feature modules under `src/features/`. Each feature contains its own:
- **screens/** - Screen components for that feature
- **components/** - Feature-specific UI components (where applicable)

This structure promotes:
- **Modularity**: Each feature is self-contained and independent
- **Scalability**: Easy to add new features without affecting existing ones
- **Maintainability**: Related code is grouped together, making it easier to locate and modify

**Feature Modules:**
- **auth/** - Authentication screens (welcome, sign in/up, account creation)
- **books/** - Book detail, ranking, and comparison interfaces
- **home/** - Home activity feed
- **leaderboard/** - Global user leaderboard
- **onboarding/** - Onboarding quiz
- **profile/** - User profile management and viewing
- **recommendations/** - Book recommendations
- **search/** - Book search functionality
- **shelf/** - User's book shelf management
- **social/** - Social features (activity cards, comments, likes, followers, notifications)

**Shared code** is organized outside the features directory:
- **components/** - Reusable UI components used across features
- **services/** - API and data access layer
- **hooks/** - Custom React hooks
- **utils/** - Utility functions and helpers
- **types/** - TypeScript type definitions
- **navigation/** - Navigation configuration
- **contexts/** - React context providers
- **config/** - App configuration files

## 🔧 Core Functions

### Book Services (`src/services/books.ts`)
Core book management and search functionality:
- `searchBooks(query)` - Search Open Library API
- `searchBooksWithStats(query)` - Search with community statistics
- `enrichBookWithGoogleBooks(olBook)` - Enrich with Google Books data
- `buildBookFromOpenLibrary(olBook)` - Build book object from Open Library data
- `checkDatabaseForBook(openLibraryId, googleBooksId)` - Check if book exists in database
- `addBookToShelf(bookData, status, userId, options)` - Add book to shelf
- `getUserBooks(userId)` - Get user's books ordered by rank
- `getUserBooksByRating(userId, rating)` - Get books by rating category
- `getUserBookCounts(userId)` - Get count of books by status
- `updateUserBookDetails(userBookId, userId, updates)` - Update book details (rating, notes, dates)
- `updateBookStatus(userBookId, userId, newStatus)` - Update book status
- `removeBookFromShelf(userBookId, userId)` - Remove book from shelf
- `getRecentUserBooks(userId, limit)` - Get recent activity with notes and dates
- `getBookCircles(bookId, userId, limit)` - Get users who have read a book
- `updateBookCommunityStats(bookId)` - Update community stats for a book
- `updateBookGenres(userBookId, userId, genres)` - Update book genres
- `getFriendsRankingsForBook(userId, bookId)` - Get friends' rankings for a book

### Read Sessions (`src/services/books.ts`)
Track reading sessions for books:
- `getReadSessions(userBookId, userId)` - Get read sessions for a book
- `addReadSession(userBookId, userId, startedDate, finishedDate)` - Add a read session
- `updateReadSession(sessionId, userBookId, userId, updates)` - Update a read session
- `deleteReadSession(sessionId, userBookId, userId)` - Delete a read session

### Activity Feed Services (`src/services/activityFeed.ts`)
Home feed with pagination and activity tracking:
- `fetchFollowedActivityCards(userId, options)` - Cursor-paginated feed from followed users
- `fetchUserActivityCards(userId, options)` - Cursor-paginated activity cards for a specific user

### Activity Engagement (`src/services/activityLikes.ts`, `src/services/activityComments.ts`)
Social engagement on activity items:
- `likeActivity(userId, activityCardId)` - Like an activity card
- `unlikeActivity(userId, activityCardId)` - Unlike an activity card
- `getActivityLikes(activityCardId, options)` - Get likes for an activity card
- `addComment(userId, activityCardId, content)` - Add comment to activity
- `getActivityComments(activityCardId, options)` - Get comments with pagination
- `deleteComment(commentId, userId)` - Delete a comment
- `likeComment(userId, commentId)` - Like a comment
- `unlikeComment(userId, commentId)` - Unlike a comment

### Account & Private Data (`src/services/account.ts`, `src/services/userPrivateData.ts`)
Account lifecycle and private user data:
- `deactivateAccount(userId)` - Deactivate account (sets deactivated_at, signs out)
- `deleteAccount(userId, passwordOrConfirmation, isOAuthUser)` - Permanently delete account (Edge Function)
- `updatePassword(newPassword)` - Update password for email users
- `getPrivateData(userId)` - Get email, phone for current user
- `updatePrivateData(userId, updates)` - Update email/phone (RLS-protected)

### Book Feedback (`src/services/bookFeedback.ts`)
- `submitBookFeedback({ bookId, issueType, description })` - Submit book feedback via Edge Function (e.g. wrong cover, metadata issues)

### User Profile Services (`src/services/userProfile.ts`)
Comprehensive user profile and social features:
- `getUserProfile(userId)` - Get user profile
- `updateUserProfile(userId, updates)` - Update profile
- `checkUsernameAvailability(username)` - Check if username is available
- `uploadProfilePhoto(userId, imageUri)` - Upload profile photo
- `deleteProfilePhoto(userId)` - Delete profile photo
- `getProfilePictureUrl(profilePicturePathOrUrl)` - Get profile picture URL
- `searchMembers(query)` - Search for users by username or name
- `followUser(followerId, followingId)` - Follow a user
- `unfollowUser(followerId, followingId)` - Unfollow a user
- `checkIfFollowing(followerId, followingId)` - Check if following a user
- `getFollowersList(userId, options)` - Get list of followers
- `getFollowingList(userId, options)` - Get list of users being followed
- `getFollowerCount(userId)` - Get follower count
- `getFollowingCount(userId)` - Get following count
- `getAccountType(userId)` - Get account type (public/private)
- `updateAccountType(userId, accountType)` - Update account type
- `getOutgoingFollowRequests(userId)` - Get pending outgoing follow requests
- `getIncomingFollowRequests(userId)` - Get pending incoming follow requests
- `acceptFollowRequest(requestId)` - Accept follow request
- `rejectFollowRequest(requestId)` - Reject follow request
- `cancelFollowRequest(requestId)` - Cancel outgoing follow request
- `blockUser(blockerId, blockedId)` - Block a user
- `unblockUser(blockerId, blockedId)` - Unblock a user
- `getBlockedUsers(userId)` - Get list of blocked users
- `muteUser(muterId, mutedId)` - Mute a user
- `unmuteUser(muterId, mutedId)` - Unmute a user
- `getMutedUsers(userId)` - Get list of muted users

### Recommendations (`src/services/recommendations.ts`)
Book recommendation engine:
- Provides personalized book recommendations based on reading history and preferences

### Onboarding Quiz (`src/services/quiz.ts`)
Onboarding quiz for recommendations:
- Manages quiz questions and responses to build user recommendations

### Cover Resolution (`src/services/coverResolver.ts`)
Intelligent cover URL resolution and caching:
- `resolveCoverUrl(book)` - Resolve best available cover URL from multiple sources

### Notifications (`src/services/notifications.ts`)
In-app notifications system:
- Manages user notifications for social interactions

### Analytics (`src/services/analytics.ts`)
User analytics and tracking:
- Tracks user actions and provides insights

### Ranking System (`src/utils/bookRanking.ts`)
Efficient binary search-based ranking algorithm:
- Binary search algorithm for O(log n) book ranking
- Supports three rating categories: liked, fine, disliked
- Default scores: 10.0 (liked), 6.0 (fine), 4.0 (disliked)
- High-precision fractional scores for accurate ordering
- Tiered ranking system for better organization

## 🎯 What Needs to Be Done

### High Priority
1. **Error Handling & User Feedback**
   - Consistent error messages across the app
   - Toast notifications for success/error states
   - ✅ Network error handling with retry options
   - ✅ Offline mode detection

2. **Performance Optimization**
   - Implement pagination for book lists (currently loads all books)
   - Add virtualized lists (FlatList optimization)
   - ✅ Image caching and lazy loading
   - ✅ Optimistic UI updates for better perceived performance

3. **Testing**
   - Unit tests for ranking algorithm
   - Integration tests for API calls
   - E2E tests for critical user flows
   - Performance testing

### Medium Priority
4. **Search Enhancements**
   - Advanced filters (genre, year, author, etc.)
   - Saved searches
   - Search suggestions/autocomplete

5. **Social Features**
   - Reviews on books (distinct from activity comments)
   - Book clubs/groups
   - Sharing book lists
   - Reading challenges

6. **Analytics & Insights**
   - Reading statistics dashboard
   - Genre breakdown
   - Reading goals and progress
   - Yearly reading summaries

### Low Priority
7. **UI/UX Polish**
   - Animations and transitions
   - Skeleton loaders
   - ✅ Haptic feedback (expo-haptics integrated)
   - Dark mode support

8. **Accessibility**
   - Screen reader support
   - Keyboard navigation
   - High contrast mode
   - Font size adjustments

## 🚀 Scalability Considerations

### Database & Backend

#### Current State
- ✅ Row Level Security (RLS) policies implemented
- ✅ Database triggers for automatic calculations
- ✅ Indexes on frequently queried columns
- ✅ Unique constraints to prevent duplicates

#### Recommendations for Scale

1. **Database Indexing**
   - Add composite indexes for common query patterns:
     ```sql
     CREATE INDEX idx_user_books_user_rating_score 
       ON user_books(user_id, rating, rank_score DESC);
     CREATE INDEX idx_books_title_search 
       ON books USING gin(to_tsvector('english', title));
     ```
   - Consider full-text search indexes for book search
   - Monitor query performance with `EXPLAIN ANALYZE`

2. **Caching Strategy**
   - **Redis/Memcached** for frequently accessed data:
     - User profiles
     - Leaderboard top 100
     - Popular book stats
     - Search results (with TTL)
   - **CDN** for static assets:
     - Book cover images
     - Profile photos
   - **Client-side caching**:
     - Cache book search results
     - Cache user's book list
     - Use React Query or SWR for smart caching

3. **Database Partitioning**
   - Partition `user_books` table by `user_id` hash for large scale
   - Consider time-based partitioning for activity logs (if added)

4. **Read Replicas**
   - Use Supabase read replicas for leaderboard queries
   - Separate read/write operations where possible

5. **Background Jobs**
   - Move rank recalculation to background jobs (Edge Functions)
   - Batch update community statistics
   - Use Supabase Edge Functions or external job queue (Bull, BullMQ)
   - Schedule periodic tasks for:
     - Recalculating global rankings
     - Updating community stats
     - Cleaning up old data

### API & Rate Limiting

1. **Rate Limiting**
   - Implement rate limiting per user/IP
   - Use Supabase Edge Functions with rate limiting middleware
   - Consider Cloudflare or similar for DDoS protection

2. **API Optimization**
   - Batch API requests where possible
   - Use GraphQL or REST endpoints that return only needed data
   - Implement request deduplication
   - Use connection pooling for database connections

3. **External API Management**
   - Implement robust retry logic with exponential backoff
   - Cache Google Books API responses (already partially done)
   - Consider Open Library API rate limiting
   - Monitor API quota usage

### Frontend Performance

1. **Code Splitting**
   - Lazy load screens and heavy components
   - Split navigation stacks
   - Use React.lazy() for modals and less-used screens

2. **Image Optimization**
   - Implement image compression
   - Use WebP format where supported
   - Lazy load images below the fold
   - Use placeholder images while loading

3. **State Management**
   - Consider Redux or Zustand for complex state
   - Implement proper state normalization
   - Use React Query for server state management

4. **Bundle Size**
   - Analyze bundle with `expo-bundle-analyzer`
   - Remove unused dependencies
   - Use tree-shaking effectively
   - Consider code splitting by route

### Monitoring & Observability

1. **Error Tracking**
   - Integrate Sentry or similar for error tracking
   - Track API errors and user-reported issues
   - Set up alerts for critical errors

2. **Performance Monitoring**
   - Track API response times
   - Monitor database query performance
   - Use React Native Performance Monitor
   - Track Core Web Vitals (for web version)

3. **Analytics**
   - User behavior tracking (privacy-compliant)
   - Feature usage metrics
   - Conversion funnel analysis
   - A/B testing infrastructure

### Infrastructure

1. **CDN & Asset Delivery**
   - Use Cloudflare or similar CDN
   - Cache book covers and profile photos
   - Implement cache invalidation strategy

2. **Database Scaling**
   - Monitor database size and growth
   - Plan for Supabase scaling (or migration path)
   - Consider connection pooling (PgBouncer)
   - Regular database maintenance (VACUUM, ANALYZE)

3. **Edge Functions**
   - Move heavy computations to Edge Functions
   - Use for rank recalculation
   - Implement webhooks for async operations

### Security

1. **Data Protection**
   - Encrypt sensitive data at rest
   - Use HTTPS everywhere
   - Implement proper CORS policies
   - Regular security audits

2. **Authentication**
   - Implement refresh token rotation
   - Add 2FA support
   - Rate limit authentication attempts
   - Monitor for suspicious activity

3. **Input Validation**
   - Validate all user inputs on both client and server
   - Sanitize user-generated content
   - Implement SQL injection prevention (Supabase handles this, but be aware)

### Scalability Milestones

- **1,000 users**: Current architecture should handle this well
- **10,000 users**: Add caching layer, optimize queries
- **100,000 users**: Implement read replicas, background jobs, CDN
- **1,000,000+ users**: Consider microservices, database sharding, dedicated infrastructure

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Expo Documentation](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [Open Library API](https://openlibrary.org/developers/api)
- [Google Books API](https://developers.google.com/books)

## 🤝 Contributing

This is a personal project, but suggestions and feedback are welcome!

## 📄 License

Private project - All rights reserved
