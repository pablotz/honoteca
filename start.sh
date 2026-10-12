#!/usr/bin/env bash
# Biblioteca — arranque completo (una sola runtime: Node).
#   1) instala deps si falta node_modules (npm ci si hay lock)
#   2) copia three + zxing-wasm a public/vendor (una vez; re-ejecuta si cambian)
#   3) levanta el servidor en 0.0.0.0:8849 (PC + celular comparten la biblioteca)
#
# Uso:  ./start.sh            # puerto 8849 (Biblioteca)
#       PORT=9000 ./start.sh  # otro puerto
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8849}"

if [ ! -d node_modules ]; then
  echo "==> instalando dependencias (npm ci)"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
fi

echo "==> vendoring (three + zxing-wasm → public/vendor)"
node scripts/vendor.mjs

echo "==> sirviendo en http://0.0.0.0:${PORT}"
exec node server/index.js --port "${PORT}"
