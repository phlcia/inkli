# Add "What you think" Section to BookDetailScreen

## Overview
Add a new editable section called "What you think" to `BookDetailScreen.tsx` positioned between the "Additional Information" section and "What your friends think" section. The section will allow users to edit their shelf status (placeholder for now), read dates, and notes directly from the book detail page.

**CRITICAL**: All updates in this section MUST be reflected in the Activity Feed since notes are PUBLIC and visible to followers.

## Implementation Details

### 1. State Management
- Add state variables to track:
  - User book data (notes, started_date, finished_date, status, userBookId)
  - Loading state for fetching/saving
  - Saving indicator state
  - Modal states for date pickers (started/finished separately)
  - Debounce timer refs for auto-save
- Fetch user book data on component mount and when book changes
- Extend `refreshBookStatus` to also fetch notes and dates to avoid duplicate queries

### 2. Data Fetching
- **Optimization**: Extend existing `refreshBookStatus` function to also fetch `notes`, `started_date`, and `finished_date` rather than creating a separate fetch
- Query `user_books` table to get: `notes`, `started_date`, `finished_date`, `status`, and `id` (userBookId)
- Use `resolveBookIdForStats` to get the book ID first
- Handle the case where book isn't on user's shelf yet (no userBookId exists)
- Show skeleton/shimmer loader while fetching to avoid layout shift

### 3. Activity Feed Integration (CRITICAL)

#### Data Sync Requirements
All updates must sync with the Activity Feed. The `user_books` table is the single source of truth for both BookDetailScreen and Activity Feed.

**When updating notes/dates/status:**
- Updates MUST use `updateUserBookDetails` or `updateBookStatus` which update the `user_books` table
- The `updated_at` field is automatically updated (unless `touchUpdatedAt: false`)
- Notes are PUBLIC and visible to followers in `RecentActivityCard`
- After successful save, ensure:
  - Local state is updated (optimistic update)
  - `refreshBookStatus` is called to sync shelf icons
  - Activity feed data refreshes if user is viewing their own profile

**Testing requirement**: Every change should be testable by checking a follower's activity feed. The `user_books` record should update, and the activity feed should reflect the changes.

#### Implementation Pattern
```typescript
// When updating notes
await updateUserBookDetails(userBookId, userId, {
  notes: newNotes,
  // updated_at is automatically set (unless touchUpdatedAt: false)
});

// When updating dates
await updateUserBookDetails(userBookId, userId, {
  started_date: newStartedDate,
  finished_date: newFinishedDate,
});

// When updating status
await updateBookStatus(userBookId, newStatus);
// OR if book doesn't exist yet:
const result = await addBookToShelf(book, status, userId);
```

### 4. Section UI Components

The section will be structured similar to "Additional Information" using `styles.descriptionSection` and `styles.descriptionLabel`:

#### **"Add shelves" slot** (PLACEHOLDER - Coming Soon):
- **Initially render as disabled/placeholder**: "Coming soon - Add to shelf"
- **Style with reduced opacity (0.5)** to clearly indicate disabled state
- **Do NOT wire up any press handlers** until feature is ready
- Use `TouchableOpacity` with `disabled={true}` prop
- **Note**: Shelf status is currently handled by the action icons at the top, but this slot provides a placeholder for future implementation

#### **"Add read dates" slot**:
- TouchableOpacity showing formatted dates or "Add read dates"
- Display dates as chips/tags if they exist (similar to image description)
- Show started_date and finished_date separately or combined
- On press, open date picker modal (reuse `DatePickerModal` component from BookRankingScreen)
- Support independent editing of started_date and finished_date
- **Empty state**: "Add when you started/finished reading"
- **UX consideration**: Should selecting "finished_date" automatically set shelf to "Read"? (Consider this)
- **Auto-suggest shelf status based on dates**:
  - If finished_date exists → suggest "Read" status
  - If started_date exists but no finished_date → suggest "Currently Reading"
- **Validation**: Ensure finished_date is not before started_date (prevent invalid date ranges)
- Save immediately on date selection (no debounce needed)

#### **"Notes:" slot**:
- TextInput component (multiline and scrollable)
- Show public visibility indicator: "📢 Visible to followers" or "📢 Your notes will be visible to your followers in their activity feed"
- **Empty state**: "Tap to add your thoughts about this book..."
- **Include note about public visibility** for notes
- **Auto-save timing**: Debounce 800ms after user stops typing
- Add subtle "Saving..." indicator during save operations
- Show "Saved ✓" confirmation after successful save (brief, then fade)
- Save immediately on blur
- Handle race conditions with refs for debounce timers

### 5. Empty State Design

When no user book exists, show inviting placeholders:
```
What you think
--------------
Shelf: [Coming soon - Add to shelf]
Read dates: [Add when you started/finished reading]
Notes: [Tap to add your thoughts about this book...]
      📢 Your notes will be visible to followers
```

Make it inviting and clear what each field does. Include note about public visibility for notes.

### 6. Saving Logic

