-- Migration: Seed 30 starter books with data
-- Run this in Supabase SQL Editor (bypasses RLS)
-- This inserts books and links them to genres/themes

-- Note: Books require either open_library_id, google_books_id, or isbn_13
-- We'll use placeholder Open Library IDs that can be updated later with real data

-- Insert books (using placeholder Open Library IDs and Google Books IDs)
-- Note: Both open_library_id and google_books_id are NOT NULL in the schema
INSERT INTO books (open_library_id, google_books_id, title, authors, is_starter_book, starter_set_id) VALUES
  ('/works/OL1W', 'STARTER_OL1W', 'The Song of Achilles', ARRAY['Madeline Miller'], true, 1),
  ('/works/OL2W', 'STARTER_OL2W', 'Normal People', ARRAY['Sally Rooney'], true, 1),
  ('/works/OL3W', 'STARTER_OL3W', 'Daisy Jones & The Six', ARRAY['Taylor Jenkins Reid'], true, 1),
  ('/works/OL4W', 'STARTER_OL4W', 'The Silent Patient', ARRAY['Alex Michaelides'], true, 1),
  ('/works/OL5W', 'STARTER_OL5W', 'Verity', ARRAY['Colleen Hoover'], true, 1),
  ('/works/OL6W', 'STARTER_OL6W', 'The Woman in the Window', ARRAY['A.J. Finn'], true, 1),
  ('/works/OL7W', 'STARTER_OL7W', 'The Guest List', ARRAY['Lucy Foley'], true, 1),
  ('/works/OL8W', 'STARTER_OL8W', 'A Court of Thorns and Roses', ARRAY['Sarah J. Maas'], true, 1),
  ('/works/OL9W', 'STARTER_OL9W', 'The Invisible Life of Addie LaRue', ARRAY['V.E. Schwab'], true, 1),
  ('/works/OL10W', 'STARTER_OL10W', 'House of Earth and Blood', ARRAY['Sarah J. Maas'], true, 1),
  ('/works/OL11W', 'STARTER_OL11W', 'Fourth Wing', ARRAY['Rebecca Yarros'], true, 1),
  ('/works/OL12W', 'STARTER_OL12W', 'Project Hail Mary', ARRAY['Andy Weir'], true, 1),
  ('/works/OL13W', 'STARTER_OL13W', 'The Midnight Library', ARRAY['Matt Haig'], true, 1),
  ('/works/OL14W', 'STARTER_OL14W', 'Dark Matter', ARRAY['Blake Crouch'], true, 1),
  ('/works/OL15W', 'STARTER_OL15W', 'Beach Read', ARRAY['Emily Henry'], true, 1),
  ('/works/OL16W', 'STARTER_OL16W', 'People We Meet on Vacation', ARRAY['Emily Henry'], true, 1),
  ('/works/OL17W', 'STARTER_OL17W', 'The Love Hypothesis', ARRAY['Ali Hazelwood'], true, 1),
  ('/works/OL18W', 'STARTER_OL18W', 'Red White & Royal Blue', ARRAY['Casey McQuiston'], true, 1),
  ('/works/OL19W', 'STARTER_OL19W', 'The Nightingale', ARRAY['Kristin Hannah'], true, 1),
  ('/works/OL20W', 'STARTER_OL20W', 'All the Light We Cannot See', ARRAY['Anthony Doerr'], true, 1),
  ('/works/OL21W', 'STARTER_OL21W', 'The Southern Book Club''s Guide to Slaying Vampires', ARRAY['Grady Hendrix'], true, 1),
  ('/works/OL22W', 'STARTER_OL22W', 'Mexican Gothic', ARRAY['Silvia Moreno-Garcia'], true, 1),
  ('/works/OL23W', 'STARTER_OL23W', 'Educated', ARRAY['Tara Westover'], true, 1),
  ('/works/OL24W', 'STARTER_OL24W', 'Atomic Habits', ARRAY['James Clear'], true, 1),
  ('/works/OL25W', 'STARTER_OL25W', 'The Body Keeps the Score', ARRAY['Bessel van der Kolk'], true, 1),
  ('/works/OL26W', 'STARTER_OL26W', 'Six of Crows', ARRAY['Leigh Bardugo'], true, 1),
  ('/works/OL27W', 'STARTER_OL27W', 'The Cruel Prince', ARRAY['Holly Black'], true, 1),
  ('/works/OL28W', 'STARTER_OL28W', 'They Both Die at the End', ARRAY['Adam Silvera'], true, 1),
  ('/works/OL29W', 'STARTER_OL29W', 'Pride and Prejudice', ARRAY['Jane Austen'], true, 1)
