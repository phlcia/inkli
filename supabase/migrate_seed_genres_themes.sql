-- Migration: Seed genres and themes for recommendation engine
-- Run this after migrate_add_recommendation_schema.sql

-- Seed genres
INSERT INTO genres (name) VALUES
  ('Literary Fiction'),
  ('Thriller'),
  ('Mystery'),
  ('Fantasy'),
  ('Science Fiction'),
  ('Romance'),
  ('Historical Fiction'),
  ('Horror'),
  ('Non-Fiction'),
  ('Memoir'),
  ('Self-Help'),
  ('Young Adult'),
  ('Contemporary'),
  ('Classics')
ON CONFLICT (name) DO NOTHING;

-- Seed themes
INSERT INTO themes (name) VALUES
  ('slow-burn'),
  ('enemies-to-lovers'),
  ('dystopian'),
  ('coming-of-age'),
  ('character-driven'),
  ('fast-paced'),
  ('dark'),
  ('heartwarming'),
  ('psychological'),
  ('epic'),
  ('standalone'),
  ('series'),
  ('magic-system'),
  ('plot-twist')
ON CONFLICT (name) DO NOTHING;
