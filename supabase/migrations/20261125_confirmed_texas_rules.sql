-- Poker Online confirmed Texas Hold'em rules: 2-9 players, 5% rake per pot, optional folded-card reveal.
ALTER TABLE poker_games
  ADD COLUMN IF NOT EXISTS rake_amount bigint NOT NULL DEFAULT 0;

-- Enforce the official club blind ratio, including databases that already applied the prior club migration.
ALTER TABLE poker_clubs DROP CONSTRAINT IF EXISTS poker_clubs_table_rules_check;
ALTER TABLE poker_clubs ADD CONSTRAINT poker_clubs_table_rules_check
  CHECK (small_blind > 0 AND big_blind = small_blind * 2 AND min_buyin >= big_blind * 10
    AND max_buyin >= min_buyin AND max_players BETWEEN 2 AND 9);

-- Keep room capacity aligned with the confirmed 2-9 player rules.
ALTER TABLE poker_rooms
  DROP CONSTRAINT IF EXISTS poker_rooms_max_players_check;
ALTER TABLE poker_rooms
  ADD CONSTRAINT poker_rooms_max_players_check CHECK (max_players BETWEEN 2 AND 9);
