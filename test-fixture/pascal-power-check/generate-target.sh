#!/bin/bash
set -e

# Generate the target object file for pascal-power-check fixture.
#
# Requires:
#   - IDO 7.1: built via ./setup-compilers.sh
#
# Usage:
#   ./generate-target.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_DIR="$SCRIPT_DIR/../shared"

"$SHARED_DIR/compile-ido-pascal.sh" "$SCRIPT_DIR/matching.pas" "$SCRIPT_DIR/target.o"

echo "Generated target.o"
