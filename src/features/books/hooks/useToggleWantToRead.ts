import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { addBookToShelf, removeBookFromShelf } from '../../../services/books';
import type { UserBook } from '../../../services/books';

type ViewerShelfMap = Record<string, { id: string; status: UserBook['status'] }>;

type UseToggleWantToReadParams = {
  currentUserId?: string | null;
  viewerShelfMap: ViewerShelfMap;
  setViewerShelfMap: Dispatch<SetStateAction<ViewerShelfMap>>;
};

export function useToggleWantToRead({
  currentUserId,
  viewerShelfMap,
  setViewerShelfMap,
}: UseToggleWantToReadParams) {
  return useCallback(
    async (userBook: UserBook) => {
      if (!currentUserId || !userBook.book || !userBook.book_id) return;
      const existing = viewerShelfMap[userBook.book_id];
      if (existing?.status === 'want_to_read') {
        await removeBookFromShelf(existing.id);
        setViewerShelfMap((prev) => {
          const next = { ...prev };
          delete next[userBook.book_id];
          return next;
        });
        return;
      }
      if (!existing) {
        const result = await addBookToShelf(userBook.book, 'want_to_read', currentUserId);
        setViewerShelfMap((prev) => ({
          ...prev,
          [userBook.book_id]: { id: result.userBookId, status: 'want_to_read' },
        }));
      }
    },
    [currentUserId, viewerShelfMap, setViewerShelfMap]
  );
}
