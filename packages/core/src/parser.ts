/**
 * Multi-language parser setup for ast-grep.
 *
 * Registers tree-sitter grammars on first use:
 * - C: tree-sitter-c (existing)
 * - C++: @ast-grep/lang-cpp (official ast-grep package)
 * - Pascal: tree-sitter-pascal (Isopod/tree-sitter-pascal, Delphi/FPC grammar)
 */
import { type SgRoot, registerDynamicLanguage, parse as sgParse } from '@ast-grep/napi';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';

import type { Language } from './language.js';

const registered = new Set<Language>();

function ensureCRegistered(): void {
  if (registered.has('c')) {
    return;
  }
  registered.add('c');

  const require = createRequire(import.meta.url);
  const pkgDir = path.dirname(require.resolve('tree-sitter-c/package.json'));
  const platform = os.platform();
  const arch = os.arch();
  const libPath = path.join(pkgDir, 'prebuilds', `${platform}-${arch}`, 'tree-sitter-c.node');

  registerDynamicLanguage({
    c: {
      libraryPath: libPath,
      extensions: ['c', 'h'],
      languageSymbol: 'tree_sitter_c',
    },
  });
}

async function ensureCppRegistered(): Promise<void> {
  if (registered.has('cpp')) {
    return;
  }
  registered.add('cpp');

  // @ast-grep/lang-cpp exports a LangRegistration object with the correct
  // libraryPath, extensions, and languageSymbol for the platform.
  const cppLang = await import('@ast-grep/lang-cpp');
  registerDynamicLanguage({ cpp: cppLang.default });
}

function ensurePascalRegistered(): void {
  if (registered.has('pascal')) {
    return;
  }
  registered.add('pascal');

  const require = createRequire(import.meta.url);
  const pkgDir = path.dirname(require.resolve('tree-sitter-pascal/package.json'));
  // tree-sitter-pascal builds via node-gyp into build/Release/
  const libPath = path.join(pkgDir, 'build', 'Release', 'tree_sitter_pascal_binding.node');

  registerDynamicLanguage({
    pascal: {
      libraryPath: libPath,
      extensions: ['pas', 'pp'],
      languageSymbol: 'tree_sitter_pascal',
    },
  });
}

/**
 * Ensure the grammar for a language is registered.
 * C and Pascal are synchronous; C++ requires an async import.
 */
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
  }
}

/** Parse C source code into an ast-grep SgRoot. */
export function parseC(source: string): SgRoot {
  ensureCRegistered();
  return sgParse('c', source);
}

/**
 * Parse source code in the given language into an ast-grep SgRoot.
 * The language grammar must already be registered via ensureLanguageRegistered().
 */
export function parse(language: Language, source: string): SgRoot {
  // Synchronous registration for C and Pascal as a convenience —
  // callers should have already called ensureLanguageRegistered() during init.
  if (language === 'c') {
    ensureCRegistered();
  } else if (language === 'pascal') {
    ensurePascalRegistered();
  }
  // For C++, the caller MUST have called ensureLanguageRegistered('cpp') first.
  return sgParse(language, source);
}
