# pascal-power-check

Pascal permutation test targeting SGI Pascal / IDO compiler output.

## Purpose

Tests that the Transmuter correctly handles Pascal source files and only applies
Pascal-compatible rules when `language: 'pascal'` is specified. The fixture uses
an `IsPowerOfTwo` function written in standard Pascal syntax (compatible with
Delphi, FreePascal, and SGI Pascal) using `FunctionName := value` assignment
instead of `return` for maximum portability.

## Files

- `base.pas` — Pascal source code to permute
- `generate-target.sh` — Script to compile the target `.o` (requires IDO Pascal)
- `run-permute.ts` — Test script that runs the Transmuter with `language: 'pascal'`

## Prerequisites

- IDO Pascal compiler (`$IDO_PATH/pc`)
- Run `./generate-target.sh` to produce `target.o`

## Usage

```bash
npx tsx test-fixture/pascal-power-check/run-permute.ts
```
