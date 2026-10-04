-- Prevents two "in_progress" weighing_sessions from ever existing for the
-- same device at once. Closes a real race (two people tapping "Begin
-- Weighing" on the same device around the same time) and backstops the
-- power-cut-resume story: if a session is already active for a device,
-- the app should always detect and resume THAT one rather than risk a
-- second one silently being created alongside it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_weighing_sessions_one_active_per_device
  ON public.weighing_sessions (device_id)
  WHERE status = 'in_progress';
