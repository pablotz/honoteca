<p align="center">
  <img src="public/icon-512.png" alt="Honoteca app icon" width="96" height="96" />
</p>

<h1 align="center">Honoteca</h1>

A physical book library and wishlist app that turns a quick phone photo of a book's barcode or cover into an interactive 3D wooden bookshelf. Built with React, Three.js, Express 5, and built-in Node SQLite.

![Honoteca's wooden bookshelf with books arranged across shelves](docs/images/shelf.png)

## Screenshots

| Grid view | Book detail |
| :---: | :---: |
| ![Book covers in grid view](docs/images/grid.png) | ![Selected book with interactive 3D cover and synopsis action](docs/images/book-detail.png) |

<p align="center">
  <img src="docs/images/login.png" alt="Honoteca's email login screen on mobile" width="300" />
</p>

## Features

- **Photo-to-shelf workflow** — Snap the back barcode (`zxing-wasm` in the browser) or fall back to client-side Spanish/Latin cover OCR (`tesseract.js`) when a barcode isn't readable.
- **Multi-catalog metadata** — Chains openBD, National Diet Library (NDL), Open Library, and Google Books, plus exact-ISBN cover caching from Open Library and El Sótano so cover images never rot.
- **Interactive 3D book & wooden room** — Inspect books as 3D objects (`Three.js`) with spine color extracted from your photo, flippable back-cover synopsis, gyroscope/mouse parallax, and soft shadows.
- **Owned shelf & wishlist** — Separate **Mi estante** (`owned`) and **Comprar** (`buy`) shelves, multiple physical copies per ISBN (`×N`), and shelf/grid views with dark, sepia, and light themes.
- **Passwordless whitelist & per-user libraries** — Magic-link email login (`ALLOWED_EMAILS`) where every whitelisted email gets its own isolated library inside the same SQLite database.
- **Automatic English/Spanish interface** — Uses your browser or phone's language preferences, with English as the fallback. Book titles, publishers, and synopses keep their edition's language.

## Prerequisites

- **Node.js ≥ 22.12** (uses built-in `node:sqlite` and `.env` loader — zero native addons).

## Getting Started

### Local Development (HMR)

Run the API server and the Vite dev server in two terminals:

```sh
npm install
npm run dev:api   # Express API + SQLite on :8849
npm run dev       # Vite HMR on :5173 (proxies /api and /covers to :8849)
```

Open `http://localhost:5173` (or `http://<your-lan-ip>:5173` from your phone on the same Wi-Fi).

> [!TIP]
> When `ALLOWED_EMAILS` is not set in `.env`, authentication is disabled so you can scan books from your phone over LAN without logging in.

### Production (Single Command)

```sh
./start.sh        # Installs deps, vendors OCR assets, builds Vite, and serves on 0.0.0.0:8849
```

## Configuration

Theme, shelf/grid view, active library section, and books-per-shelf preferences are saved per account in this browser. Use the − / + controls to show 3–6 books per shelf; phone covers shrink to fit. Existing browser settings are migrated automatically. Preferences are local to the site address: localhost ports, `honoteca.app`, and `honoteca.fly.dev` have separate storage; clearing site data resets them.

On a phone, **Add to Home Screen** opens a compact bottom sheet with icons and instructions selected automatically for iPhone/iPad or Android. It is hidden when Honoteca is already running in standalone mode. A home-screen shortcut still needs an internet connection.

Copy `.env.example` to `.env` to configure authentication, email delivery, or storage paths:

| Variable | Description |
| :--- | :--- |
| `ALLOWED_EMAILS` | Comma-separated whitelist of emails allowed to sign in (also accepts `OWNER_EMAIL`). Each email gets its own isolated library. |
| `AUTH_SECRET` | Random secret used to HMAC-sign 30-day session cookies (`openssl rand -hex 32`). |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key to email magic links. Without it, links are printed only in development; production email login is unavailable. |
| `RESEND_FROM` | Verified sender address in Resend (defaults to `Honoteca <onboarding@resend.dev>`). |
| `DATA_DIR` | Optional directory to store both `library.db` and `covers/` on a single mounted volume (e.g. `/data` on Fly.io). |
| `TRUST_PROXY` | Set to `1` when running behind a reverse proxy (Fly.io, Caddy, nginx) for accurate rate-limiting IPs and HTTPS detection. |
| `GOOGLE_BOOKS_API_KEY` | Optional API key to enable the official Google Books API quota. |
| `APP_URL` | Canonical origin for login links. Fly is configured with `https://honoteca.app`. |
| `PUBLIC_SIGNUP` | Set to `1` to let visitors verify any email and create a private library. Default: invite-only via `ALLOWED_EMAILS`. |
| `TURNSTILE_SITE_KEY` | Public Cloudflare Turnstile widget key; required for public signup. |
| `TURNSTILE_SECRET_KEY` | Server-only Turnstile verification secret; required for public signup. |

> [!IMPORTANT]
> Production requires login configuration and an `AUTH_SECRET` of at least 32 characters. Public signup additionally requires email delivery, a sender, an HTTPS `APP_URL`, and both Turnstile keys. It never enables anonymous API access.

### Enable public email signup

1. Create a [Resend account](https://resend.com), add `auth.honoteca.app` as a sending domain, and copy the DNS records Resend gives you into Cloudflare. Keep the existing apex A/AAAA records. Wait for Resend to mark the sending domain verified.
2. Create a Resend API key with sending access restricted to that domain. In Fly's app secrets, add `RESEND_API_KEY` and `RESEND_FROM=Honoteca <login@auth.honoteca.app>`. Keep email click tracking disabled for one-time login links.
3. In Cloudflare → Turnstile, create a Managed widget for hostname `honoteca.app`. Add its `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` to Fly secrets. Turnstile works with the existing DNS-only setup.
4. After deploying these changes and configuring the keys, set `PUBLIC_SIGNUP=1` in Fly secrets. Keep your email first in `ALLOWED_EMAILS` so any legacy unowned books stay assigned to you. First-time visitors get an empty library after verifying their email.
5. Test with a second email: receive the link, log in, create a book, and verify neither account can see the other's library or uploaded photos. No real email is sent by the automated tests.

### Abuse and cost controls

- All API routes: 120 requests/minute per IP, checked before body parsing. Catalog lookups/downloads: 20/minute per user. Excess requests return `429` with `Retry-After`.
- Login requests: 5 attempts/15 minutes per IP (including unknown addresses). Email delivery: 1/minute and 3/hour per recipient; 20/hour and 50/day across the app. These delivery budgets persist in SQLite across restarts and count failed send attempts too. The login response does not reveal whether an email was sent.
- Public login requires a server-verified Turnstile token for the canonical hostname. Login tokens expire after 15 minutes and can be used once; only their hashes are stored.
- Photo uploads: 5/minute per user, 25 MB/file, at most two concurrent uploads, and a 128 MB free-space reserve. Uploaded photos and scan tickets are scoped to their owner; catalog cover images can be shared.
- IP/API/upload limits are in memory for the current single-machine deployment; use shared limits before adding replicas. These application controls do not stop distributed traffic from reaching Fly or impose a hard bandwidth spending cap.
- Keep the Google Books key on the server, restrict it to the Books API in Google Cloud, and lower the project's available request quotas to your intended usage. Do not use browser-referrer restrictions for this server-side key.

## Deployment (Fly.io + GitHub Actions)

The repository includes `Dockerfile`, `fly.toml`, and `.github/workflows/fly-deploy.yml` for automatic deployments on every push to `main`.

```sh
# 1. Create app and 1GB persistent volume
fly apps create honoteca
fly volumes create honoteca_data --size 1 --region dfw --yes

# 2. Configure secrets
fly secrets set \
  ALLOWED_EMAILS="you@example.com,friend@example.com" \
  AUTH_SECRET="$(openssl rand -hex 32)"

# 3. Deploy
fly deploy --ha=false
```

To enable automatic deploys from GitHub Actions, create a deploy token (`fly tokens create deploy -x 999999h`) and save it as the `FLY_API_TOKEN` repository secret in GitHub.

## Project Structure

```text
├── server/
│   ├── index.js      # Express 5 entrypoint, static asset serving, and production guards
│   ├── auth.js       # Magic-link endpoints, rate limiting, and per-user session middleware
│   ├── session.js    # Stateless HMAC session signing and token hashing
│   ├── api.js        # Book CRUD, scan ticket staging, cover caching, and confirmation flow
│   ├── db.js         # Sealed node:sqlite data layer (WAL mode, per-user isolation)
│   ├── meta.js       # ISBN & title lookup chain (openBD, NDL, Open Library, Google Books)
│   └── upload.js     # Multer disk storage for spine/cover photos and orphan cleanup
├── src/
│   ├── App.jsx       # Scan state machine (states A/B/C/D), shelf/detail layout, and transitions
│   ├── components/   # Cover3D, ShelfView, BookDetail, ConfirmPanel, CropDialog, Login, etc.
│   └── lib/          # Client barcode decoding (zxing-wasm), cover OCR (tesseract.js), spine color
└── scripts/
    └── vendor.mjs    # Self-hosts tesseract.js core and Spanish traineddata into public/vendor/
```

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Vite dev server with HMR (`:5173`) |
| `npm run dev:api` | Start Express API server (`:8849`) |
| `npm run build` | Build production frontend into `dist/` |
| `npm start` | Start production server serving `dist/`, `/api`, and `/covers` |
| `npm test` | Run backend and pure-function test suite (`node --test`) |
