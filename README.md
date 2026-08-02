# Encore karaoke

A shared karaoke room: the host controls YouTube playback while guests join with a room code, search YouTube karaoke videos, and collaboratively manage a live queue.

## Apps

- `apps/web` — React + TypeScript + Tailwind web host and guest experience.
- `apps/mobile` — Expo React Native companion, with both Host and Guest modes.
- `apps/api` — Express + PostgreSQL + Socket.IO API and YouTube Data API integration.

## Local development

1. Copy `.env.example` values into `apps/api/.env` and `apps/web/.env`.
2. `docker compose up -d postgres`
3. Apply [schema.sql](apps/api/src/db/schema.sql) to the database.
4. `npm install`
5. In separate terminals run `npm run dev:api`, `npm run dev:web`, and optionally `npm run dev:mobile`.

## Production deployment

Deploy `apps/web` to Vercel (framework preset: Vite) and set `VITE_API_URL` to the API URL. The Express + Socket.IO service needs a persistent Node host (Railway, Render, Fly.io, or a container service); Vercel Functions do not keep WebSocket connections alive. Use a managed Postgres database and configure `CLIENT_ORIGIN` to the Vercel deployment URL.

The web player intentionally exists only in Host mode. Guests submit queue requests over the API and receive room updates by Socket.IO.

## Room expiration migration

Rooms are deleted after 24 hours total or two hours without activity. For an existing database, apply [001_room_expiration.sql](apps/api/src/db/migrations/001_room_expiration.sql) once before deploying the API change. New databases receive the column from [schema.sql](apps/api/src/db/schema.sql).
