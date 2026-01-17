-- Allow specific updates to bypass updated_at and activity_cards emissions.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.skip_updated_at', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION emit_activity_card_from_user_books()
RETURNS TRIGGER AS $$
DECLARE
  book_title TEXT;
  book_cover TEXT;
  action_text TEXT;
BEGIN
  IF current_setting('app.skip_activity_cards', true) = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT title, cover_url
    INTO book_title, book_cover
    FROM books
   WHERE id = NEW.book_id;

  IF (TG_OP = 'INSERT') THEN
    -- Skip immediate activity for "read" until ranking is set.
    IF NEW.status = 'read' THEN
      RETURN NEW;
    END IF;

    action_text := 'added "' || book_title || '"';
    INSERT INTO activity_cards (user_id, user_book_id, content, image_url, created_at)
    VALUES (NEW.user_id, NEW.id, action_text, book_cover, NEW.created_at);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Always emit a "finished" card when rank_score is set for read.
    IF NEW.rank_score IS DISTINCT FROM OLD.rank_score AND NEW.rank_score IS NOT NULL AND NEW.status = 'read' THEN
      action_text := 'finished "' || book_title || '"';
      INSERT INTO activity_cards (user_id, user_book_id, content, image_url, created_at)
      VALUES (NEW.user_id, NEW.id, action_text, book_cover, NEW.updated_at);
      RETURN NEW;
    END IF;

    -- Skip activity when backing out of an unranked "read" transition.
    IF OLD.status = 'read' AND OLD.rank_score IS NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;

    IF (NEW.status IS DISTINCT FROM OLD.status) THEN
      action_text := 'updated "' || book_title || '" status';
    ELSIF (NEW.rating IS DISTINCT FROM OLD.rating) THEN
      action_text := 'rated "' || book_title || '"';
    ELSIF (NEW.notes IS DISTINCT FROM OLD.notes) THEN
      action_text := 'added notes on "' || book_title || '"';
    ELSE
      RETURN NEW;
    END IF;

    INSERT INTO activity_cards (user_id, user_book_id, content, image_url, created_at)
    VALUES (NEW.user_id, NEW.id, action_text, book_cover, NEW.updated_at);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_user_book_status_no_touch(
  p_user_book_id UUID,
  p_status TEXT,
  p_clear_rank_score BOOLEAN DEFAULT false
)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.skip_updated_at', 'true', true);
  PERFORM set_config('app.skip_activity_cards', 'true', true);

  UPDATE user_books
     SET status = p_status,
         rank_score = CASE WHEN p_clear_rank_score THEN NULL ELSE rank_score END
   WHERE id = p_user_book_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_user_book_details_no_touch(
  p_user_book_id UUID,
  p_set_rating BOOLEAN,
  p_rating TEXT,
  p_set_notes BOOLEAN,
  p_notes TEXT
)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.skip_updated_at', 'true', true);
  PERFORM set_config('app.skip_activity_cards', 'true', true);

  -- Note: started_date and finished_date are deprecated - use read_sessions table instead
  -- This function only updates rating and notes to avoid touching updated_at
  UPDATE user_books
     SET rating = CASE WHEN p_set_rating THEN p_rating ELSE rating END,
         notes = CASE WHEN p_set_notes THEN p_notes ELSE notes END
   WHERE id = p_user_book_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_user_book_rank_scores_no_touch(
  p_user_id UUID,
  p_updates JSONB
)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.skip_updated_at', 'true', true);
  PERFORM set_config('app.skip_activity_cards', 'true', true);

  UPDATE user_books ub
     SET rank_score = upd.score
    FROM jsonb_to_recordset(p_updates) AS upd(id UUID, score NUMERIC)
   WHERE ub.id = upd.id
     AND ub.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
