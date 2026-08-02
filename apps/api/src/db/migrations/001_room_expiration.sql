ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;
UPDATE rooms SET last_activity_at = created_at WHERE last_activity_at IS NULL;
ALTER TABLE rooms ALTER COLUMN last_activity_at SET DEFAULT now();
ALTER TABLE rooms ALTER COLUMN last_activity_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS rooms_expiration_idx ON rooms(created_at, last_activity_at);