#### For Notes:
- Use `updateUserBookDetails` with debouncing (1000ms)
- Save on blur (immediate)
- Show "saving..." indicator
- Handle save errors with user-friendly messages
- If book not on shelf yet, create book entry first using `addBookToShelf`

#### For Dates:
- Use `updateUserBookDetails` to update started_date and finished_date
- Save immediately on selection (no debounce)
- Validate: finished_date must be after started_date
- If book not on shelf yet, create book entry first

#### For Shelf Status (Future):
- If book not on shelf: Use `addBookToShelf` (which returns userBookId)
- If book already on shelf: Use `updateBookStatus` for status changes
- Sync with existing shelf icons at the top

#### Auto-save Strategy:
- **Notes**: Debounce 800ms after user stops typing
- **Dates**: Save immediately upon date selection
- **Status**: Save immediately on selection (when implemented)
- Show subtle "Saving..." indicator during save operations
- Show "Saved ✓" confirmation after successful save (brief, then fade)
- Use refs to handle race conditions and cleanup timers

### 7. Error Handling

- Add user-friendly error messages:
  - "Couldn't save your notes. Please try again."
  - "Couldn't save dates. Please try again."
- Show toast/alert for save errors
- **Error Recovery**: 
  - If save fails, retain user's input and show retry option
  - Don't silently fail - use Toast/Alert for error feedback
  - Consider optimistic updates with rollback on failure
- Retry mechanism for failed saves
- Handle network errors gracefully
- Show error state if sync with activity feed fails

### 8. Activity Feed Synchronization

**IMPORTANT**: All updates in this section must sync with the Activity Feed.

#### Notes are PUBLIC and visible to followers
- Notes appear in `RecentActivityCard` component
- When saving any field (notes, dates, status), ensure `updated_at` timestamp is updated in `user_books` table
- The `updated_at` field is automatically updated by `updateUserBookDetails` (unless `touchUpdatedAt: false`)

#### After successful save operations:
- Refresh activity feed data if viewing own profile
- Invalidate any cached activity queries
- Determine if edits create new activity entries or update existing ones (typically updates existing if `user_books` record already exists)

#### Database Consistency:
```typescript
// When updating via updateUserBookDetails
await updateUserBookDetails(userBookId, userId, {
  notes: newNotes,
  started_date: startedDate,
  finished_date: finishedDate,
  // updated_at is automatically set (unless touchUpdatedAt: false)
  // This is CRITICAL for activity tracking
});
```

#### Testing Requirements:
- Add notes → Verify appears in follower's activity feed
- Edit notes → Verify activity feed shows updated notes
- Update dates → Verify dates appear in activity cards
- Change shelf status → Verify status change reflects in activity
- Test with multiple followers to ensure public visibility

### 9. Loading States

- Show skeleton/shimmer while fetching initial data to avoid layout shift
- Show "Saving..." indicator during saves
- Show "Saved ✓" confirmation after successful save (brief, then fade)
- Disable inputs during save operations
- Handle loading states gracefully

### 10. Styling

- Use existing `descriptionSection` and `descriptionLabel` styles
- Create new styles for:
  - Editable slots (similar to infoText but with TouchableOpacity/TextInput)
  - Date chips/tags (match design system)
  - Public visibility indicator (subtle, not intrusive)
  - Placeholder/disabled state for shelf slot
  - Saving indicator
- Ensure proper spacing and alignment
- Match design system colors and typography

### 11. Race Condition Handling

Use refs to manage debounce timers and prevent race conditions:

```typescript
const notesSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

const handleNotesChange = (text: string) => {
  setNotes(text);
  
  if (notesSaveTimerRef.current) {
    clearTimeout(notesSaveTimerRef.current);
  }
  
  notesSaveTimerRef.current = setTimeout(async () => {
    await saveNotes(text);
    // Trigger activity feed refresh if needed
  }, 1000);
};

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
    }
  };
}, []);
```

### 12. Integration Points

- Position the section between "Additional Information" and "What your friends think" sections
- Ensure it works with existing `refreshBookStatus` logic (extend it rather than duplicate)
- Sync with existing shelf status icons (the action icons at the top) - updating shelf status here should update the icons
- Handle book ID resolution (use `resolveBookIdForStats`)
- Ensure proper TypeScript typing for all state variables and function parameters

### 13. Edge Cases

- Handle case where user book doesn't exist yet (show empty state, allow creation)
- Handle save errors gracefully with retry mechanism
- Ensure data persists correctly and syncs with activity feed
- Handle book ID resolution edge cases
- Consider race conditions if user updates from multiple places
- Handle rapid edits (ensure debouncing works and final state is correct)
- Ensure `updated_at` field is properly set for activity feed (default behavior unless `touchUpdatedAt: false`)
- **Date Validation**: 
  - Validate finished_date is not before started_date
  - Consider auto-suggesting shelf status based on dates:
    - If finished_date exists → suggest "Read" status
    - If started_date exists but no finished_date → suggest "Currently Reading"
