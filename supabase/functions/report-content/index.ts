// Supabase Edge Function: Report content (user, comment, user_book)
// Rate-limited; self-report blocked; upsert into content_reports; auto-escalation after insert.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TARGET_TYPES = ['user', 'comment', 'user_book'] as const;
const REASONS = [
  'spam', 'harassment', 'hate_speech', 'inappropriate_content',
  'misinformation', 'underage_user', 'other',
] as const;

type TargetType = (typeof TARGET_TYPES)[number];
type Reason = (typeof REASONS)[number];

const RATE_LIMIT_PER_HOUR = 20;
const ESCALATION_USER_COUNT = 3;
const ESCALATION_COMMENT_COUNT = 2;
const ESCALATION_USER_BOOK_COUNT = 2;

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAnon.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as {
      target_type?: string;
      target_id?: string;
      reason?: string;
      details?: string;
    };

    const target_type = body?.target_type;
    const target_id = body?.target_id;
    const reason = body?.reason;
    const details = typeof body?.details === 'string' ? body.details : undefined;

    if (
      !target_type ||
      !TARGET_TYPES.includes(target_type as TargetType) ||
      !target_id ||
      typeof target_id !== 'string'
    ) {
      return jsonResponse({ error: 'Invalid target_type or target_id' }, 400);
    }
    if (!reason || !REASONS.includes(reason as Reason)) {
      return jsonResponse({ error: 'Invalid reason' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Rate limit: max 20 reports per hour per reporter
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: rateCount, error: rateError } = await supabaseAdmin
      .from('content_reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_id', user.id)
      .gte('created_at', oneHourAgo);

    if (rateError) {
      console.error('Rate limit check error:', rateError);
      return jsonResponse({ error: 'Unable to process report' }, 500);
    }
    if ((rateCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return jsonResponse(
        { error: 'Too many reports. Please try again later.' },
        429
      );
    }

    // Resolve owner_id and current report count in one batched query where needed
    let owner_id: string | null = null;
    let report_count_before = 0;

    if (target_type === 'user') {
      owner_id = target_id;
      const { count } = await supabaseAdmin
        .from('content_reports')
        .select('id', { count: 'exact', head: true })
        .eq('target_type', target_type)
        .eq('target_id', target_id);
      report_count_before = count ?? 0;
    } else if (target_type === 'comment') {
      const { data: row } = await supabaseAdmin
        .from('activity_comments')
        .select('user_id')
        .eq('id', target_id)
        .maybeSingle();
      if (row?.user_id) {
        owner_id = row.user_id;
        const { count } = await supabaseAdmin
          .from('content_reports')
          .select('id', { count: 'exact', head: true })
          .eq('target_type', 'comment')
          .eq('target_id', target_id);
        report_count_before = count ?? 0;
      }
    } else if (target_type === 'user_book') {
      const { data: row } = await supabaseAdmin
        .from('user_books')
        .select('user_id')
        .eq('id', target_id)
        .maybeSingle();
      if (row?.user_id) {
        owner_id = row.user_id;
        const { count } = await supabaseAdmin
          .from('content_reports')
          .select('id', { count: 'exact', head: true })
          .eq('target_type', 'user_book')
          .eq('target_id', target_id);
        report_count_before = count ?? 0;
      }
    }

    if (target_type !== 'user' && !owner_id) {
      return jsonResponse({ error: 'Target not found' }, 404);
    }

    // Self-report check
    if (owner_id && owner_id === user.id) {
      return jsonResponse({ error: 'You cannot report your own content' }, 400);
    }

    // Insert (as authenticated user so RLS allows)
    const { error: insertError } = await supabaseAnon.from('content_reports').insert({
      reporter_id: user.id,
      target_type,
      target_id,
      reason,
      details: details || null,
      status: 'pending',
    });

    if (insertError) {
      if (insertError.code === '23505') {
        return jsonResponse({ success: true, already_reported: true }, 200);
      }
      console.error('Insert report error:', insertError);
      return jsonResponse(
        { error: insertError.message ?? 'Failed to submit report' },
        500
      );
    }

    // Auto-escalation: count after insert = report_count_before + 1
    const new_count = report_count_before + 1;

    if (target_type === 'user' && new_count >= ESCALATION_USER_COUNT) {
      await supabaseAdmin
        .from('user_profiles')
        .update({
          flagged_at: new Date().toISOString(),
          moderation_status: 'flagged',
        })
        .eq('user_id', target_id);
    } else if (target_type === 'comment' && new_count >= ESCALATION_COMMENT_COUNT) {
      await supabaseAdmin
        .from('activity_comments')
        .update({ hidden_at: new Date().toISOString() })
        .eq('id', target_id);
    } else if (target_type === 'user_book' && new_count >= ESCALATION_USER_BOOK_COUNT) {
      await supabaseAdmin
        .from('user_books')
        .update({ hidden_at: new Date().toISOString() })
        .eq('id', target_id);
    }

    return jsonResponse({ success: true, already_reported: false }, 200);
  } catch (error) {
    console.error('Report content error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});
