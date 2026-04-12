#!/bin/bash
set -e

# Compile C source to an ARM object file using agbcc.
# Usage: compile.sh <inputPath> <outputPath>
#
# Requires:
#   - agbcc: built via ./setup-compilers.sh (compilers/agbcc/agbcc)
#   - arm-none-eabi-as: from devkitPro or ARM GNU Toolchain, must be in PATH.

INPUT="$1"
OUTPUT="$2"
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# Derive assembly path from input (same dir, no extra temp files)
ASM="${INPUT%.c}.s"

# Use agbcc from the local compilers directory
CC="$REPO_DIR/compilers/agbcc/agbcc"
if [ ! -x "$CC" ]; then
  echo "Error: agbcc not found at $CC" >&2
  echo "Run ./setup-compilers.sh first." >&2
  exit 1
fi

# Preprocess (agbcc's built-in preprocessor has macro limits)
PP="${INPUT%.c}.pp.c"
cpp -P -nostdinc "$INPUT" > "$PP" 2>/dev/null

# Compile C -> assembly
"$CC" "$PP" -o "$ASM" \
  -mthumb-interwork -Wimplicit -Wparentheses \
  -O2 -fhex-asm -fprologue-bugfix

rm -f "$PP"

# Append alignment directive (shell builtin, no fork)
printf ".text\n\t.align\t2, 0\n" >> "$ASM"

# Assemble -> object file
arm-none-eabi-as -mcpu=arm7tdmi -mthumb-interwork "$ASM" -o "$OUTPUT"

# Clean up assembly intermediate
rm -f "$ASM"
