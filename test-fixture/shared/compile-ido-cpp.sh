#!/bin/bash
set -e

# Compile C++ source to a MIPS object file using IDO 7.1 NCC (C++ driver).
# Usage: compile-ido-cpp.sh <inputPath> <outputPath>
#
# Requires:
#   - IDO 7.1: built via ./setup-compilers.sh

INPUT="$1"
OUTPUT="$2"
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

IDO_DIR="$REPO_DIR/compilers/ido-static-recomp/build/7.1/out"
NCC="$IDO_DIR/NCC"

if [ ! -x "$NCC" ]; then
  echo "Error: IDO NCC not found at $NCC" >&2
  echo "Run ./setup-compilers.sh first." >&2
  exit 1
fi

"$NCC" -c -mips2 -O2 -32 -o "$OUTPUT" "$INPUT"