- **Error Recovery**: 
  - If save fails, retain user's input and show retry option
  - Don't silently fail - use Toast/Alert for error feedback
  - Consider optimistic updates with rollback on failure

### 14. Accessibility

- Add proper labels and hints for screen readers
- Ensure touch targets are appropriately sized
- Provide clear visual feedback for interactions

## Files to Modify
- `src/features/books/screens/BookDetailScreen.tsx`: Add the new section, state management, data fetching, and save logic

## Files to Reference (for patterns)
- `src/features/books/screens/BookRankingScreen.tsx`: Reference for notes/date editing patterns, date picker usage, debounce patterns
- `src/services/books.ts`: Use `updateUserBookDetails`, `addBookToShelf`, `updateBookStatus` functions
- `src/features/social/components/RecentActivityCard.tsx`: Understand how notes/dates appear in activity feed

## Testing Checklist

### UI Tests
- [ ] Section appears between "Additional Information" and "What your friends think" sections
- [ ] Empty state displays correctly when no user book exists
- [ ] Date pickers open and close properly
- [ ] Notes field is multiline and scrollable
- [ ] Shelf status placeholder shows "Coming soon" with reduced opacity
- [ ] Public visibility indicator is clear but not intrusive
- [ ] Saving indicator appears during saves
- [ ] "Saved ✓" confirmation appears after successful save
- [ ] Placeholder text is clear and inviting
- [ ] Date chips/tags display correctly
- [ ] Disabled state for shelf slot is clear

### Functional Tests
- [ ] Notes save after 800ms debounce period
- [ ] Notes save immediately on blur
- [ ] Dates save immediately on selection
- [ ] Date validation prevents finished_date < started_date
- [ ] Updates sync with top shelf status icons
- [ ] Loading states show during save operations
- [ ] Error messages display on save failures
- [ ] Retry mechanism works for failed saves
- [ ] User input is retained on save failure

### Activity Feed Integration Tests (CRITICAL)
- [ ] New notes appear in activity feed
- [ ] Edited notes update in activity feed
- [ ] Dates appear in activity cards
- [ ] Status changes reflect in activity feed (when implemented)
- [ ] Follower can see all updates in their feed
- [ ] `updated_at` timestamp is accurate
- [ ] Test with multiple followers to ensure public visibility
- [ ] Activity feed refreshes after updates
- [ ] Cached activity queries are invalidated

### Edge Cases
- [ ] Test with book not on shelf yet → Verify book gets added when data is saved
- [ ] Test with network errors → Verify error handling and retry
- [ ] Test date validation (finished_date after started_date)
- [ ] Test race conditions (rapid typing/editing)
- [ ] Test empty state display
- [ ] Test loading states (skeleton/shimmer)
- [ ] Test optimistic updates with rollback on failure

### Integration
- [ ] Verify shelf icons sync when status changes (when implemented)
- [ ] Verify `refreshBookStatus` works correctly after updates
- [ ] Test book ID resolution edge cases
- [ ] Verify activity feed data refreshes when viewing own profile

## Implementation Phases

### Phase 1 - Basic Structure
- Add section UI with empty states
- Add placeholder for shelf status (disabled, opacity 0.5)
- Wire up state management
- Extend `refreshBookStatus` to fetch notes and dates

### Phase 2 - Notes Functionality
- Implement notes TextInput (multiline, scrollable)
- Add debounced auto-save (800ms)
- Add public visibility indicator
- Add "Saving..." and "Saved ✓" indicators
- Test activity feed sync thoroughly

### Phase 3 - Date Functionality
- Add date pickers (reuse from BookRankingScreen)
- Implement date validation (finished_date not before started_date)
- Add date chips/tags display
- Add auto-suggest shelf status based on dates
- Test activity feed sync thoroughly

### Phase 4 - Polish
- Add loading/saving indicators
- Implement error handling with retry
- Add success confirmations
- Add optimistic updates with rollback
- Final testing with activity feed

### Phase 5 - Shelf Status (Future)
- Implement when ready
- Replace placeholder with functional selector
- Sync with existing shelf icons
- Test activity feed sync

## Key Reminders

### CRITICAL REQUIREMENTS:
1. **Notes field MUST update the same `user_books.notes` that `RecentActivityCard` reads**
2. **ALWAYS update `updated_at` timestamp when saving any field** (automatic unless `touchUpdatedAt: false`)
3. **Test every change by checking a follower's activity feed**
4. **The `user_books` table is the single source of truth** for both book details and activity feed
5. **Keep shelf status as a disabled placeholder** until explicitly told to implement it

### Database Consistency:
- All updates must use existing service functions: `updateUserBookDetails`, `updateBookStatus`, `addBookToShelf`
- These functions properly update the database and trigger activity feed updates
- The `updated_at` field is critical for activity tracking

### Testing Principle:
**Every change in "What you think" should be testable by checking a follower's activity feed.** The `user_books` record should update, and the activity feed should reflect the changes immediately.
