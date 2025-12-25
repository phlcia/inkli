---
name: Add tabs to Your Shelf screen
overview: Add three tabs (Read, Currently Reading, Want to Read) to the Your Shelf screen with proper filtering, sorting, and active tab styling. For Read books, maintain rank_score sorting. For Currently Reading and Want to Read, sort alphabetically with a note about future average score ranking.
todos:
  - id: add-tab-state
    content: "Add activeTab state to track which tab is selected (default: 'read')"
    status: completed
  - id: add-tab-ui
    content: Create tab navigation UI component with three tabs below header
    status: completed
  - id: implement-filtering
    content: Filter books array by activeTab status
    status: completed
  - id: implement-sorting
    content: "Implement conditional sorting: rank_score for read, alphabetical for others"
    status: completed
  - id: update-title
    content: Change header title from 'inkli' to 'My Shelf'
    status: completed
  - id: conditional-score-display
    content: Only show score circles for Read books (they have rank_score)
    status: completed
  - id: update-empty-states
    content: Add appropriate empty state messages for each tab
    status: completed
  - id: add-profile-navigation
    content: Add onPress handlers to ProfileScreen shelf cards to navigate to Your Shelf with initialTab parameter
    status: completed
  - id: handle-route-params
    content: Add useEffect in YourShelfScreen to read route.params.initialTab and set activeTab accordingly
    status: completed
---

# Add Tabs to Your Shelf Screen

## Overview

Transform the Your Shelf screen to have three tabs for different book statuses, with proper filtering, sorting, and visual styling for the active tab.

## Changes Required

### 1. Update `YourShelfScreen.tsx`

**Add tab state and filtering:**

- Add state for active tab: `'read' | 'currently_reading' | 'want_to_read'` (default: `'read'`)
- Filter books by the selected status from the existing `books` array
- Update the title from "inkli" to "My Shelf" (matching the image design)

**Add tab navigation UI:**

- Create a tab bar below the header with three tabs: "Read", "Currently Reading", "Want to Read"
- Style active tab with bold text
- Style inactive tabs with normal weight
- Add a separator line below tabs

**Implement sorting logic:**

- **Read books**: Sort by `rank_score` descending (existing behavior)
- **Currently Reading books**: Sort alphabetically by `book.title`
- **Want to Read books**: Sort alphabetically by `book.title`
- Add a comment/note in code indicating that average score ranking will be implemented later for Currently Reading and Want to Read

**Update book rendering:**

- Only show score circles for Read books (they have rank_score)
- For Currently Reading and Want to Read, show books without score circles
- Maintain the same book item layout for all tabs

**Update empty states:**

- Show appropriate empty state messages for each tab
- "No ranked books yet" for Read tab
- "No books currently reading" for Currently Reading tab
- "No books in want to read" for Want to Read tab

## File Changes

### `src/screens/YourShelfScreen.tsx`

- Add `activeTab` state
- Add tab navigation component
- Filter books by `activeTab` status
- Implement conditional sorting (rank_score for read, alphabetical for others)
- Update title to "My Shelf"
- Add conditional rendering for score circles (only for read books)
- Update empty state messages per tab

## Implementation Details

**Tab Styling:**

- Active tab: `fontWeight: '700'` (bold)
- Inactive tabs: `fontWeight: '400'` (normal)
- Tab container: horizontal flex layout with equal spacing
- Separator: thin line below tabs

**Sorting:**

```typescript
// Read books: by rank_score descending
if (activeTab === 'read') {
  filteredBooks.sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0));
}
// Currently Reading and Want to Read: alphabetically
else {
  filteredBooks.sort((a, b) => {
    const titleA = a.book?.title || '';
    const titleB = b.book?.title || '';
    return titleA.localeCompare(titleB);
  });
}
```

**Note for future implementation:**

Add a comment in the sorting section:

```typescript
// TODO: For 'currently_reading' and 'want_to_read', rank by average score 
// across all Inkli users (to be implemented later)
```

## Visual Design

- Match the design from the provided image
- Tabs should be clearly separated and the active tab should be visually distinct
- Maintain existing book item styling
- Keep the same header layout with "My Shelf" title

## Additional Feature: Link ProfileScreen Shelf Cards to YourShelfScreen

### Overview

Make the three shelf cards on ProfileScreen (Read, Currently Reading, Want to Read) navigate to the Your Shelf screen with the corresponding tab selected.

### Changes Required

### 2. Update `ProfileScreen.tsx`

**Add navigation handlers to shelf cards:**

- Add `onPress` handlers to each of the three `renderShelfSection` calls (lines 454-456)
- Navigate to "Your Shelf" tab using React Navigation
- Pass a route parameter indicating which tab should be active: `{ initialTab: 'read' | 'currently_reading' | 'want_to_read' }`

**Implementation:**

```typescript
// In ProfileScreen.tsx, update the shelf cards section:
<View style={styles.shelfCardsContainer}>
  {renderShelfSection(
    '✓', 
    'Read', 
    bookCounts.read,
    () => navigation.navigate('Your Shelf', { initialTab: 'read' })
  )}
  {renderShelfSection(
    '🔖', 
    'Currently Reading', 
    bookCounts.currently_reading,
    () => navigation.navigate('Your Shelf', { initialTab: 'currently_reading' })
  )}
  {renderShelfSection(
    '🔖', 
    'Want to Read', 
    bookCounts.want_to_read,
    () => navigation.navigate('Your Shelf', { initialTab: 'want_to_read' })
  )}
</View>
```

### 3. Update `YourShelfScreen.tsx`

**Handle route params to set initial tab:**

- Read route params in `useEffect` or `useFocusEffect`
- If `route.params?.initialTab` exists, set `activeTab` to that value
- Clear the param after using it to avoid repeated tab switches on re-focus

**Implementation:**

```typescript
// Add useEffect to handle route params
React.useEffect(() => {
  const params = (route.params as any);
  if (params?.initialTab) {
    const validTab = ['read', 'currently_reading', 'want_to_read'].includes(params.initialTab)
      ? params.initialTab
      : 'read';
    setActiveTab(validTab);
    // Clear the param to avoid repeated switches
    (navigation as any).setParams({ initialTab: undefined });
  }
}, [route.params, navigation]);
```

## File Changes Summary

### `src/screens/ProfileScreen.tsx`

- Add `onPress` handlers to the three `renderShelfSection` calls
- Navigate to "Your Shelf" tab with `initialTab` parameter

### `src/screens/YourShelfScreen.tsx`

- Add `useEffect` to read `route.params.initialTab` and set `activeTab` accordingly
- Clear the param after use to prevent repeated tab switches