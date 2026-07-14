CREATE POLICY "Users can update their own insurance verifications"
ON public.insurance_verifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);