# Honoteca

## Overview

Honoteca is a personal-library and wishlist app. A phone photo of a barcode or cover becomes a book on an interactive wooden shelf. Each authenticated email owns a separate SQLite library.

## Tech Stack

- Node.js 22.12 or newer, ESM, and built-in `node:sqlite`
- React 19 and Vite 8 for the client
- Express 5 for the API and production static serving
- Three.js for the 3D book, ZXing WASM for barcode decoding, and Tesseract.js for OCR
- Node's built-in test runner (`node --test`)
- Fly.io configuration in `fly.toml`

## Project Structure

- `src/App.jsx`: application state, scan flow, views, dialogs, and transitions.
- `src/components/`: visual React components. Reuse `Icon.jsx` for interface icons.
- `src/lib/`: browser-side API, scanning, i18n, preferences, book formatting, and pure-function tests.
- `src/index.css`: all application styling, design tokens, responsive rules, and motion rules.
- `server/index.js`: Express entry point, static assets, production guards, security headers, and routing.
- `server/auth.js`: magic-link login, sessions, allowlist/public signup, and login limits.
- `server/api.js`: protected book, lookup, scan, and cover routes.
- `server/db.js`: the only module that directly accesses SQLite; it owns migrations and per-user isolation.
- `server/upload.js` and `server/coverAccess.js`: upload storage and authorization.
- `server/meta.js`: catalog lookups and edition/synopsis selection.
- `docs/`: screenshots and security notes.

## Development

### Setup

```sh
npm install
cp .env.example .env
```

For local development, run these in separate terminals:

```sh
npm run dev:api
npm run dev
```

Vite runs on port 5173 and proxies `/api` and `/covers` to the Express API on port 8849. Authentication is disabled locally when `ALLOWED_EMAILS` is absent. Never commit `.env` or any secret.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite client with HMR. |
| `npm run dev:api` | Start the Express API on port 8849. |
| `npm run dev:all` | Start both development servers. |
| `npm run build` | Produce the production client in `dist/`. |
| `npm start` | Serve `dist/`, `/api`, and `/covers`. |
| `npm test` | Run all server and pure client tests. |
| `npm run vendor` | Refresh self-hosted OCR assets. |

## Code Style & Conventions

- Use ESM imports, semicolons, two-space indentation, and single quotes in JavaScript/JSX.
- Components use PascalCase files and default exports. Helpers use camelCase named exports.
- Keep UI copy bilingual with `t(spanish, english)` from `src/lib/i18n.js`; browser language selects the interface. Do not translate book metadata.
- Keep CSS in `src/index.css`. Use the theme variables and follow [DESIGN.md](DESIGN.md) for new UI.
- Preserve mobile touch targets and reduced-motion behavior. Reuse `Icon.jsx` instead of adding text glyphs or an icon package.
- Keep client preferences scoped through `src/lib/preferences.js`; they are per account and site origin.

## Architecture

The browser calls `/api` through `src/lib/api.js`. `server/index.js` applies security headers and API limits, exposes auth routes, then requires authentication for all book routes. Authenticated requests carry the session owner. Every database operation in `server/db.js` receives that owner, so new data access must keep the owner filter.

Book scans stage files and lookup results, then `server/api.js` creates or updates a book. Covers remain relative paths under the configured data directory and are authorized in `server/coverAccess.js`. Do not expose absolute filesystem paths or let a client choose another account's cover or ticket.

The production server needs a built `dist/`. Production login needs the environment values documented in `README.md`; public signup additionally requires verified Resend delivery and Cloudflare Turnstile.

## Testing

Tests live beside the module they cover as `*.test.js` and use `node:test` plus `node:assert`. Add a focused test whenever changing parsing, persistence, authorization, rate limits, or another branch-heavy helper. Use temporary directories for database/upload tests, as existing server tests do.

Run `npm test` and `npm run build` before handing off a non-trivial change. Check English and Spanish UI copy, narrow phone layouts, and all three themes when altering visible components.

## Common Tasks

### Add a component

Create it under `src/components/`, compose it from `App.jsx` or its closest parent, add styles to `src/index.css`, and provide bilingual visible/accessibility text. Use existing dialogs and `Icon.jsx` before adding another pattern.

### Add an API route

Put protected book routes in `server/api.js`. Validate request data, operate through `server/db.js`, scope reads and writes to `req.user`, and add a focused `server/*.test.js` test. Keep auth-only routes in `server/auth.js`.

### Change the database

Make schema/migration and query changes only in `server/db.js`. Keep WAL mode, transactions, and owner filtering intact. Update database tests for the new behavior.

### Change deployment or secrets

Update `fly.toml`, `.env.example`, and `README.md` together when a configuration contract changes. Never put a token, API key, email login link, or user data in source control or documentation.

## Version Control

Show `git status` and the relevant diff for review before committing, pushing, rebasing, resetting, or otherwise mutating Git history. Do not commit unrelated working-tree changes.
