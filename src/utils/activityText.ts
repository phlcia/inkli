export type ActivityActionInput = {
  status?: string | null;
  displayName?: string | null;
  activityContent?: string | null;
  isSelf?: boolean;
  hasProgressUpdate?: boolean;
  progressPercent?: number | null;
};

export const getActionText = ({
  status,
  displayName,
  activityContent,
  isSelf = false,
  hasProgressUpdate = false,
  progressPercent,
}: ActivityActionInput): string => {
  const label = isSelf ? 'You' : displayName || 'User';
  const normalized = activityContent?.trim().toLowerCase() || '';
  const isProgressActivity =
    (normalized.startsWith('is ') && normalized.includes('% through')) ||
    normalized.startsWith('finished reading');

  if (activityContent && isProgressActivity) {
    if (isSelf) {
      if (normalized.startsWith('finished reading')) return 'You finished reading';
      if (normalized.startsWith('is ')) return `You are ${activityContent.slice(3)}`;
      return `You ${activityContent}`;
    }
    return `${label} ${activityContent}`;
  }

  if (status === 'currently_reading' && hasProgressUpdate) {
    const progress = progressPercent ?? 0;
    return isSelf ? `You are ${progress}% through` : `${label} is ${progress}% through`;
  }

  switch (status) {
    case 'read':
      return `${label} finished`;
    case 'currently_reading':
      return `${label} started reading`;
    case 'want_to_read':
      return `${label} bookmarked`;
    default:
      return `${label} added`;
  }
};
