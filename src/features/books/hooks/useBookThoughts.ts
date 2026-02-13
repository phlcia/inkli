import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useErrorHandler } from '../../../contexts/ErrorHandlerContext';
import type { ReadSession } from '../../../services/books';
import {
  addBookToShelf,
  addReadSession,
  deleteReadSession,
  getUserBooks,
  updateReadSession,
  updateUserBookDetails,
} from '../../../services/books';

export function useBookThoughts(params: {
  user: { id: string } | null | undefined;
  book: { id: string; categories?: string[] | null };
  userBookId: string | null;
  setUserBookId: (id: string | null) => void;
  refreshBookStatusRef: MutableRefObject<() => void>;
}) {
  const { user, book, userBookId, setUserBookId, refreshBookStatusRef } = params;
  const { handleApiError, showClientError } = useErrorHandler();

  const [userNotes, setUserNotes] = useState<string>('');
  const [userCustomLabels, setUserCustomLabels] = useState<string[]>([]);
  const [readSessions, setReadSessions] = useState<ReadSession[]>([]);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [showDateRangePickerModal, setShowDateRangePickerModal] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const notesSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [showGenreLabelPicker, setShowGenreLabelPicker] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [customLabelSuggestions, setCustomLabelSuggestions] = useState<string[]>([]);
  const [userGenres, setUserGenres] = useState<string[]>([]);

  const effectiveGenres = userGenres;

  useEffect(() => {
    const loadCustomLabelSuggestions = async () => {
      if (!user?.id) return;
      try {
        const userBooks = await getUserBooks(user.id);
        const allLabels = new Set<string>();
        userBooks.forEach((userBook) => {
          if (userBook.custom_labels && userBook.custom_labels.length > 0) {
            userBook.custom_labels.forEach((label) => allLabels.add(label));
          }
        });
        setCustomLabelSuggestions(Array.from(allLabels).sort());
      } catch (error) {
        console.error('Error loading custom label suggestions:', error);
      }
    };
    loadCustomLabelSuggestions();
  }, [user?.id]);

  const hydrateThoughtsFromUserBook = useCallback((data: {
    notes?: string | null;
    custom_labels?: string[] | null;
    user_genres?: string[] | null;
  } | null) => {
    if (!data) return;
    setUserNotes(data.notes || '');
    setUserCustomLabels(data.custom_labels || []);
    setUserGenres(data.user_genres || []);
  }, []);

  const resetThoughts = useCallback(() => {
    setUserNotes('');
    setUserCustomLabels([]);
    setUserGenres([]);
    setReadSessions([]);
  }, []);

  const saveNotes = useCallback(
    async (notesText: string) => {
      if (!user || !userBookId) {
        return;
      }

      try {
        setSavingNotes(true);
        setNotesSaved(false);

        const { error } = await updateUserBookDetails(userBookId, user.id, {
          notes: notesText.trim() || null,
        });

        if (error) {
          handleApiError(error, 'save notes', () => saveNotes(notesText));
          setSavingNotes(false);
          return;
        }

        setSavingNotes(false);
        setNotesSaved(true);

        setTimeout(() => {
          setNotesSaved(false);
        }, 2000);

        refreshBookStatusRef.current?.();
      } catch (error) {
        handleApiError(error, 'save notes', () => saveNotes(notesText));
        setSavingNotes(false);
      }
    },
    [user, userBookId, refreshBookStatusRef, handleApiError]
  );

  const handleNotesChange = useCallback(
    (text: string) => {
      setUserNotes(text);
      setNotesSaved(false);

      if (notesSaveTimerRef.current) {
        clearTimeout(notesSaveTimerRef.current);
      }

      notesSaveTimerRef.current = setTimeout(() => {
        void saveNotes(text);
      }, 800);
    },
    [saveNotes]
  );

  const handleNotesBlur = useCallback(() => {
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
    }
    void saveNotes(userNotes);
  }, [userNotes, saveNotes]);

  const handleAddReadSession = useCallback(
    async (newStartDate: string | null, newEndDate: string | null) => {
      if (!user || !userBookId) {
        showClientError('Please add this book to your shelf first');
        return;
      }

      try {
        setSavingDates(true);

        const { data, error } = await addReadSession(userBookId, {
          started_date: newStartDate,
          finished_date: newEndDate,
        });

        if (error) {
          handleApiError(error, 'save dates', () =>
            handleAddReadSession(newStartDate, newEndDate)
          );
          setSavingDates(false);
          return;
        }

        if (data) {
          setReadSessions((prev) => [data, ...prev]);
        }
        setSavingDates(false);

        refreshBookStatusRef.current?.();
      } catch (error) {
        handleApiError(error, 'save dates', () =>
          handleAddReadSession(newStartDate, newEndDate)
        );
        setSavingDates(false);
      }
    },
    [user, userBookId, refreshBookStatusRef, handleApiError, showClientError]
  );

  const handleUpdateReadSession = useCallback(
    async (sessionId: string, newStartDate: string | null, newEndDate: string | null) => {
      if (!user) return;

      try {
        setSavingDates(true);

        const { data, error } = await updateReadSession(sessionId, {
          started_date: newStartDate,
          finished_date: newEndDate,
        });

        if (error) {
          handleApiError(error, 'update dates', () =>
            handleUpdateReadSession(sessionId, newStartDate, newEndDate)
          );
          setSavingDates(false);
          return;
        }

        if (data) {
          setReadSessions((prev) =>
            prev.map((session) => (session.id === sessionId ? data : session))
          );
        }
        setSavingDates(false);

        refreshBookStatusRef.current?.();
      } catch (error) {
        handleApiError(error, 'update dates', () =>
          handleUpdateReadSession(sessionId, newStartDate, newEndDate)
        );
        setSavingDates(false);
      }
    },
    [user, refreshBookStatusRef, handleApiError]
  );

  const handleDeleteReadSession = useCallback(
    async (sessionId: string) => {
      if (!user) return;

      try {
        setSavingDates(true);

        const { error } = await deleteReadSession(sessionId);

        if (error) {
          handleApiError(error, 'delete dates', () =>
            handleDeleteReadSession(sessionId)
          );
          setSavingDates(false);
          return;
        }

        setReadSessions((prev) => prev.filter((session) => session.id !== sessionId));
        setSavingDates(false);

        refreshBookStatusRef.current?.();
      } catch (error) {
        handleApiError(error, 'delete dates', () =>
          handleDeleteReadSession(sessionId)
        );
        setSavingDates(false);
      }
    },
    [user, refreshBookStatusRef, handleApiError]
  );

  const handleDateRangeSelected = useCallback(
    (newStartDate: string | null, newEndDate: string | null) => {
      if (editingSessionId) {
        void handleUpdateReadSession(editingSessionId, newStartDate, newEndDate);
      } else {
        void handleAddReadSession(newStartDate, newEndDate);
      }
      setShowDateRangePickerModal(false);
      setEditingSessionId(null);
    },
    [editingSessionId, handleAddReadSession, handleUpdateReadSession]
  );

  const openDateRangePicker = useCallback(() => {
    setEditingSessionId(null);
    setShowDateRangePickerModal(true);
  }, []);

  const openDateRangePickerForEdit = useCallback((sessionId: string) => {
    setEditingSessionId(sessionId);
    setShowDateRangePickerModal(true);
  }, []);

  const sortedSessions = useMemo(() => {
    return [...readSessions].sort((a, b) => {
      if (!a.finished_date && b.finished_date) return -1;
      if (a.finished_date && !b.finished_date) return 1;

      const dateA = a.finished_date || a.started_date || a.created_at;
      const dateB = b.finished_date || b.started_date || b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [readSessions]);

  useEffect(() => {
    return () => {
      if (notesSaveTimerRef.current) {
        clearTimeout(notesSaveTimerRef.current);
      }
    };
  }, []);

  const handleRemoveGenre = useCallback(
    async (genreToRemove: string) => {
      if (!user || !userBookId) return;

      const updatedGenres = userGenres.filter((g) => g !== genreToRemove);
      const previousUserGenres = userGenres;

      try {
        setSavingTags(true);
        setUserGenres(updatedGenres);

        const { error } = await updateUserBookDetails(userBookId, user.id, {
          user_genres: updatedGenres,
        });
        if (error) {
          setUserGenres(previousUserGenres);
          throw error;
        }

        setSavingTags(false);
      } catch (error) {
        handleApiError(error, 'remove genre');
        setSavingTags(false);
      }
    },
    [user, userBookId, userGenres, handleApiError]
  );

  const handleRemoveCustomLabel = useCallback(
    async (labelToRemove: string) => {
      if (!user || !userBookId) return;

      const updatedLabels = userCustomLabels.filter((l) => l !== labelToRemove);

      try {
        setSavingTags(true);
        setUserCustomLabels(updatedLabels);

        const { error } = await updateUserBookDetails(userBookId, user.id, {
          custom_labels: updatedLabels,
        });
        if (error) {
          setUserCustomLabels(userCustomLabels);
          throw error;
        }

        setSavingTags(false);
      } catch (error) {
        handleApiError(error, 'remove label');
        setSavingTags(false);
      }
    },
    [user, userBookId, userCustomLabels, handleApiError, showClientError]
  );

  const handleSaveTags = useCallback(
    async (genres: string[], customLabels: string[]) => {

      if (!user) {
        showClientError('Please log in to save tags');
        return;
      }

      const previousUserGenres = userGenres;
      const previousCustomLabels = userCustomLabels;

      try {
        setSavingTags(true);

        setUserGenres(genres);
        setUserCustomLabels(customLabels);

        let currentUserBookId = userBookId;

        if (!currentUserBookId) {
          const result = await addBookToShelf(book, null, user.id, {
            genres: genres,
            custom_labels: customLabels,
          });
          currentUserBookId = result.userBookId;
          setUserBookId(currentUserBookId);
        } else {
          const { error } = await updateUserBookDetails(currentUserBookId, user.id, {
            user_genres: genres,
            custom_labels: customLabels,
          });

          if (error) {
            setUserGenres(previousUserGenres);
            setUserCustomLabels(previousCustomLabels);
            throw error;
          }
        }

        await refreshBookStatusRef.current?.();
        setSavingTags(false);
      } catch (error) {
        setUserGenres(previousUserGenres);
        setUserCustomLabels(previousCustomLabels);
        handleApiError(error, 'save tags');
        setSavingTags(false);
      }
    },
    [user, userBookId, userGenres, userCustomLabels, refreshBookStatusRef, book, setUserBookId, handleApiError, showClientError]
  );

  return {
    userNotes,
    userCustomLabels,
    userGenres,
    readSessions,
    savingNotes,
    savingDates,
    notesSaved,
    showDateRangePickerModal,
    editingSessionId,
    showGenreLabelPicker,
    savingTags,
    customLabelSuggestions,
    effectiveGenres,
    sortedSessions,
    setReadSessions,
    hydrateThoughtsFromUserBook,
    resetThoughts,
    handleNotesChange,
    handleNotesBlur,
    openDateRangePicker,
    openDateRangePickerForEdit,
    handleDateRangeSelected,
    handleDeleteReadSession,
    handleRemoveGenre,
    handleRemoveCustomLabel,
    handleSaveTags,
    setShowDateRangePickerModal,
    setShowGenreLabelPicker,
    setEditingSessionId,
  };
}
