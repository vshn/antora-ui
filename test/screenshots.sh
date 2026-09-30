#!/bin/sh
# Captures screenshots of every brand in brands.json into screenshots/<brand>/, so someone can look at
# a brand instead of trusting computed colors. Needs no bundle: Playwright builds the preview itself.
set -e
cd "$(dirname "$0")/.."
# Playwright reuses a server it finds on this port, so a leftover one would serve the wrong brand
if curl -s -o /dev/null http://localhost:5252/index.html; then
  echo "something already serves localhost:5252: stop it first, or every brand would be captured from it"
  exit 1
fi
# read from the manifest, so a fifth brand is captured without touching this script
brands=$(node -p "require('./brands.json').brands.map((it) => it.name).join(' ')")
# One brand at a time: every build wipes and rewrites build/ and public/_, so two running in the same
# workspace would delete each other's files halfway through.
for brand in $brands; do
  echo "capturing $brand"
  env -u PREVIEW_ASSETS BRAND="$brand" SCREENSHOTS=1 npx playwright test test/screenshot.spec.js
done
echo "produced:"
ls -l screenshots/*/*.png