ON CONFLICT (open_library_id) DO UPDATE
SET 
  is_starter_book = true,
  starter_set_id = 1
WHERE books.open_library_id = EXCLUDED.open_library_id;

-- Link genres to books
INSERT INTO book_genres (book_id, genre_id)
SELECT b.id, g.id
FROM books b, genres g
WHERE b.is_starter_book = true AND b.starter_set_id = 1
AND (
  (b.title = 'The Song of Achilles' AND g.name IN ('Literary Fiction', 'Fantasy', 'Romance')) OR
  (b.title = 'Normal People' AND g.name IN ('Literary Fiction', 'Contemporary')) OR
  (b.title = 'Daisy Jones & The Six' AND g.name IN ('Literary Fiction', 'Historical Fiction')) OR
  (b.title = 'The Silent Patient' AND g.name IN ('Thriller', 'Mystery')) OR
  (b.title = 'Verity' AND g.name IN ('Thriller', 'Romance')) OR
  (b.title = 'The Woman in the Window' AND g.name IN ('Thriller', 'Mystery')) OR
  (b.title = 'The Guest List' AND g.name IN ('Thriller', 'Mystery')) OR
  (b.title = 'A Court of Thorns and Roses' AND g.name IN ('Fantasy', 'Romance', 'Young Adult')) OR
  (b.title = 'The Invisible Life of Addie LaRue' AND g.name IN ('Fantasy', 'Literary Fiction')) OR
  (b.title = 'House of Earth and Blood' AND g.name IN ('Fantasy', 'Romance')) OR
  (b.title = 'Fourth Wing' AND g.name IN ('Fantasy', 'Romance', 'Young Adult')) OR
  (b.title = 'Project Hail Mary' AND g.name = 'Science Fiction') OR
  (b.title = 'The Midnight Library' AND g.name IN ('Science Fiction', 'Literary Fiction')) OR
  (b.title = 'Dark Matter' AND g.name IN ('Science Fiction', 'Thriller')) OR
  (b.title = 'Beach Read' AND g.name IN ('Romance', 'Contemporary')) OR
  (b.title = 'People We Meet on Vacation' AND g.name IN ('Romance', 'Contemporary')) OR
  (b.title = 'The Love Hypothesis' AND g.name IN ('Romance', 'Contemporary')) OR
  (b.title = 'Red White & Royal Blue' AND g.name IN ('Romance', 'Contemporary')) OR
  (b.title = 'The Nightingale' AND g.name IN ('Historical Fiction', 'Literary Fiction')) OR
  (b.title = 'All the Light We Cannot See' AND g.name IN ('Historical Fiction', 'Literary Fiction')) OR
  (b.title = 'The Southern Book Club''s Guide to Slaying Vampires' AND g.name IN ('Horror', 'Contemporary')) OR
  (b.title = 'Mexican Gothic' AND g.name IN ('Horror', 'Historical Fiction')) OR
  (b.title = 'Educated' AND g.name IN ('Non-Fiction', 'Memoir')) OR
  (b.title = 'Atomic Habits' AND g.name IN ('Non-Fiction', 'Self-Help')) OR
  (b.title = 'The Body Keeps the Score' AND g.name IN ('Non-Fiction', 'Self-Help')) OR
  (b.title = 'Six of Crows' AND g.name IN ('Fantasy', 'Young Adult')) OR
  (b.title = 'The Cruel Prince' AND g.name IN ('Fantasy', 'Young Adult')) OR
  (b.title = 'They Both Die at the End' AND g.name IN ('Young Adult', 'Contemporary')) OR
  (b.title = 'Pride and Prejudice' AND g.name IN ('Classics', 'Romance', 'Historical Fiction'))
)
ON CONFLICT (book_id, genre_id) DO NOTHING;

