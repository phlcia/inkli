# Recalculate Ranks Edge Function

This Supabase Edge Function recalculates all user ranks in the system. It's useful for:
- Periodic maintenance (run daily via cron)
- Data integrity checks
- Recovering from any data inconsistencies

## Deployment

1. Install Supabase CLI: `npm install -g supabase`
2. Login: `supabase login`
3. Link your project: `supabase link --project-ref your-project-ref`
4. Deploy: `supabase functions deploy recalculate-ranks`

## Usage

### Manual Invocation

Call via HTTP:
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/recalculate-ranks \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Scheduled Execution (Cron)

In Supabase Dashboard, go to Database > Cron Jobs and add:

```sql
SELECT cron.schedule(
  'daily-rank-recalc',
  '0 3 * * *',  -- Run at 3am daily
  $$SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/recalculate-ranks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    )
  )$$
);
```

Or simply call the RPC function directly:
```sql
SELECT cron.schedule(
  'daily-rank-recalc',
  '0 3 * * *',
  $$SELECT recalculate_all_ranks()$$
);
```

## Environment Variables

The function requires these environment variables (set automatically by Supabase):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (bypasses RLS)


