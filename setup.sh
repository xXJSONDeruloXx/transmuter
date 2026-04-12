#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Initializing submodules..."
cd "$REPO_DIR"
git submodule update --init --recursive

echo "==> Building agbcc..."
cd "$REPO_DIR/compilers/agbcc"
if [ ! -f agbcc ]; then
  ./build.sh
else
  echo "    agbcc already built, skipping. (rm compilers/agbcc/agbcc to rebuild)"
fi

echo "==> Installing npm dependencies..."
cd "$REPO_DIR"
npm install --install-strategy=nested

echo ""
echo "Done. Run tests with:"
echo "  npm run test:fixture"
