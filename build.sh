#!/bin/bash
set -e

echo "Building from: $(pwd)"
echo "Directory contents:"
ls -la

echo "Building web app..."
cd apps/web
npm install
npm run build
cd ../..

echo "Building API..."
cd apps/api
npm install
npm run build
cd ../..

echo "Build complete!"
echo "Web dist contents:"
ls -la apps/web/dist

echo "API dist contents:"
ls -la apps/api/dist
