# cpp-cast-cleanup

C++ refinement test targeting C-style cast removal.

## Purpose

Tests that the Refiner correctly detects and attempts to fix C-style casts in
C++ code using the `no-c-style-cast` guideline. The base source contains
`(int)` and `(float)` C-style casts that should be flagged as violations.
The refiner should attempt to replace them with C++ casts (`static_cast<>`)
while preserving assembly equivalence.

## Files

- `base.cpp` — Source code with C-style casts to refine
- `generate-target.sh` — Script to compile the target `.o` (requires IDO)
- `run-refine.ts` — Test script that runs the Refiner with `no-c-style-cast`

## Prerequisites

- IDO C++ compiler (`$IDO_PATH/cc`)
- Run `./generate-target.sh` to produce `target.o`

## Usage

```bash
npx tsx test-fixture/cpp-cast-cleanup/run-refine.ts
```
