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
import { formatDateForDisplay } from '../../utils/dateRanges';

interface DateRangePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onDateRangeSelected: (startDate: string | null, endDate: string | null) => void;
  initialStartDate?: string | null;
  initialEndDate?: string | null;
  title?: string;
}

export default function DateRangePickerModal({
  visible,
  onClose,
  onDateRangeSelected,
  initialStartDate,
  initialEndDate,
  title = 'Select Date Range',
}: DateRangePickerModalProps) {
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  // Initialize with initial dates if provided
  useEffect(() => {
    if (visible) {
      // Convert initial dates to local date strings (YYYY-MM-DD)
      if (initialStartDate) {
        const date = new Date(initialStartDate + 'T00:00:00');
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        setStartDate(`${year}-${month}-${day}`);
      } else {
        setStartDate(null);
      }

      if (initialEndDate) {
        const date = new Date(initialEndDate + 'T00:00:00');
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        setEndDate(`${year}-${month}-${day}`);
      } else {
        setEndDate(null);
      }
    } else {
      // Reset when modal closes
      setStartDate(null);
      setEndDate(null);
    }
  }, [visible, initialStartDate, initialEndDate]);

  const handleDayPress = (day: DateData) => {
    // day.dateString is already in YYYY-MM-DD format (local timezone)
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Don't allow selecting dates after today
    if (day.dateString > todayString) {
      return;
    }

    // If no start date selected, or if clicking before start date, set as start
    // If start date exists and clicking after start date, set as end
    if (!startDate || day.dateString < startDate) {
      setStartDate(day.dateString);
      setEndDate(null); // Reset end date when changing start
    } else if (startDate && !endDate) {
      // Setting end date
      if (day.dateString >= startDate) {
        setEndDate(day.dateString);
      }
    } else {
      // Both dates exist - reset and start over
      setStartDate(day.dateString);
      setEndDate(null);
    }
  };

  const handleDone = () => {
    onDateRangeSelected(startDate, endDate);
    onClose();
  };

  const handleClear = () => {
    setStartDate(null);
    setEndDate(null);
    onDateRangeSelected(null, null);
    onClose();
  };

  type MarkedDate = {
    startingDay?: boolean;
    endingDay?: boolean;
    color: string;
    textColor: string;
  };

  // Build markedDates for calendar with period marking
  const getMarkedDates = () => {
    const marked: Record<string, MarkedDate> = {};
    
    if (startDate) {
      marked[startDate] = {
        startingDay: true,
        color: colors.primaryBlue,
        textColor: colors.white,
      };

      if (endDate) {
        // Mark all dates between start and end
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');
        const current = new Date(start);
        
        while (current <= end) {
          const dateString = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          
          if (dateString === startDate) {
            marked[dateString] = {
              startingDay: true,
              color: colors.primaryBlue,
              textColor: colors.white,
            };
          } else if (dateString === endDate) {
            marked[dateString] = {
              endingDay: true,
              color: colors.primaryBlue,
              textColor: colors.white,
            };
          } else {
            marked[dateString] = {
              color: colors.primaryBlue + '40',
              textColor: colors.brownText,
            };
          }
          
          current.setDate(current.getDate() + 1);
        }
      } else {
        // Only start date selected
        marked[startDate] = {
          startingDay: true,
          color: colors.primaryBlue,
          textColor: colors.white,
        };
      }
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

          {/* Calendar */}
          <View style={styles.calendarContainer}>
            <Calendar
              onDayPress={handleDayPress}
              markedDates={getMarkedDates()}
              markingType="period"
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

          {/* Selected Date Range Display */}
          {(startDate || endDate) && (
            <View style={styles.selectedDateContainer}>
              <Text style={styles.selectedDateText}>
                {startDate ? formatDateForDisplay(startDate, { month: 'short' }) : '...'} - {endDate ? formatDateForDisplay(endDate, { month: 'short' }) : '...'}
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
