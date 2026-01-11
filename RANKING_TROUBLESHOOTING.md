# Leaderboard Ranking Troubleshooting Guide

If your leaderboard is empty or users don't have ranks, follow these steps:

## Quick Diagnosis

1. **Check if migration has been run:**
   - Go to Supabase Dashboard → SQL Editor
   - Run the diagnostic script: `supabase/check_and_fix_ranking.sql`
   - This will show you what's missing

2. **Common Issues:**

   ### Issue 1: Migration Not Run
   - **Symptom:** No `books_read_count` or `global_rank` columns in `user_profiles` table
   - **Fix:** Run `supabase/migrate_user_ranking.sql` in Supabase SQL Editor

   ### Issue 2: Migration Run But Ranks Not Calculated
   - **Symptom:** Users have `books_read_count > 0` but `global_rank` is `null`
   - **Fix:** Run `supabase/fix_ranking_now.sql` in Supabase SQL Editor
   - This calls `recalculate_all_ranks()` to backfill all existing users

   ### Issue 3: Trigger Not Working
   - **Symptom:** New books added but ranks don't update automatically
   - **Fix:** Re-run the trigger creation part of `migrate_user_ranking.sql`

## Step-by-Step Fix

### Step 1: Run the Migration (if not done)
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the entire contents of `supabase/migrate_user_ranking.sql`
4. Click "Run"

### Step 2: Recalculate Existing Ranks
1. In SQL Editor, run:
   ```sql
   SELECT recalculate_all_ranks();
   ```
   Or use the script: `supabase/fix_ranking_now.sql`

### Step 3: Verify It Worked
1. Check your leaderboard tab - it should now show users
2. Check your profile - you should see your rank
3. In SQL Editor, run:
   ```sql
   SELECT username, books_read_count, global_rank 
   FROM user_profiles 
   WHERE books_read_count > 0 
   ORDER BY global_rank ASC 
   LIMIT 10;
   ```

## How It Works

The ranking system uses database triggers that automatically:
1. Update `books_read_count` when a book's status changes to 'read'
2. Recalculate `global_rank` for affected users
3. Use `DENSE_RANK()` to handle ties (users with same count get same rank)

Ranks are calculated as:
- Higher `books_read_count` = better rank (lower number)
- Ties are broken by `created_at` (earlier users rank higher)

## Manual Recalculation

If you need to manually recalculate ranks at any time:
```sql
SELECT recalculate_all_ranks();
```

This is safe to run multiple times and will update all users' ranks based on their current `books_read_count`.




