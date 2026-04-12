# cpp-method-order

C++ permutation test targeting IDO C++ method ordering.

## Purpose

Tests that the Transmuter correctly handles C++ source files and only applies
C++-compatible rules when `language: 'cpp'` is specified. The fixture uses a
simple `Actor` struct with a `TakeDamage` method — the kind of pattern commonly
found in N64 decompilation projects compiled with the SGI IDO toolchain.

## Files

- `base.cpp` — Source code to permute
- `generate-target.sh` — Script to compile the target `.o` (requires IDO)
- `run-permute.ts` — Test script that runs the Transmuter with `language: 'cpp'`

## Prerequisites

- IDO C++ compiler (`$IDO_PATH/cc`)
- Run `./generate-target.sh` to produce `target.o`

## Usage

```bash
npx tsx test-fixture/cpp-method-order/run-permute.ts
```
