#!/bin/bash
set -e

# Determine the script's directory (project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building from: $(pwd)"
echo "Directory contents:"
ls -la

echo "Building web app..."
cd apps/web
npm install
npm run build
cd "$SCRIPT_DIR"

echo "Building API..."
cd apps/api
npm install
npm run build
cd "$SCRIPT_DIR"

echo "Build complete!"
echo "Web dist contents:"
ls -la apps/web/dist

echo "API dist contents:"
ls -la apps/api/dist
