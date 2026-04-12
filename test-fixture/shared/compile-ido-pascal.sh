#!/bin/bash
set -e

# Compile Pascal source to a MIPS object file using IDO 7.1.
# Usage: compile-ido-pascal.sh <inputPath> <outputPath>
#
# IDO's cc driver routes .p files to the upas (Pascal) frontend.
# USR_LIB tells cc where to find upas.
#
# Requires:
#   - IDO 7.1: built via ./setup-compilers.sh

INPUT="$1"
OUTPUT="$2"
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

IDO_DIR="$REPO_DIR/compilers/ido-static-recomp/build/7.1/out"
CC="$IDO_DIR/cc"

if [ ! -x "$CC" ]; then
  echo "Error: IDO cc not found at $CC" >&2
  echo "Run ./setup-compilers.sh first." >&2
  exit 1
fi

# IDO cc selects the Pascal frontend (upas) based on the .p extension.
# Copy to a .p file if the input has a different extension.
if [[ "$INPUT" != *.p ]]; then
  PASCAL_INPUT="${INPUT%.*}.p"
  cp "$INPUT" "$PASCAL_INPUT"
  CLEANUP_INPUT="$PASCAL_INPUT"
else
  PASCAL_INPUT="$INPUT"
  CLEANUP_INPUT=""
fi

USR_LIB="$IDO_DIR" "$CC" -c -mips2 -O2 -32 -o "$OUTPUT" "$PASCAL_INPUT"

if [ -n "$CLEANUP_INPUT" ]; then
  rm -f "$CLEANUP_INPUT"
fi
