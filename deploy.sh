#!/usr/bin/env bash
# Build and deploy the card to GitHub Pages (gh-pages branch).
set -e
cd "$(dirname "$0")"
~/.local/bin/pnpm build
cd dist
rm -rf .git
git init -qb gh-pages
git config user.name "SupremeDante"
git config user.email "supremedante.cloned@gmail.com"
git add -A
git commit -qm "deploy $(date +%F_%T)"
git push -f -q https://github.com/SupremeDante/living-card.git gh-pages:gh-pages
rm -rf .git
echo "DEPLOYED → https://supremedante.github.io/living-card/"
