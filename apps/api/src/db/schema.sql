CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE rooms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(6) UNIQUE NOT NULL, name text NOT NULL, host_token uuid NOT NULL DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), last_activity_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE queue_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, youtube_id varchar(32) NOT NULL, title text NOT NULL, channel_title text NOT NULL, thumbnail_url text NOT NULL, duration text, added_by text NOT NULL, position integer NOT NULL, played_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX queue_items_room_position_idx ON queue_items(room_id, position) WHERE played_at IS NULL;
