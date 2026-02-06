# Evo Support (Cloudflare)

This folder contains the Cloudflare Pages + Functions version of the support system.

## What runs where
- Pages hosts the static UI (`public/`).
- Pages Functions (`functions/`) provide the API.
- D1 stores tickets/data.
- R2 stores uploads.
- The Discord bot stays on your server and talks to the bot API.

## Required environment variables
Set these in Cloudflare Pages (Settings → Environment Variables):

- `BASE_URL` (e.g. `https://tickets.evodev.uk`)
- `SESSION_SECRET` (long random string)
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `ADMIN_DISCORD_IDS` (comma-separated Discord IDs)
- `BOT_API_TOKEN` (shared secret for the bot API)
- `R2_PUBLIC_BASE` (optional public URL for R2 objects, e.g. `https://r2.evodev.uk/uploads`)

## D1 + R2 setup
1) Create a D1 database named `evo_support`.
2) Apply migrations:
   - Use the SQL in `migrations/0001_init.sql`.
3) Create an R2 bucket named `evo-support-uploads`.

## OAuth setup
- Redirect URI: `https://tickets.evodev.uk/api/auth/discord/callback`
- Scopes: `identify`, `email`

## Bot integration
Use these endpoints from your Discord bot (send `Authorization: Bearer <BOT_API_TOKEN>`):

- `POST /api/bot/tickets` (create Discord ticket)
- `POST /api/bot/tickets/:publicId/messages` (send DM reply into ticket)
- `GET /api/bot/tickets/active?discord_id=...` (list open Discord tickets)
- `GET /api/bot/messages?since_id=...` (poll staff replies for Discord tickets)

## Pages build
Point Pages to this `cloudflare/` directory.

Suggested build settings:
- Framework preset: None
- Build command: (empty)
- Build output directory: `public`

## Migration notes
This version does not migrate MySQL data automatically. Start fresh, or export/import manually.
