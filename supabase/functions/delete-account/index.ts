// Supabase Edge Function: Delete user account permanently
// Requires password (email users) or confirmation "DELETE" (OAuth users)
// Deletes profile-photos first, then auth user (CASCADE cleans related data)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const userId = user.id;
    const email = user.email ?? '';
    const hasOAuthIdentity =
      user.identities?.some(
        (i: { provider?: string }) =>
          i.provider === 'google' || i.provider === 'apple'
      ) ?? false;
    const providerFromMeta = (user.app_metadata?.provider as string) ?? '';
    const isOAuthUser =
      hasOAuthIdentity ||
      providerFromMeta === 'google' ||
      providerFromMeta === 'apple';

    const body = (await req.json().catch(() => ({}))) as { password?: string; confirmation?: string };
    const password = (body?.password ?? '').toString().trim();
    const confirmation = (body?.confirmation ?? '').toString().trim();

    if (isOAuthUser) {
      if (confirmation.toUpperCase() !== 'DELETE') {
        return jsonResponse(
          { error: 'Please type DELETE to confirm account deletion' },
          400
        );
      }
    } else {
      if (!password) {
        return jsonResponse({ error: 'Password is required' }, 400);
      }
      const emailToVerify =
        email || (await getEmailFromPrivateData(supabaseUrl, serviceKey, userId));
      if (!emailToVerify) {
        return jsonResponse({ error: 'Unable to verify password' }, 400);
      }
      const { error: signInError } = await supabaseAnon.auth.signInWithPassword({
        email: emailToVerify,
        password,
      });
      if (signInError) {
        return jsonResponse({ error: 'Invalid password' }, 401);
      }
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: files } = await supabaseAdmin.storage
      .from('profile-photos')
      .list(userId, { limit: 1000 });

    if (files && files.length > 0) {
      const paths = files
        .filter((f) => f.name)
        .map((f) => `${userId}/${f.name}`);
      if (paths.length > 0) {
        await supabaseAdmin.storage.from('profile-photos').remove(paths);
      }
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('Delete user error:', deleteError);
      return jsonResponse(
        { error: deleteError.message ?? 'Failed to delete account' },
        500
      );
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error('Delete account error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

async function getEmailFromPrivateData(
  supabaseUrl: string,
  serviceKey: string,
  userId: string
): Promise<string> {
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data } = await supabase
    .from('user_private_data')
    .select('email')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.email as string) ?? '';
}
