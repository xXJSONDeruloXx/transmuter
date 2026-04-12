# CLI Examples

Examples of using the CLI to call the `match` and `refine` commands without `pnpm run test:fixture`.

```sh
pnpm --filter @transmuter/cli run dev match \
  ../../test-fixture/entity-item-drop/base.c \
  --target ../../test-fixture/entity-item-drop/target.o \
  --function EntityItemDrop \
  --compiler "../../test-fixture/shared/compile.sh {{inputPath}} {{outputPath}}" \
  --profile agbcc \
  --source-prefix ../../test-fixture/shared/context.h \
  --api
```

```sh
pnpm --filter @transmuter/cli run dev refine \
  ../../test-fixture/roll-random-level-variant/base.c \
  --target ../../test-fixture/roll-random-level-variant/target.o \
  --function RollRandomLevelVariant \
  --compiler "../../test-fixture/shared/compile.sh {{inputPath}} {{outputPath}}" \
  --profile agbcc \
  --source-prefix ../../test-fixture/shared/context.h \
  --guideline no-asm-pin \
  --api
```