-- Link themes to books
INSERT INTO book_themes (book_id, theme_id)
SELECT b.id, t.id
FROM books b, themes t
WHERE b.is_starter_book = true AND b.starter_set_id = 1
AND (
  (b.title = 'The Song of Achilles' AND t.name IN ('character-driven', 'slow-burn', 'epic')) OR
  (b.title = 'Normal People' AND t.name IN ('character-driven', 'coming-of-age')) OR
  (b.title = 'Daisy Jones & The Six' AND t.name IN ('character-driven', 'standalone')) OR
  (b.title = 'The Silent Patient' AND t.name IN ('psychological', 'plot-twist', 'fast-paced')) OR
  (b.title = 'Verity' AND t.name IN ('dark', 'psychological', 'plot-twist')) OR
  (b.title = 'The Woman in the Window' AND t.name IN ('psychological', 'plot-twist')) OR
  (b.title = 'The Guest List' AND t.name IN ('fast-paced', 'plot-twist')) OR
  (b.title = 'A Court of Thorns and Roses' AND t.name IN ('enemies-to-lovers', 'magic-system', 'series')) OR
  (b.title = 'The Invisible Life of Addie LaRue' AND t.name IN ('character-driven', 'epic', 'standalone')) OR
  (b.title = 'House of Earth and Blood' AND t.name IN ('magic-system', 'series', 'epic')) OR
  (b.title = 'Fourth Wing' AND t.name IN ('enemies-to-lovers', 'magic-system', 'series')) OR
  (b.title = 'Project Hail Mary' AND t.name IN ('fast-paced', 'standalone', 'plot-twist')) OR
  (b.title = 'The Midnight Library' AND t.name IN ('character-driven', 'standalone', 'heartwarming')) OR
  (b.title = 'Dark Matter' AND t.name IN ('fast-paced', 'plot-twist', 'standalone')) OR
  (b.title = 'Beach Read' AND t.name IN ('slow-burn', 'heartwarming', 'standalone')) OR
  (b.title = 'People We Meet on Vacation' AND t.name IN ('slow-burn', 'heartwarming', 'standalone')) OR
  (b.title = 'The Love Hypothesis' AND t.name IN ('slow-burn', 'heartwarming', 'standalone')) OR
  (b.title = 'Red White & Royal Blue' AND t.name IN ('slow-burn', 'heartwarming', 'standalone')) OR
  (b.title = 'The Nightingale' AND t.name IN ('character-driven', 'epic', 'standalone')) OR
  (b.title = 'All the Light We Cannot See' AND t.name IN ('character-driven', 'epic', 'standalone')) OR
  (b.title = 'The Southern Book Club''s Guide to Slaying Vampires' AND t.name IN ('dark', 'standalone')) OR
  (b.title = 'Mexican Gothic' AND t.name IN ('dark', 'psychological', 'standalone')) OR
  (b.title = 'Educated' AND t.name IN ('character-driven', 'standalone')) OR
  (b.title = 'Atomic Habits' AND t.name = 'standalone') OR
  (b.title = 'The Body Keeps the Score' AND t.name = 'standalone') OR
  (b.title = 'Six of Crows' AND t.name IN ('magic-system', 'series', 'fast-paced')) OR
  (b.title = 'The Cruel Prince' AND t.name IN ('enemies-to-lovers', 'magic-system', 'series')) OR
  (b.title = 'They Both Die at the End' AND t.name IN ('coming-of-age', 'standalone', 'heartwarming')) OR
  (b.title = 'Pride and Prejudice' AND t.name IN ('slow-burn', 'standalone', 'character-driven'))
)
ON CONFLICT (book_id, theme_id) DO NOTHING;
