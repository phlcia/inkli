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
- **User profiles**: Username, first/last name, bio, reading interests
- **Profile photos**: Upload and manage profile pictures via Supabase Storage
- **Auto-profile creation**: Automatic profile creation on signup via database triggers

#### Book Management
- **Book search**: Search using Open Library API with Google Books enrichment
- **Simplified search results**: Clean book preview cards showing only cover image, title, and author
- **Book enrichment**: Automatic merging of data from Open Library and Google Books APIs
- **Smart book matching**: ISBN and title/author matching between data sources
- **Book shelf**: Organize books by status (Read, Currently Reading, Want to Read) with tabbed interface
- **Book details**: View and edit ratings (liked/fine/disliked), notes, start/finish dates
- **Auto-save**: Notes and dates automatically save as you type/select them
- **Community stats**: See average scores and member counts for books

#### Ranking System
- **Binary search ranking**: Efficient O(log n) pairwise comparison system for ranking books
- **Category-based ranking**: Separate rankings for "liked", "fine", and "disliked" books
- **Precise scoring**: High-precision fractional scores (5+ decimal places) for accurate ordering
- **Score range**: Scores from 1.0 to 10.0 (10.0 is the maximum for "liked" books)
- **Rank persistence**: Rankings stored in database with automatic recalculation support

#### Social Features
- **Activity feed**: Recent activity cards on profile showing book additions with notes and dates read
- **Leaderboard**: Global rankings based on books read count
- **User following**: Follow/unfollow other users
- **Member search**: Search for users by username, first name, or last name
- **Profile viewing**: View other users' profiles and reading stats

#### Navigation & UI
- **Tab navigation**: Home, Your Shelf, Search, Leaderboard, Profile
- **Stack navigation**: Nested navigation for search results and profile editing
- **Onboarding flow**: Welcome screen, account creation, profile setup, reading interests
- **Responsive design**: Safe area handling, proper keyboard avoidance

### 🚧 In Progress / Needs Work

#### Home Screen
- Currently a placeholder - needs implementation
- **Suggested features**: Activity feed, recommended books, following users' activity, trending books

#### UI/UX Polish
- ✅ Activity cards with notes and dates display
- ✅ Simplified search result cards (image, title, author only)
- ✅ Auto-save for notes and dates
- Loading states could be more consistent across screens
- Error handling and user feedback messages
- Empty states for all screens
- Pull-to-refresh functionality
- Skeleton loaders for better perceived performance

#### Ranking System
- ✅ Notes and dates read display on activity cards
- ✅ Auto-save functionality for notes and dates
- ✅ Database precision fixed to support scores up to 10.0
- Drag-to-reorder alternative to binary search (for users who prefer it)
- Bulk ranking operations (rank multiple books at once)
- Ranking history/undo functionality
- Export rankings feature

#### Search & Discovery
- ✅ Simplified search result cards (cleaner UI)
- Search filters (genre, author, year, etc.)
- Book recommendations based on reading history
- Trending books section
- Recently added books by followed users

#### Performance Optimizations
- Image caching and optimization
- Pagination for large book lists
- Virtualized lists for better scroll performance
- Optimistic UI updates

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

Run all migration files in order in your Supabase SQL Editor:

1. `supabase/migrate_add_user_profiles.sql` - User profiles table
2. `supabase/migrate_auto_create_profile.sql` - Auto-create profile trigger
3. `supabase/migrate_add_book_fields.sql` - Books table with all fields
4. `supabase/migrate_open_library.sql` - Open Library ID support
5. `supabase/migrate_unique_user_book.sql` - Unique constraint on user_books
6. `supabase/migrate_add_book_rating_fields.sql` - Rating, notes, dates fields
7. `supabase/migrate_rank_score.sql` - Rank score system
8. `supabase/migrate_add_community_stats_with_triggers.sql` - Community statistics
9. `supabase/migrate_user_ranking.sql` - User ranking system
10. `supabase/migrate_add_bio_field.sql` - Bio field for profiles
11. `supabase/migrate_setup_profile_photos_storage.sql` - Profile photo storage
12. `supabase/migrate_add_user_follows.sql` - User following system
13. `supabase/migrate_update_user_profiles_rls.sql` - Row Level Security policies
14. `supabase/migrate_fix_rank_score_precision.sql` - Fix rank_score precision to allow 10.0 (NUMERIC(4,2))

Or use the consolidated `supabase/schema.sql` if available.

### 4. Configure Google Books API (Optional)

1. Get a Google Books API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a `.env` file in the project root:
   ```
   EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY=your_api_key_here
   ```
3. The API key is optional - the app works without it but with lower rate limits (1,000 requests/day)
4. With an API key, you get higher rate limits (up to 10,000 requests/day depending on quota)

### 5. Run the App

```bash
npm start
```

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go app.

## 📁 Project Structure

