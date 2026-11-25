-- 俱乐部专属牌桌及管理员规则设置（全部为不可兑换虚拟金币）
ALTER TABLE poker_clubs
  ADD COLUMN IF NOT EXISTS small_blind bigint NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS big_blind bigint NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS min_buyin bigint NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS max_buyin bigint NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS max_players integer NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS auto_start boolean NOT NULL DEFAULT true;

ALTER TABLE poker_rooms
  ADD COLUMN IF NOT EXISTS club_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'poker_rooms_club_id_fkey') THEN
    ALTER TABLE poker_rooms ADD CONSTRAINT poker_rooms_club_id_fkey
      FOREIGN KEY (club_id) REFERENCES poker_clubs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'poker_clubs_table_rules_check') THEN
    ALTER TABLE poker_clubs ADD CONSTRAINT poker_clubs_table_rules_check
      CHECK (small_blind > 0 AND big_blind = small_blind * 2 AND min_buyin >= big_blind * 10
        AND max_buyin >= min_buyin AND max_players BETWEEN 2 AND 9);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_poker_rooms_club_id ON poker_rooms(club_id);
