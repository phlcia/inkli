/**
 * Script to seed 30 starter books for onboarding quiz
 * 
 * Usage:
 *   npx ts-node scripts/seed_starter_books.ts
 * 
 * Or compile and run:
 *   tsc scripts/seed_starter_books.ts
 *   node scripts/seed_starter_books.js
 * 
 * Requires:
 *   - SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and EXPO_PUBLIC_SUPABASE_ANON_KEY
 *   - Or update the script with your credentials
 */

import { createClient } from '@supabase/supabase-js';

// Starter books data with genres and themes
const starterBooks = [
  // Literary
  { title: 'The Song of Achilles', author: 'Madeline Miller', genres: ['Literary Fiction', 'Fantasy', 'Romance'], themes: ['character-driven', 'slow-burn', 'epic'] },
  { title: 'Normal People', author: 'Sally Rooney', genres: ['Literary Fiction', 'Contemporary'], themes: ['character-driven', 'coming-of-age'] },
  { title: 'Daisy Jones & The Six', author: 'Taylor Jenkins Reid', genres: ['Literary Fiction', 'Historical Fiction'], themes: ['character-driven', 'standalone'] },
  
  // Thriller
  { title: 'The Silent Patient', author: 'Alex Michaelides', genres: ['Thriller', 'Mystery'], themes: ['psychological', 'plot-twist', 'fast-paced'] },
  { title: 'Verity', author: 'Colleen Hoover', genres: ['Thriller', 'Romance'], themes: ['dark', 'psychological', 'plot-twist'] },
  { title: 'The Woman in the Window', author: 'A.J. Finn', genres: ['Thriller', 'Mystery'], themes: ['psychological', 'plot-twist'] },
  { title: 'The Guest List', author: 'Lucy Foley', genres: ['Thriller', 'Mystery'], themes: ['fast-paced', 'plot-twist'] },
  
  // Fantasy
  { title: 'A Court of Thorns and Roses', author: 'Sarah J. Maas', genres: ['Fantasy', 'Romance', 'Young Adult'], themes: ['enemies-to-lovers', 'magic-system', 'series'] },
  { title: 'The Invisible Life of Addie LaRue', author: 'V.E. Schwab', genres: ['Fantasy', 'Literary Fiction'], themes: ['character-driven', 'epic', 'standalone'] },
  { title: 'House of Earth and Blood', author: 'Sarah J. Maas', genres: ['Fantasy', 'Romance'], themes: ['magic-system', 'series', 'epic'] },
  { title: 'Fourth Wing', author: 'Rebecca Yarros', genres: ['Fantasy', 'Romance', 'Young Adult'], themes: ['enemies-to-lovers', 'magic-system', 'series'] },
  
  // Sci-Fi
  { title: 'Project Hail Mary', author: 'Andy Weir', genres: ['Science Fiction'], themes: ['fast-paced', 'standalone', 'plot-twist'] },
  { title: 'The Midnight Library', author: 'Matt Haig', genres: ['Science Fiction', 'Literary Fiction'], themes: ['character-driven', 'standalone', 'heartwarming'] },
  { title: 'Dark Matter', author: 'Blake Crouch', genres: ['Science Fiction', 'Thriller'], themes: ['fast-paced', 'plot-twist', 'standalone'] },
  
  // Romance
  { title: 'Beach Read', author: 'Emily Henry', genres: ['Romance', 'Contemporary'], themes: ['slow-burn', 'heartwarming', 'standalone'] },
  { title: 'People We Meet on Vacation', author: 'Emily Henry', genres: ['Romance', 'Contemporary'], themes: ['slow-burn', 'heartwarming', 'standalone'] },
  { title: 'The Love Hypothesis', author: 'Ali Hazelwood', genres: ['Romance', 'Contemporary'], themes: ['slow-burn', 'heartwarming', 'standalone'] },
  { title: 'Red White & Royal Blue', author: 'Casey McQuiston', genres: ['Romance', 'Contemporary'], themes: ['slow-burn', 'heartwarming', 'standalone'] },
  
  // Historical
  { title: 'The Nightingale', author: 'Kristin Hannah', genres: ['Historical Fiction', 'Literary Fiction'], themes: ['character-driven', 'epic', 'standalone'] },
  { title: 'All the Light We Cannot See', author: 'Anthony Doerr', genres: ['Historical Fiction', 'Literary Fiction'], themes: ['character-driven', 'epic', 'standalone'] },
  
  // Horror
  { title: 'The Southern Book Club\'s Guide to Slaying Vampires', author: 'Grady Hendrix', genres: ['Horror', 'Contemporary'], themes: ['dark', 'standalone'] },
  { title: 'Mexican Gothic', author: 'Silvia Moreno-Garcia', genres: ['Horror', 'Historical Fiction'], themes: ['dark', 'psychological', 'standalone'] },
  
  // Non-Fiction
  { title: 'Educated', author: 'Tara Westover', genres: ['Non-Fiction', 'Memoir'], themes: ['character-driven', 'standalone'] },
  { title: 'Atomic Habits', author: 'James Clear', genres: ['Non-Fiction', 'Self-Help'], themes: ['standalone'] },
  { title: 'The Body Keeps the Score', author: 'Bessel van der Kolk', genres: ['Non-Fiction', 'Self-Help'], themes: ['standalone'] },
  
  // YA
  { title: 'Six of Crows', author: 'Leigh Bardugo', genres: ['Fantasy', 'Young Adult'], themes: ['magic-system', 'series', 'fast-paced'] },
  { title: 'The Cruel Prince', author: 'Holly Black', genres: ['Fantasy', 'Young Adult'], themes: ['enemies-to-lovers', 'magic-system', 'series'] },
  { title: 'They Both Die at the End', author: 'Adam Silvera', genres: ['Young Adult', 'Contemporary'], themes: ['coming-of-age', 'standalone', 'heartwarming'] },
  
  // Classics
  { title: 'Pride and Prejudice', author: 'Jane Austen', genres: ['Classics', 'Romance', 'Historical Fiction'], themes: ['slow-burn', 'standalone', 'character-driven'] },
];

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: Missing SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables');
  console.error('Set them in your .env file or export them:');
  console.error('  export SUPABASE_URL="your-url"');
  console.error('  export EXPO_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seedStarterBooks() {
  console.log('Starting to seed 30 starter books...\n');

  // Ensure genres/themes exist so recommendations can score books
  const uniqueGenres = Array.from(new Set(starterBooks.flatMap((book) => book.genres))).sort();
  const uniqueThemes = Array.from(new Set(starterBooks.flatMap((book) => book.themes))).sort();

  const { error: seedGenresError } = await supabase
    .from('genres')
    .upsert(uniqueGenres.map((name) => ({ name })), { onConflict: 'name' });

  if (seedGenresError) {
    console.error('✗ Error seeding genres:', seedGenresError.message);
  }

  const { error: seedThemesError } = await supabase
    .from('themes')
    .upsert(uniqueThemes.map((name) => ({ name })), { onConflict: 'name' });

  if (seedThemesError) {
    console.error('✗ Error seeding themes:', seedThemesError.message);
  }

  const { data: genresData } = await supabase
    .from('genres')
    .select('id, name')
    .in('name', uniqueGenres);

  const { data: themesData } = await supabase
    .from('themes')
    .select('id, name')
    .in('name', uniqueThemes);

  const genreIdByName = new Map<string, string>();
  (genresData || []).forEach((genre) => {
    genreIdByName.set(genre.name, genre.id);
  });

  const themeIdByName = new Map<string, string>();
  (themesData || []).forEach((theme) => {
    themeIdByName.set(theme.name, theme.id);
  });

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const bookData of starterBooks) {
    try {
      // Check if book already exists by title and author
      const { data: existingBook } = await supabase
        .from('books')
        .select('id, title, authors')
        .eq('title', bookData.title)
        .contains('authors', [bookData.author])
        .maybeSingle();

      let bookId: string;

      if (existingBook) {
        console.log(`✓ Book already exists: "${bookData.title}" by ${bookData.author}`);
        bookId = existingBook.id;
        skipCount++;
      } else {
        // Insert book with placeholder Open Library ID
        // Format: /works/OL{random}W
        const placeholderId = `/works/OL${Math.random().toString(36).substring(2, 11)}W`;
        
        const { data: newBook, error: insertError } = await supabase
          .from('books')
          .insert({
            open_library_id: placeholderId,
            title: bookData.title,
            authors: [bookData.author],
            is_starter_book: true,
            starter_set_id: 1,
            // Optional: Add cover URL later via Open Library API
          })
          .select('id')
          .single();

        if (insertError) {
          // If insert fails due to RLS, use an Edge Function or adjust policies
          console.error(`✗ Error inserting "${bookData.title}":`, insertError.message);
          errorCount++;
          continue;
        }

        bookId = newBook.id;
        console.log(`✓ Inserted: "${bookData.title}" by ${bookData.author}`);
        successCount++;
      }

      // Link genres
      for (const genreName of bookData.genres) {
        const genreId = genreIdByName.get(genreName);
        if (genreId) {
          await supabase
            .from('book_genres')
            .upsert(
              { book_id: bookId, genre_id: genreId },
              { onConflict: 'book_id,genre_id' }
            );
        } else {
          console.warn(`⚠️ Missing genre "${genreName}" for "${bookData.title}"`);
        }
      }

      // Link themes
      for (const themeName of bookData.themes) {
        const themeId = themeIdByName.get(themeName);
        if (themeId) {
          await supabase
            .from('book_themes')
            .upsert(
              { book_id: bookId, theme_id: themeId },
              { onConflict: 'book_id,theme_id' }
            );
        } else {
          console.warn(`⚠️ Missing theme "${themeName}" for "${bookData.title}"`);
        }
      }

    } catch (error) {
      console.error(`✗ Error processing "${bookData.title}":`, error);
      errorCount++;
    }
  }

  console.log('\n=== Seeding Summary ===');
  console.log(`✓ Successfully inserted: ${successCount}`);
  console.log(`⊘ Already existed (skipped): ${skipCount}`);
  console.log(`✗ Errors: ${errorCount}`);
  console.log(`Total processed: ${starterBooks.length}`);
}

// Run the seeding
seedStarterBooks()
  .then(() => {
    console.log('\nSeeding complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
