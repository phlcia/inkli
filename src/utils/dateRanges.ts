type DateDisplayOptions = {
  month?: 'short' | 'long';
};

export const formatDateForDisplay = (
  dateString: string,
  options?: DateDisplayOptions
): string => {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString('en-US', {
    month: options?.month ?? 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export const formatDateRange = (
  startDate: string | null,
  endDate: string | null
): string | null => {
  if (!startDate && !endDate) return null;
  if (startDate && endDate) {
    return `${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}`;
  }
  if (startDate) {
    return formatDateForDisplay(startDate);
  }
  if (endDate) {
    return formatDateForDisplay(endDate);
  }
  return null;
};
