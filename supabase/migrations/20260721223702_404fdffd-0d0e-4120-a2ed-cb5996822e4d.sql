CREATE POLICY "ai_stream_events read own"
ON public.ai_stream_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ai_stream_events_user_created_idx
  ON public.ai_stream_events (user_id, created_at DESC);