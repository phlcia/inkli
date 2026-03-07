import { supabase } from '../config/supabase';

export type ReportTargetType = 'user' | 'comment' | 'user_book';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'inappropriate_content'
  | 'misinformation'
  | 'underage_user'
  | 'other';

export interface ReportContentParams {
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  details?: string;
}

export interface ReportContentResult {
  already_reported: boolean;
  error?: unknown;
}

export async function reportContent(
  params: ReportContentParams
): Promise<ReportContentResult> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      success?: boolean;
      already_reported?: boolean;
      error?: string;
    }>('report-content', {
      method: 'POST',
      body: {
        target_type: params.target_type,
        target_id: params.target_id,
        reason: params.reason,
        details: params.details ?? undefined,
      },
    });

    if (error) {
      const message = error.message ?? 'Failed to submit report';
      const alreadyReported =
        message.toLowerCase().includes('already') ||
        (data?.already_reported === true);
      return { already_reported: alreadyReported, error };
    }

    if (data?.success && data?.already_reported === true) {
      return { already_reported: true };
    }
    if (data?.success) {
      return { already_reported: false };
    }

    const errMsg = data?.error ?? 'Failed to submit report';
    return { already_reported: false, error: new Error(errMsg) };
  } catch (err) {
    console.error('reportContent error:', err);
    return { already_reported: false, error: err };
  }
}

export function isCommentHidden(comment: { hidden_at?: string | null }): boolean {
  return comment.hidden_at != null;
}

export function isUserSuspended(profile: {
  moderation_status?: string | null;
}): boolean {
  const status = profile.moderation_status;
  return status === 'suspended' || status === 'banned';
}
