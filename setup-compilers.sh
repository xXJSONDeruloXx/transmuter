#!/bin/bash
set -e

echo "=== Transmuter — Compiler Setup ==="
echo ""

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------------------------
# Tool checks
# ---------------------------------------------------------------------------

check_tool() {
    if ! command -v "$1" &> /dev/null; then
        echo "Error: $1 is not installed."
        echo "  $2"
        exit 1
    fi
}

check_tool arm-none-eabi-as "Install ARM GNU Toolchain: https://developer.arm.com/downloads/-/arm-gnu-toolchain-downloads"
check_tool make "Install make via your package manager."

# ---------------------------------------------------------------------------
# Submodules
# ---------------------------------------------------------------------------

echo "Initializing submodules..."
git submodule update --init
echo ""

# ---------------------------------------------------------------------------
# agbcc (GBA C compiler)
# ---------------------------------------------------------------------------

AGBCC_DIR="$REPO_DIR/compilers/agbcc"
AGBCC_CACHE="$AGBCC_DIR/.build_cache"
AGBCC_COMMIT=$(git -C "$AGBCC_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")

if [ -f "$AGBCC_DIR/agbcc" ] && [ -f "$AGBCC_CACHE" ] && [ "$(cat "$AGBCC_CACHE")" = "$AGBCC_COMMIT" ]; then
    echo "agbcc is up-to-date (cached), skipping build."
else
    echo "Building agbcc..."
    cd "$AGBCC_DIR"
    # build.sh may return non-zero if the agbcc_arm variant fails on newer
    # compilers, but the main agbcc binary will still be built.
    ./build.sh || true
    cd "$REPO_DIR"

    if [ ! -f "$AGBCC_DIR/agbcc" ]; then
        echo "Error: agbcc failed to build."
        exit 1
    fi

    echo "$AGBCC_COMMIT" > "$AGBCC_CACHE"
    echo "agbcc: OK"
fi
echo ""

# ---------------------------------------------------------------------------
# IDO (N64 / IRIX compiler — static recompilation)
#
# Produces: compilers/ido-static-recomp/build/7.1/out/cc  (C / C++)
# ---------------------------------------------------------------------------

IDO_DIR="$REPO_DIR/compilers/ido-static-recomp"
IDO_CACHE="$IDO_DIR/.build_cache"
IDO_COMMIT=$(git -C "$IDO_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")

if [ -f "$IDO_DIR/build/7.1/out/cc" ] && [ -f "$IDO_CACHE" ] && [ "$(cat "$IDO_CACHE")" = "$IDO_COMMIT" ]; then
    echo "IDO 7.1 is up-to-date (cached), skipping build."
else
    echo "Building IDO 7.1 (static recompilation)..."
    cd "$IDO_DIR"
    # On macOS, ensure Apple's ar is used instead of GNU ar from Homebrew.
    # GNU ar produces archives that macOS ld cannot link.
    if [ "$(uname)" = "Darwin" ] && [ -x /usr/bin/ar ]; then
        export PATH="/usr/bin:$PATH"
    fi
    rm -rf tools/rabbitizer/build build
    make setup
    make VERSION=7.1
    cd "$REPO_DIR"

    if [ ! -f "$IDO_DIR/build/7.1/out/cc" ]; then
        echo "Error: IDO 7.1 failed to build."
        exit 1
    fi

    echo "$IDO_COMMIT" > "$IDO_CACHE"
    echo "IDO 7.1: OK"
fi
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo "=== Compiler setup complete ==="
echo ""
echo "  agbcc : $AGBCC_DIR/agbcc"
echo "  IDO cc: $IDO_DIR/build/7.1/out/cc"
echo ""
echo "Run 'pnpm test' to verify the test fixtures."
