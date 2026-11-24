-- 俱乐部开赛时间：none=未安排，daily=每日固定时间，once=指定日期时间
ALTER TABLE poker_clubs
  ADD COLUMN IF NOT EXISTS schedule_type varchar(10) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS daily_start_time varchar(5),
  ADD COLUMN IF NOT EXISTS starts_at timestamptz(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'poker_clubs_schedule_type_check'
  ) THEN
    ALTER TABLE poker_clubs
      ADD CONSTRAINT poker_clubs_schedule_type_check
      CHECK (schedule_type IN ('none', 'daily', 'once'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'poker_clubs_daily_time_check'
  ) THEN
    ALTER TABLE poker_clubs
      ADD CONSTRAINT poker_clubs_daily_time_check
      CHECK (daily_start_time IS NULL OR daily_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      NOT VALID;
  END IF;
END $$;
