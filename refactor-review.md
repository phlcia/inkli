Here’s a focused review based on what I scanned, prioritized for impact.

## File Length Issues (>=500 lines)
- `src/features/books/screens/BookDetailScreen.tsx` (1686)
- `supabase/schema.sql` (1632)
- `src/features/books/screens/BookRankingScreen.tsx` (1255)
- `src/features/profile/screens/ProfileScreen.tsx` (1216)
- `src/features/search/screens/SearchScreen.tsx` (1145)
- `src/services/userProfile.ts` (1123)
- `src/features/social/screens/ActivityCommentsScreen.tsx` (1016)
- `src/services/books/shelf.ts` (991)
- `src/features/profile/screens/UserProfileScreen.tsx` (905)
- `supabase/migrate_add_privacy_blocking.sql` (802)
- `src/features/social/screens/NotificationsScreen.tsx` (779)
- `src/services/books/googleBooks.ts` (724)
- `src/features/shelf/components/ShelfScreen.tsx` (721)
- `src/features/books/components/BookComparisonModal.tsx` (718)
- `README.md` (668)
- `src/features/social/components/RecentActivityCard.tsx` (653)
- `supabase/functions/recommendations-generate/index.ts` (619)
- `src/features/recommendations/components/RecommendationsList.tsx` (541)
- `src/features/onboarding/screens/QuizScreen.tsx` (537)
- `src/features/profile/screens/EditProfileScreen.tsx` (535)

## Biggest Split Opportunities
- `src/features/profile/screens/ProfileScreen.tsx` + `src/features/profile/screens/UserProfileScreen.tsx`: highly duplicated (render helpers, styles, data fetch patterns). Split into shared “profile UI” components + hooks, then a thin “self profile” vs “other user” wrapper.
- `src/features/books/screens/BookDetailScreen.tsx`: split into `components/` (header, action row, sessions list, friends activity list, modals) and `hooks/` (data loading, shelf actions).
- `src/services/books.ts`: split into `books/types.ts`, `books/queries.ts`, `books/mutations.ts`, `books/googleBooks.ts`, `books/cover.ts`.
- `src/features/social/components/RecentActivityCard.tsx`: move layout sections into subcomponents, keep card shell in main file.
- `src/features/social/screens/ActivityCommentsScreen.tsx`: extract header logic + comment list into components, and move fetch/submit logic into a hook.

## Code Duplication
- Date helpers were repeated in multiple screens; consolidated into:
  - `src/utils/dateRanges.ts` with `formatDateForDisplay` + `formatDateRange`.
  - Updated use sites: Profile/Home/Book/Comments screens + `src/components/ui/DateRangePickerModal.tsx`.
- `getActionText` duplication consolidated into:
  - `src/utils/activityText.ts` and updated Profile/Home/Book/Comments usage.
- “Fetch book detail + user_book status” duplication consolidated into:
  - `src/services/bookDetails.ts` helper `fetchBookWithUserStatus`.
- “Toggle want-to-read” duplication consolidated into:
  - `src/features/books/hooks/useToggleWantToRead.ts`.
- Shared profile UI + follow menu actions extracted into:
  - `src/features/profile/components/ProfileHeader.tsx`, `ProfileInfoSection.tsx`, `ProfileCards.tsx`, `FollowMenuActions.tsx`.

## Single Responsibility Violations
- `src/features/profile/screens/ProfileScreen.tsx`: most shared UI extracted; still handles data fetch + privacy + follow requests + block/mute. Remaining split: `hooks/useProfileData.ts` + `hooks/usePrivacySettings.ts`.
- `src/features/profile/screens/UserProfileScreen.tsx`: follow/mute/block logic extracted to `src/features/profile/hooks/useFollowActions.ts`; remaining data fetch could move to `hooks/useUserProfile.ts`.
- `src/services/books.ts`: now split into `src/services/books/` modules (types/cover/googleBooks/metadata/shelf/social/community/utils/upsert). Main file is barrel exports.

## Dead Code / Diagnostic Code
- `src/services/books.ts` has deprecated fields in `UserBook` (comments indicate old columns). If fully migrated, consider removing or isolating in a legacy type.
- Debug logging sweep completed; `console.log` usage removed and fallout cleaned.

## Organizational Improvements
- Create feature-level folders with sub-areas:
  - `src/features/profile/components/`, `src/features/profile/hooks/`, `src/features/profile/styles/`
  - `src/features/books/components/`, `src/features/books/hooks/`, `src/features/books/services/`
- Consider `src/shared/` or `src/ui/` for reusable components like shelf cards, stats cards, tab headers.
- Consider `src/services/books/` and `src/services/profile/` subfolders instead of single huge service files.

## Plan Suggestions (prioritized)
- 1) Extract shared date + action text utilities and replace duplicates across profile/home/book screens. ✅
- 2) Consolidate shared profile UI + styles into `src/features/profile/components/`; thin out `ProfileScreen` and `UserProfileScreen`. ✅ (styles still inline)
- 3) Move duplicated “book detail fetch + user status” logic into a shared service/helper/hook. ✅
- 4) Split `src/services/books.ts` into focused modules and move types into a dedicated file. ✅
- 5) Break `BookDetailScreen` into sections and move data/interaction logic into hooks. ✅ (Friends/Thoughts sections + hooks)
- 6) Create hooks for repeated shelf actions and follow/block/mute flows. ✅ (useToggleWantToRead, useFollowActions)
- 7) Review and remove debug logs and any unreachable/legacy code after refactors. ✅

## Progress
- Completed refactors:
  - Utilities: `src/utils/dateRanges.ts`, `src/utils/activityText.ts`.
  - Services: `src/services/bookDetails.ts`, `src/services/books/` modules + `src/services/books.ts` barrel.
  - Profile components: `ProfileHeader`, `ProfileInfoSection`, `ProfileCards`, `FollowMenuActions`.
  - Hooks: `useToggleWantToRead`, `useFollowActions`, `useBookStats`, `useFriendsRankings`, `useBookThoughts`.
  - Book sections: `FriendsRankingsSection`, `BookThoughtsSection`.
  - Debug log sweep + cleanup in:
    - `src/features/profile/screens/ProfileScreen.tsx`
    - `src/features/shelf/components/ShelfScreen.tsx`
    - `src/components/books/GenreLabelPicker.tsx`
    - `src/services/userProfile.ts`
    - `src/features/books/hooks/useBookThoughts.ts`
    - `src/utils/bookFilters.ts`
    - `src/services/books/shelf.ts`
