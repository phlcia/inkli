import { supabase } from '../config/supabase';
import type { Book, UserBook } from './books';

export type BookWithUserStatus = {
  book: Book;
  userBook: UserBook | null;
};

export const fetchBookWithUserStatus = async (
  bookId: string,
  userId?: string | null
): Promise<BookWithUserStatus> => {
  const { data: book, error } = await supabase
    .from('books')
    .select('*')
    .eq('id', bookId)
    .single();

  if (error) throw error;

  let userBook: UserBook | null = null;
  if (userId) {
    const { data: userBookData } = await supabase
      .from('user_books')
      .select('*')
      .eq('user_id', userId)
      .eq('book_id', book.id)
      .single();
    userBook = userBookData || null;
  }

  return { book, userBook };
};
