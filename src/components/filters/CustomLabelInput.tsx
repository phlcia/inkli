import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Keyboard,
} from 'react-native';
import { colors, typography } from '../../config/theme';

interface CustomLabelInputProps {
  selectedLabels: string[];
  onLabelsChange: (labels: string[]) => void;
  suggestions: string[]; // Current user's existing labels for auto-complete
}

export default function CustomLabelInput({
  selectedLabels,
  onLabelsChange,
  suggestions,
}: CustomLabelInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);

  // Filter suggestions based on input and exclude already selected labels
  useEffect(() => {
    if (inputValue.trim().length > 0) {
      const filtered = suggestions
        .filter(
          (suggestion) =>
            suggestion.toLowerCase().includes(inputValue.toLowerCase()) &&
            !selectedLabels.includes(suggestion)
        )
        .slice(0, 5); // Limit to 5 suggestions
      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
    }
  }, [inputValue, suggestions, selectedLabels]);

  const handleAddLabel = (label?: string) => {
    const labelToAdd = (label || inputValue.trim()).toLowerCase();
    
    if (labelToAdd && !selectedLabels.includes(labelToAdd)) {
      onLabelsChange([...selectedLabels, labelToAdd]);
      setInputValue('');
      setShowSuggestions(false);
      Keyboard.dismiss();
    }
  };

  const handleRemoveLabel = (label: string) => {
    onLabelsChange(selectedLabels.filter((l) => l !== label));
  };

  const handleSelectSuggestion = (suggestion: string) => {
    handleAddLabel(suggestion);
  };

  return (
    <View style={styles.container}>
      {/* Selected labels as chips */}
      {selectedLabels.length > 0 && (
        <View style={styles.selectedLabelsContainer}>
          {selectedLabels.map((label) => (
            <View key={label} style={styles.labelChip}>
              <Text style={styles.labelChipText}>{label}</Text>
              <TouchableOpacity
                onPress={() => handleRemoveLabel(label)}
                style={styles.removeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Input field */}
      <TextInput
        style={styles.input}
        placeholder="Add custom label..."
        placeholderTextColor={colors.brownText + '80'}
        value={inputValue}
        onChangeText={setInputValue}
        onSubmitEditing={() => handleAddLabel()}
        returnKeyType="done"
        onFocus={() => {
          if (inputValue.trim().length > 0) {
            setShowSuggestions(true);
          }
        }}
        onBlur={() => {
          // Delay hiding suggestions to allow suggestion tap
          setTimeout(() => setShowSuggestions(false), 200);
        }}
      />

      {/* Suggestions dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={filteredSuggestions}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionItem}
                onPress={() => handleSelectSuggestion(item)}
              >
                <Text style={styles.suggestionText}>{item}</Text>
              </TouchableOpacity>
            )}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  selectedLabelsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryBlue,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  labelChipText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.white,
    fontWeight: '500',
    marginRight: 4,
  },
  removeButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 14,
    color: colors.white,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  input: {
    height: 44,
    paddingHorizontal: 12,
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.brownText,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brownText + '20',
  },
  suggestionsContainer: {
    marginTop: 4,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brownText + '20',
    maxHeight: 200,
    shadowColor: colors.brownText,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.brownText + '10',
  },
  suggestionText: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brownText,
  },
});
