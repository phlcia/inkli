import React from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateRangePickerModal from '../../../components/ui/DateRangePickerModal';
import GenreLabelPicker from '../../../components/books/GenreLabelPicker';
import { formatDateForDisplay } from '../../../utils/dateRanges';
import type { ReadSession } from '../../../services/books';
import { colors } from '../../../config/theme';

export type BookThoughtsSectionProps = {
  user: { id: string } | null | undefined;
  book: { id: string; categories?: string[] | null };
  userBookId: string | null;
  resolvedBookId: string | null;
  effectiveGenres: string[];
  userCustomLabels: string[];
  sortedSessions: ReadSession[];
  readSessions: ReadSession[];
  savingTags: boolean;
  savingDates: boolean;
  savingNotes: boolean;
  notesSaved: boolean;
  customLabelSuggestions: string[];
  showDateRangePickerModal: boolean;
  showGenreLabelPicker: boolean;
  editingSessionId: string | null;
  userNotes: string;
  styles: Record<string, object>;
  onShowGenreLabelPicker: () => void;
  onHideGenreLabelPicker: () => void;
  onShowDateRangePicker: () => void;
  onHideDateRangePicker: () => void;
  onDateRangeSelected: (start: string | null, end: string | null) => void;
  onOpenDateRangePickerForEdit: (sessionId: string) => void;
  onDeleteReadSession: (sessionId: string) => void;
  onNotesChange: (text: string) => void;
  onNotesBlur: () => void;
  onRemoveGenre: (genre: string) => void;
  onRemoveCustomLabel: (label: string) => void;
  onSaveTags: (genres: string[], labels: string[]) => void;
  onClearEditingSession: () => void;
};

export default function BookThoughtsSection({
  user,
  book,
  userBookId,
  resolvedBookId,
  effectiveGenres,
  userCustomLabels,
  sortedSessions,
  readSessions,
  savingTags,
  savingDates,
  savingNotes,
  notesSaved,
  customLabelSuggestions,
  showDateRangePickerModal,
  showGenreLabelPicker,
  editingSessionId,
  userNotes,
  styles,
  onShowGenreLabelPicker,
  onHideGenreLabelPicker,
  onShowDateRangePicker,
  onHideDateRangePicker,
  onDateRangeSelected,
  onOpenDateRangePickerForEdit,
  onDeleteReadSession,
  onNotesChange,
  onNotesBlur,
  onRemoveGenre,
  onRemoveCustomLabel,
  onSaveTags,
  onClearEditingSession,
}: BookThoughtsSectionProps) {
  if (!user) return null;

  const hasShelves = (effectiveGenres && effectiveGenres.length > 0) || userCustomLabels.length > 0;

  return (
    <>
      <View style={styles.descriptionSection}>
        <Text style={styles.descriptionLabel}>What you think</Text>

        <View style={styles.whatYouThinkSlot}>
          <Text style={styles.whatYouThinkSlotLabel}>Shelves</Text>

          {hasShelves && (
            <View style={styles.shelfChipsContainer}>
              {effectiveGenres &&
                effectiveGenres.map((genre: string) => (
                  <View key={`genre-${genre}`} style={styles.shelfChip}>
                    <Text style={styles.shelfChipText}>{genre}</Text>
                    {userBookId && (
                      <TouchableOpacity
                        onPress={() => onRemoveGenre(genre)}
                        style={styles.shelfChipClose}
                        disabled={savingTags}
                      >
                        <Text style={styles.shelfChipCloseText}>×</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              {userCustomLabels.map((label: string) => (
                <View key={`label-${label}`} style={styles.shelfChip}>
                  <Text style={styles.shelfChipText}>{label}</Text>
                  {userBookId && (
                    <TouchableOpacity
                      onPress={() => onRemoveCustomLabel(label)}
                      style={styles.shelfChipClose}
                      disabled={savingTags}
                    >
                      <Text style={styles.shelfChipCloseText}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.dateRangeButton, hasShelves && styles.dateRangeButtonActive]}
            onPress={onShowGenreLabelPicker}
            disabled={savingTags}
          >
            <Text
              style={[styles.dateRangeButtonText, hasShelves && styles.dateRangeButtonTextActive]}
            >
              {hasShelves ? 'Edit shelves' : 'Add shelves'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.whatYouThinkSlot}>
          <Text style={styles.whatYouThinkSlotLabel}>Read dates</Text>

          {sortedSessions.length > 0 ? (
            <View style={styles.dateChipsContainer}>
              {sortedSessions.map((session) => (
                <View key={session.id} style={styles.dateChip}>
                  <TouchableOpacity
                    onPress={() => onOpenDateRangePickerForEdit(session.id)}
                    style={styles.dateChipContent}
                  >
                    <Text style={styles.dateChipText}>
                      {session.started_date ? formatDateForDisplay(session.started_date) : '...'} -{' '}
                      {session.finished_date ? formatDateForDisplay(session.finished_date) : '...'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onDeleteReadSession(session.id)}
                    style={styles.dateChipClose}
                    disabled={savingDates}
                  >
                    <Text style={styles.dateChipCloseText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.whatYouThinkSlotPlaceholder}>
              Add when you started/finished reading
            </Text>
          )}

          <TouchableOpacity
            style={[styles.dateRangeButton, readSessions.length > 0 && styles.dateRangeButtonActive]}
            onPress={onShowDateRangePicker}
            disabled={savingDates}
          >
            <Text
              style={[styles.dateRangeButtonText, readSessions.length > 0 && styles.dateRangeButtonTextActive]}
            >
              Add read dates
            </Text>
          </TouchableOpacity>
          {savingDates && (
            <View style={styles.savingContainer}>
              <ActivityIndicator size="small" color={colors.primaryBlue} />
              <Text style={styles.savingText}>Saving...</Text>
            </View>
          )}
        </View>

        <View style={styles.whatYouThinkSlot}>
          <View style={styles.notesHeader}>
            <Text style={styles.whatYouThinkSlotLabel}>Notes</Text>
          </View>
          <View style={styles.notesContainer}>
            <TextInput
              style={styles.notesInput}
              placeholder="Tap to add your thoughts about this book..."
              placeholderTextColor={colors.brownText}
              multiline
              value={userNotes}
              onChangeText={onNotesChange}
              onBlur={onNotesBlur}
              editable={!savingNotes}
            />
            <View style={styles.notesFooter}>
              {savingNotes && <Text style={styles.savingText}>Saving...</Text>}
              {notesSaved && !savingNotes && <Text style={styles.savedText}>Saved ✓</Text>}
            </View>
          </View>
        </View>
      </View>

      <DateRangePickerModal
        visible={showDateRangePickerModal}
        onClose={() => {
          onHideDateRangePicker();
          onClearEditingSession();
        }}
        onDateRangeSelected={onDateRangeSelected}
        initialStartDate={
          editingSessionId
            ? readSessions.find((s) => s.id === editingSessionId)?.started_date || null
            : null
        }
        initialEndDate={
          editingSessionId
            ? readSessions.find((s) => s.id === editingSessionId)?.finished_date || null
            : null
        }
        title={editingSessionId ? 'Edit Read Dates' : 'Select Read Dates'}
      />

      <GenreLabelPicker
        visible={showGenreLabelPicker}
        onClose={onHideGenreLabelPicker}
        onSave={onSaveTags}
        apiCategories={book.categories}
        initialGenres={effectiveGenres}
        initialCustomLabels={userCustomLabels}
        customLabelSuggestions={customLabelSuggestions}
        bookId={resolvedBookId || book.id}
        loading={savingTags}
        autoSelectSuggestions={false}
      />
    </>
  );
}
