/**
 * Diagnostic script to check if the ranking system is properly set up
 * Run this with: npx ts-node scripts/check_ranking_setup.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkRankingSetup() {
  console.log('🔍 Checking ranking system setup...\n');

  // Check 1: Verify user_profiles table has required columns
  console.log('1. Checking user_profiles table columns...');
  try {
    const { data: columns, error } = await supabase.rpc('exec_sql', {
      query: `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'user_profiles' 
        AND column_name IN ('books_read_count', 'global_rank', 'member_since', 'profile_photo_url')
        ORDER BY column_name;
      `
    });
    
    if (error) {
      // Try alternative method - direct query
      const { data: testData, error: testError } = await supabase
        .from('user_profiles')
        .select('books_read_count, global_rank, member_since, profile_photo_url')
        .limit(1);
      
      if (testError) {
        console.error('   ❌ Error checking columns:', testError.message);
        console.log('   ⚠️  Cannot verify columns - may need to run migration');
      } else {
        console.log('   ✅ Required columns exist in user_profiles');
      }
    } else {
      const requiredColumns = ['books_read_count', 'global_rank', 'member_since', 'profile_photo_url'];
      const foundColumns = columns?.map((c: any) => c.column_name) || [];
      const missing = requiredColumns.filter(col => !foundColumns.includes(col));
      
      if (missing.length > 0) {
        console.log(`   ❌ Missing columns: ${missing.join(', ')}`);
        console.log('   ⚠️  Run migrate_user_ranking.sql migration');
      } else {
        console.log('   ✅ All required columns exist');
      }
    }
  } catch (error: any) {
    console.log('   ⚠️  Could not verify columns (this is okay if migration not run yet)');
  }

  // Check 2: Check if trigger exists (via testing)
  console.log('\n2. Checking if ranking trigger is active...');
  try {
    // Get a test user with books
    const { data: testUser, error: userError } = await supabase
      .from('user_profiles')
      .select('user_id, books_read_count, global_rank')
      .limit(1)
      .single();
    
    if (userError || !testUser) {
      console.log('   ⚠️  No users found to test trigger');
    } else {
      // Count actual read books for this user
      const { count: actualCount, error: countError } = await supabase
        .from('user_books')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', testUser.user_id)
        .eq('status', 'read');
      
      if (countError) {
        console.log('   ⚠️  Could not verify trigger (error counting books)');
      } else {
        const countMatches = testUser.books_read_count === actualCount;
        if (countMatches) {
          console.log(`   ✅ books_read_count matches actual count (${actualCount})`);
        } else {
          console.log(`   ❌ books_read_count mismatch!`);
          console.log(`      Stored: ${testUser.books_read_count}, Actual: ${actualCount}`);
          console.log('   ⚠️  Trigger may not be working - run recalculate_all_ranks()');
        }
      }
    }
  } catch (error: any) {
    console.log('   ⚠️  Could not verify trigger');
  }

  // Check 3: Check current user stats
  console.log('\n3. Checking current user statistics...');
  try {
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('user_id, username, books_read_count, global_rank')
      .order('books_read_count', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('   ❌ Error fetching users:', error.message);
    } else if (!users || users.length === 0) {
      console.log('   ⚠️  No users found');
    } else {
      console.log(`   Found ${users.length} users:`);
      users.forEach((user, idx) => {
        const rankStr = user.global_rank ? `#${user.global_rank}` : 'No rank';
        console.log(`      ${idx + 1}. ${user.username || user.user_id.substring(0, 8)}: ${user.books_read_count} books, ${rankStr}`);
      });
      
      const usersWithRank = users.filter(u => u.global_rank !== null).length;
      const usersWithBooks = users.filter(u => (u.books_read_count || 0) > 0).length;
      
      console.log(`\n   Summary:`);
      console.log(`      Users with books: ${usersWithBooks}`);
      console.log(`      Users with rank: ${usersWithRank}`);
      
      if (usersWithBooks > 0 && usersWithRank === 0) {
        console.log('   ❌ Users have books but no ranks - ranking system not working!');
        console.log('   ⚠️  Run: SELECT recalculate_all_ranks(); in Supabase SQL Editor');
      } else if (usersWithRank > 0) {
        console.log('   ✅ Ranking system appears to be working');
      }
    }
  } catch (error: any) {
    console.error('   ❌ Error:', error.message);
  }

  // Check 4: Verify functions exist (if we can)
  console.log('\n4. Recommendations:');
  console.log('   If columns are missing, run migrate_user_ranking.sql in Supabase SQL Editor');
  console.log('   If counts don\'t match, run: SELECT recalculate_all_ranks();');
  console.log('   If ranks are null, run: SELECT recalculate_all_ranks();');
  
  console.log('\n✅ Diagnostic complete!\n');
}

checkRankingSetup().catch(console.error);

