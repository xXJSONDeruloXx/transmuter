# Adding a New Language

Step-by-step guide for adding a new source language to Transmuter.

## 1. Add to Language type

In `packages/core/src/language.ts`, add the new language to the `Language` union:

```typescript
export type Language = 'c' | 'cpp' | 'pascal' | 'newlang';
```

## 2. Add file extensions

In the same file, add entries to `EXTENSION_MAP`:

```typescript
const EXTENSION_MAP: Record<string, Language> = {
  // ... existing entries ...
  '.nl': 'newlang',
  '.newlang': 'newlang',
};
```

The `detectLanguage(filePath)` function uses this map. No further changes are needed for auto-detection.

## 3. Add tree-sitter grammar

You need a tree-sitter grammar for the language. Two options:

### Option A: Official ast-grep package (preferred)

If `@ast-grep/lang-newlang` exists, add it as a dependency and register it like C++:

```bash
pnpm add @ast-grep/lang-newlang --filter @transmuter/core
```

```typescript
// In parser.ts
async function ensureNewlangRegistered(): Promise<void> {
  if (registered.has('newlang')) return;
  registered.add('newlang');
  const lang = await import('@ast-grep/lang-newlang');
  registerDynamicLanguage({ newlang: lang.default });
}
```

### Option B: Generic tree-sitter grammar

If only a `tree-sitter-newlang` package exists (node-gyp or prebuild), register it manually:

```bash
pnpm add tree-sitter-newlang --filter @transmuter/core
```

```typescript
// In parser.ts
function ensureNewlangRegistered(): void {
  if (registered.has('newlang')) return;
  registered.add('newlang');

  const require = createRequire(import.meta.url);
  const pkgDir = path.dirname(require.resolve('tree-sitter-newlang/package.json'));
  // Adjust path based on how the grammar package builds its native binding
  const libPath = path.join(pkgDir, 'build', 'Release', 'tree_sitter_newlang_binding.node');

  registerDynamicLanguage({
    newlang: {
      libraryPath: libPath,
      extensions: ['nl', 'newlang'],
      languageSymbol: 'tree_sitter_newlang',
    },
  });
}
```

## 4. Register grammar in parser.ts

Add the new language to the `ensureLanguageRegistered()` switch and the `parse()` function:

```typescript
export async function ensureLanguageRegistered(language: Language): Promise<void> {
  switch (language) {
    case 'c':
      ensureCRegistered();
      break;
    case 'cpp':
      await ensureCppRegistered();
      break;
    case 'pascal':
      ensurePascalRegistered();
      break;
    case 'newlang':
      await ensureNewlangRegistered(); // or sync if no async import
      break;
  }
}

export function parse(language: Language, source: string): SgRoot {
  // Add lazy registration for sync languages, or rely on
  // ensureLanguageRegistered() having been called for async ones.
  return sgParse(language, source);
}
```

## 5. Write language-specific helpers (if needed)

If the language's AST differs significantly from C (different node kinds for functions, statements, etc.), create a helpers file:

```
packages/core/src/rules/newlang-helpers.ts
```

See `pascal-helpers.ts` for an example. Common helpers:
- `findNewlangFunctionBody(root, functionName)` — locate the function body
- `getNewlangStatements(block)` — get child statements from a block, filtering out language-specific tokens
- `getNewlangVarDeclarations(fnNode)` — find variable declarations

The existing `findTargetFunction()` in `helpers.ts` already dispatches by language for Pascal. Add your language there or keep it in your helpers file.

## 6. Write mutation rules

Create rule files in `packages/core/src/rules/built-in/` with the naming convention `newlang-*.ts`:

```typescript
import type { MutationApplyResult } from '~/types.js';
import { findTargetFunction, swapRanges } from '../helpers.js';
import type { MutationContext, Rule } from '../rule.js';

export const newlangReorderStmts: Rule = {
  id: 'newlang-reorder-stmts',
  description: 'Swap two adjacent statements.',
  languages: ['newlang'],
  defaultWeight: 30,

  apply(ctx: MutationContext): MutationApplyResult | null {
    // ... implementation ...
  },
};
```

Key points:
- Set `languages` to `['newlang']` (or include multiple if the rule works across languages)
- Use `findTargetFunction(root, functionName, 'newlang')` to scope mutations to the target function
- Return `null` if the rule can't apply (no matching AST nodes)
- Use `rng` for all random choices (deterministic reproduction)

## 7. Register rules in built-in/index.ts

Import and add to the `builtInRules` array:

```typescript
import { newlangReorderStmts } from './newlang-reorder-stmts.js';

export const builtInRules: Rule[] = [
  // ... existing rules ...
  newlangReorderStmts,
];
```

Update the comment counting total rules.

## 8. Write at least one guideline

Create a guideline in `packages/core/src/guidelines/built-in/`:

```typescript
export const noSomeSmell: Guideline = {
  id: 'no-some-smell',
  description: 'Remove some code smell from newlang code.',
  languages: ['newlang'],
  disabledRules: ['newlang-some-rule'],
  detect(source, functionName) { /* ... */ },
  remove(source, violation) { /* ... */ },
};
```

Register it in `guidelines/built-in/index.ts`.

## 9. Add CodeBlock language support in webapp

In `packages/webapp/src/components/CodeBlock.tsx`, add the language to the type and scope map:

```typescript
type Language = 'c' | 'cpp' | 'pascal' | 'newlang' | 'asm' | 'diff';

const scopeMap: Record<Language, string> = {
  // ... existing entries ...
  newlang: 'source.newlang',  // must match a @wooorm/starry-night grammar scope
};
```

If `@wooorm/starry-night` doesn't have a grammar for the language, you may need to add a custom grammar or fall back to no highlighting.

## 10. Add fixture test

Create a test fixture in `test-fixture/` with a real source file and target `.o` for the new language. This validates the full pipeline (parse -> mutate -> compile -> score) works end-to-end.

## 11. Update ARCHITECTURE.md

Update the following sections:
- Language Detection table (add new extensions)
- Grammar Registration table (add grammar package)
- Built-In Rules table (add new rule category)
- Built-in guidelines table (add new guideline)
- Dependencies list (add grammar package)

## Checklist

- [ ] `Language` type updated in `language.ts`
- [ ] File extensions added to `EXTENSION_MAP`
- [ ] Tree-sitter grammar dependency added to `package.json`
- [ ] Grammar registered in `parser.ts`
- [ ] Language-specific helpers created (if needed)
- [ ] Mutation rules written and registered
- [ ] At least one guideline written and registered
- [ ] CodeBlock language support added in webapp
- [ ] Fixture test passes
- [ ] ARCHITECTURE.md updated
