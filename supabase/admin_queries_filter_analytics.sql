-- Admin Dashboard Queries for Filter Analytics
-- Use these queries to analyze filter usage patterns

-- 1. Most frequently filtered genres
SELECT 
  unnest(selected_genres) as genre,
  COUNT(*) as usage_count
FROM filter_events
WHERE event_type = 'filter_applied'
GROUP BY genre
ORDER BY usage_count DESC;

-- 2. Most common genre combinations
SELECT 
  selected_genres,
  COUNT(*) as combination_count
FROM filter_events
WHERE event_type = 'filter_applied'
  AND array_length(selected_genres, 1) > 1
GROUP BY selected_genres
ORDER BY combination_count DESC;

-- 3. Filter usage by shelf
SELECT 
  shelf_context,
  COUNT(*) as filter_count,
  AVG(result_count) as avg_results
FROM filter_events
WHERE event_type = 'filter_applied'
GROUP BY shelf_context;

-- 4. Most popular custom labels across users
SELECT 
  unnest(selected_custom_labels) as custom_label,
  COUNT(DISTINCT user_id) as user_count,
  COUNT(*) as usage_count
FROM filter_events
WHERE event_type = 'filter_applied'
  AND array_length(selected_custom_labels, 1) > 0
GROUP BY custom_label
ORDER BY usage_count DESC;

-- 5. Filter usage frequency
SELECT 
  COUNT(*) FILTER (WHERE event_type = 'filter_applied') as filters_applied,
  COUNT(*) FILTER (WHERE event_type = 'filter_cleared') as filters_cleared,
  COUNT(DISTINCT user_id) as unique_users
FROM filter_events;

-- 6. Unmapped Genres Analysis (Lookup Table Expansion)
-- Find most common unmapped API categories to add to lookup table
SELECT 
  api_category, 
  COUNT(*) as occurrence_count
FROM unmapped_genres_log
GROUP BY api_category
ORDER BY occurrence_count DESC
LIMIT 50;
