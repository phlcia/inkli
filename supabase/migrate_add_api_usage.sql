-- Migration: Add api_usage table for logging Grok (and future) API token/cost usage.
-- Inserted from Edge Functions only (service role). Query in Table Editor or SQL for cost per day/trigger/user.

CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  trigger TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_trigger ON api_usage(trigger);

-- RLS: no policies for anon/authenticated → only service_role (Edge Functions) can insert/select.
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
