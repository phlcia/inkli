import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { colors, typography } from '../../config/theme';

interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onDateSelected: (date: string | null) => void;
  initialDate?: string | null;
  title?: string;
}

export default function DatePickerModal({
  visible,
  onClose,
  onDateSelected,
  initialDate,
  title = 'Select Date',
}: DatePickerModalProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Initialize with initial date if provided
  useEffect(() => {
    if (visible) {
      // Convert initial date to local date string (YYYY-MM-DD) to avoid timezone issues
      if (initialDate) {
        const date = new Date(initialDate + 'T00:00:00'); // Add time to avoid timezone shift
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const localDateString = `${year}-${month}-${day}`;
        setSelectedDate(localDateString);
      } else {
        setSelectedDate(null);
      }
    } else {
      // Reset when modal closes
      setSelectedDate(null);
    }
  }, [visible, initialDate]);

  const handleDayPress = (day: DateData) => {
    // day.dateString is already in YYYY-MM-DD format (local timezone)
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Don't allow selecting dates after today
    if (day.dateString > todayString) {
      return;
    }
    
    setSelectedDate(day.dateString);
  };

  const handleDone = () => {
    onDateSelected(selectedDate);
    onClose();
  };

  const handleClear = () => {
    setSelectedDate(null);
    onDateSelected(null);
    onClose();
  };

  // Build markedDates for calendar
  const getMarkedDates = () => {
    const marked: any = {};
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Mark selected date
    if (selectedDate) {
      marked[selectedDate] = {
        selected: true,
        selectedColor: colors.primaryBlue,
        selectedTextColor: colors.white,
      };
    }

    return marked;
  };
  
  // Get max date (today) for calendar
  const getMaxDate = (): string => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Calendar - Outside ScrollView for proper rendering */}
          <View style={styles.calendarContainer}>
            <Calendar
              onDayPress={handleDayPress}
              markedDates={getMarkedDates()}
              maxDate={getMaxDate()}
              enableSwipeMonths={true}
              theme={{
                backgroundColor: colors.creamBackground,
                calendarBackground: colors.white,
                textSectionTitleColor: colors.brownText,
                selectedDayBackgroundColor: colors.primaryBlue,
                selectedDayTextColor: colors.white,
                todayTextColor: colors.primaryBlue,
                dayTextColor: colors.brownText,
                textDisabledColor: `${colors.brownText}40`,
                dotColor: colors.primaryBlue,
                selectedDotColor: colors.white,
                arrowColor: colors.primaryBlue,
                monthTextColor: colors.brownText,
                indicatorColor: colors.primaryBlue,
                textDayFontFamily: typography.body,
                textMonthFontFamily: typography.sectionHeader,
                textDayHeaderFontFamily: typography.body,
                textDayFontSize: 16,
                textMonthFontSize: 18,
                textDayHeaderFontSize: 14,
              }}
              style={styles.calendar}
            />
          </View>

          {/* Selected Date Display */}
          {selectedDate && (
            <View style={styles.selectedDateContainer}>
              <Text style={styles.selectedDateText}>
                Selected: {formatDateForDisplay(selectedDate)}
              </Text>
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const formatDateForDisplay = (dateString: string): string => {
  // dateString is already in YYYY-MM-DD format (local timezone)
  const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone shift
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.creamBackground,
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: typography.sectionHeader,
    color: colors.brownText,
    fontWeight: '600',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.brownText,
    lineHeight: 24,
  },
  calendarContainer: {
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.white,
    minHeight: 350,
  },
  calendar: {
    borderRadius: 12,
  },
  selectedDateContainer: {
    backgroundColor: `${colors.primaryBlue}20`,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  selectedDateText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
    fontWeight: '500',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  clearButton: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primaryBlue,
  },
  clearButtonText: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.primaryBlue,
    fontWeight: '600',
  },
  doneButton: {
    flex: 1,
    backgroundColor: colors.primaryBlue,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontFamily: typography.button,
    color: colors.white,
    fontWeight: '600',
  },
});
