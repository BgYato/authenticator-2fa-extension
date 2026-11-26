#!/usr/bin/env bash
# Genera dist/authenticator-extension-<versión>.zip listo para la Chrome Web Store.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
out="dist/authenticator-extension-${version}.zip"
rm -f "$out"
zip -rq "$out" manifest.json LICENSE _locales icons src
echo "Creado $out"
