
-- 1) Turn on mutating actions for the assistant
UPDATE public.ai_feature_flags
   SET enabled = true, updated_at = now()
 WHERE key = 'ai.assistant.mutations.enabled';

-- 2) Allow authenticated users to insert their own AI tool invocations
--    (the invocation is scoped to a conversation owned by the same user).
DROP POLICY IF EXISTS "own tools insert" ON public.ai_tool_invocations;
CREATE POLICY "own tools insert"
  ON public.ai_tool_invocations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor = auth.uid()
    AND (
      conversation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ai_conversations c
         WHERE c.id = ai_tool_invocations.conversation_id
           AND c.user_id = auth.uid()
      )
    )
  );

GRANT INSERT ON public.ai_tool_invocations TO authenticated;

-- 3) Allow authenticated users to write their own security audit entries.
--    Keeps read scoping unchanged (users read own; admins read all).
DROP POLICY IF EXISTS "own audit insert" ON public.security_audit_log;
CREATE POLICY "own audit insert"
  ON public.security_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (actor = auth.uid());

GRANT INSERT ON public.security_audit_log TO authenticated;

-- 4) Let patients reschedule their own upcoming appointment.
--    Existing "users cancel own appointments" only permits status → cancelled.
--    This adds a symmetric policy allowing date/time changes while keeping
--    the appointment owned by the same phone number and active.
DROP POLICY IF EXISTS "users reschedule own appointments" ON public.appointments;
CREATE POLICY "users reschedule own appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    _appointment_belongs_to_me(patient_phone)
    AND status IN ('new'::appointment_status, 'confirmed'::appointment_status)
    AND appointment_date >= CURRENT_DATE
  )
  WITH CHECK (
    _appointment_belongs_to_me(patient_phone)
    AND status IN ('new'::appointment_status, 'confirmed'::appointment_status)
    AND appointment_date >= CURRENT_DATE
  );
