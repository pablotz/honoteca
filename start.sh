#!/usr/bin/env bash
# Honoteca — arranque completo (build de Vite + runtime Node).
#   1) instala deps si falta node_modules (npm ci si hay lock)
#   2) copia tesseract a public/vendor (una vez; re-ejecuta si cambia)
#   3) build del front (Vite → dist/)
#   4) levanta el servidor en 0.0.0.0:8849 (PC + celular comparten la biblioteca)
#
# Uso:  ./start.sh            # puerto 8849 (Honoteca)
#       PORT=9000 ./start.sh  # otro puerto
#
# Para desarrollo con HMR:  npm run dev:api   (terminal 1)
#                           npm run dev       (terminal 2, Vite con proxy al API)
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8849}"

if [ ! -d node_modules ]; then
  echo "==> instalando dependencias (npm ci)"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
fi

echo "==> vendoring (tesseract → public/vendor)"
node scripts/vendor.mjs

echo "==> build del front (vite → dist/)"
npm run build

echo "==> sirviendo en http://0.0.0.0:${PORT}"
exec node server/index.js --port "${PORT}"
