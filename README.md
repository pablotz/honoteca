# Biblioteca

Estantería que escanea lomos (foto → ISBN → metadatos) y los muestra como mueble o cuadrícula.
LAN: PC y teléfono comparten la biblioteca (Express + SQLite; front en Vite + React).

## Requisitos

- Node ≥ 22.12 (`node:sqlite` y Vite 8 lo piden).

## Producción (una orden)

```sh
./start.sh          # npm ci → vendor → vite build → sirve en http://0.0.0.0:8849
PORT=9000 ./start.sh
```

`start.sh` corre el build de Vite (`dist/`) y Express sirve `dist/` + `/api` + `/covers`.

## Desarrollo (HMR)

```sh
# terminal 1 — el API (Express, :8849)
npm run dev:api

# terminal 2 — Vite (:5173, proxy de /api, /covers y /health al API)
npm run dev
```

Abre `http://localhost:5173` (en la LAN: `http://<ip-del-pc>:5173`).

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev:api` | Express (DB + API + covers) |
| `npm run dev` | Vite dev server con HMR |
| `npm run build` | `vite build` → `dist/` |
| `npm start` | sirve `dist/` (requiere build previo) |
| `npm run vendor` | copia tesseract a `public/vendor` (corre solo en `postinstall`) |
| `npm test` | test de las funciones puras (`src/lib/book.test.js`) |

## Estructura

- `server/` — Express 5 + `node:sqlite`. Todo el API bajo `/api`. No toca el front.
- `src/` — React (Vite). `App.jsx` orquesta el flujo de escaneo (estados A/B/C/D).
- `src/lib/` — helpers puros (`book.js`, testeado) y del navegador (`strip.js` canvas,
  `barcode.js` zxing-wasm, `ocr.js` tesseract self-host).
- `public/vendor/` — assets self-host de tesseract (de ahí los copia `vendor.mjs`).
- `covers/{front,back,tmp}/`, `state/library.db` — datos (git-ignorados).

## Configuración

`.env` (opcional, ver `.env.example`): `GOOGLE_BOOKS_API_KEY` (4ª fuente de metadatos),
`PORT`, `HOST`.