```
inkli/
├── src/
│   ├── components/
│   │   ├── BookActionModal.tsx          # Book actions (edit, remove)
│   │   ├── BookComparisonModal.tsx      # Binary search comparison UI
│   │   ├── BookDetailModal.tsx          # Book details and add to shelf
│   │   ├── BookRankingModal.tsx         # Ranking flow modal
│   │   ├── DatePicker.tsx               # Date picker component
│   │   ├── DatePickerModal.tsx          # Date picker modal
│   │   ├── OnboardingTabBar.tsx         # Custom tab bar for onboarding
│   │   └── ProfilePhotoActionSheet.tsx  # Profile photo actions
│   ├── config/
│   │   ├── supabase.ts                  # Supabase client configuration
│   │   └── theme.ts                     # Colors and typography config
│   ├── contexts/
│   │   └── AuthContext.tsx              # Authentication context provider
│   ├── hooks/
│   │   └── useBookRanking.ts            # Binary search ranking hook
│   ├── navigation/
│   │   ├── AuthStackNavigator.tsx       # Authentication flow navigation
│   │   ├── ProfileStackNavigator.tsx    # Profile screen stack
│   │   ├── SearchStackNavigator.tsx     # Search screen stack
│   │   └── TabNavigator.tsx             # Bottom tab navigation
│   ├── screens/
│   │   ├── HomeScreen.tsx               # Home (placeholder)
│   │   ├── YourShelfScreen.tsx         # User's book shelf
│   │   ├── SearchScreen.tsx             # Book search
│   │   ├── BookDetailScreen.tsx         # Book detail view
│   │   ├── BookRankingScreen.tsx        # Book ranking with notes and dates
│   │   ├── LeaderboardScreen.tsx        # Global leaderboard
│   │   ├── ProfileScreen.tsx           # User profile with activity feed
│   │   ├── EditProfileScreen.tsx        # Edit profile
│   │   ├── WelcomeScreen.tsx            # Onboarding welcome
│   │   ├── CreateAccountScreen.tsx      # Account creation
│   │   ├── SignInScreen.tsx             # Sign in
│   │   ├── SignUpEmailScreen.tsx        # Email signup
│   │   ├── SetupProfileScreen.tsx       # Profile setup
│   │   └── ReadingInterestsScreen.tsx   # Reading interests selection
│   ├── services/
│   │   ├── books.ts                     # Book-related API functions
│   │   └── userProfile.ts               # User profile API functions
│   └── utils/
│       ├── bookRanking.ts               # Binary search ranking algorithm
│       ├── bookRanking.example.ts       # Ranking example/guide
│       └── rankScoreColors.ts           # Score color utilities
├── supabase/
│   ├── schema.sql                       # Consolidated schema (legacy)
│   ├── migrate_*.sql                    # Individual migration files
│   │   └── migrate_fix_rank_score_precision.sql  # Fix rank_score to NUMERIC(4,2)
│   ├── functions/
│   │   └── recalculate-ranks/           # Edge function for rank recalculation
│   └── check_and_fix_ranking.sql        # Ranking troubleshooting script
├── assets/                              # Images and icons
├── App.tsx                              # Main app entry point
└── package.json                         # Dependencies
```

## 🔧 Core Functions

### Book Services (`src/services/books.ts`)
- `searchBooks(query)` - Search Open Library API
- `searchBooksWithStats(query)` - Search with community statistics
- `enrichBookWithGoogleBooks(olBook)` - Enrich with Google Books data
- `addBookToShelf(bookData, status, userId, options)` - Add book to shelf
- `getUserBooks(userId)` - Get user's books ordered by rank
- `updateBookRankScore(userId, rating, userBookId, position)` - Update ranking
- `updateUserBookDetails(userBookId, userId, updates)` - Update book details (rating, notes, dates)
- `getUserBooksByRating(userId, rating)` - Get books by rating category
- `getRecentUserBooks(userId, limit)` - Get recent activity with notes and dates

### User Profile Services (`src/services/userProfile.ts`)
- `getUserProfile(userId)` - Get user profile
- `updateUserProfile(userId, updates)` - Update profile
- `uploadProfilePhoto(userId, imageUri)` - Upload profile photo
- `searchMembers(query)` - Search for users
- `followUser(followerId, followingId)` - Follow a user
- `unfollowUser(followerId, followingId)` - Unfollow a user

### Ranking System (`src/utils/bookRanking.ts`)
- Binary search algorithm for efficient book ranking
- O(log n) comparisons instead of O(n) for inserting new books
- Supports three rating categories: liked, fine, disliked
- Default scores: 10.0 (liked), 6.0 (fine), 4.0 (disliked)

## 🎯 What Needs to Be Done

### High Priority
1. **Home Screen Implementation**
   - Activity feed showing recent book additions by followed users
   - Recommended books based on reading history
   - Trending books section
   - Personalized content

2. **Error Handling & User Feedback**
   - Consistent error messages across the app
   - Toast notifications for success/error states
   - Network error handling with retry options
   - Offline mode detection

3. **Performance Optimization**
   - Implement pagination for book lists (currently loads all books)
   - Add virtualized lists (FlatList optimization)
   - Image caching and lazy loading
   - Optimistic UI updates for better perceived performance

4. **Testing**
   - Unit tests for ranking algorithm
   - Integration tests for API calls
   - E2E tests for critical user flows
   - Performance testing

### Medium Priority
5. **Search Enhancements**
   - Advanced filters (genre, year, author, etc.)
   - Search history
   - Saved searches
   - Search suggestions/autocomplete

6. **Social Features**
   - Comments/reviews on books
   - Book clubs/groups
   - Sharing book lists
   - Reading challenges

7. **Analytics & Insights**
   - Reading statistics dashboard
   - Genre breakdown
   - Reading goals and progress
   - Yearly reading summaries

### Low Priority
8. **UI/UX Polish**
   - Animations and transitions
   - Skeleton loaders
   - Pull-to-refresh everywhere
   - Haptic feedback
   - Dark mode support

9. **Accessibility**
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