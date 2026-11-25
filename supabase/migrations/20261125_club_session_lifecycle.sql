-- Club activity lifecycle: keep each scheduled activity's results separate.
ALTER TABLE poker_clubs
  ADD COLUMN IF NOT EXISTS session_status varchar(20) NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS session_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_ended_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_poker_clubs_session_status
  ON poker_clubs(session_status);
