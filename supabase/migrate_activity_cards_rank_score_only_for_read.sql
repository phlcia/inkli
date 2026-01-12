-- Emit activity cards for "read" only when rank_score changes.
-- Other statuses keep existing behavior.

CREATE OR REPLACE FUNCTION emit_activity_card_from_user_books()
RETURNS TRIGGER AS $$
DECLARE
  book_title TEXT;
  book_cover TEXT;
  action_text TEXT;
BEGIN
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

DROP TRIGGER IF EXISTS user_books_activity_trigger ON user_books;
CREATE TRIGGER user_books_activity_trigger
AFTER INSERT OR UPDATE ON user_books
FOR EACH ROW EXECUTE FUNCTION emit_activity_card_from_user_books();
