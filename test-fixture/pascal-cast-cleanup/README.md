# pascal-cast-cleanup

Pascal refinement test targeting redundant type cast removal.

## Purpose

Tests that the Refiner correctly detects and attempts to fix redundant type
casts in Pascal code using the `no-redundant-cast-pascal` guideline. The base
source contains `Integer(x)` casts on values that are already `Integer` typed,
which are unnecessary and reduce readability. The refiner should strip these
redundant casts while preserving assembly equivalence.

## Files

- `base.pas` — Pascal source code with redundant casts to refine
- `generate-target.sh` — Script to compile the target `.o` (requires IDO Pascal)
- `run-refine.ts` — Test script that runs the Refiner with `no-redundant-cast-pascal`

## Prerequisites

- IDO Pascal compiler (`$IDO_PATH/pc`)
- Run `./generate-target.sh` to produce `target.o`

## Usage

```bash
npx tsx test-fixture/pascal-cast-cleanup/run-refine.ts
```
