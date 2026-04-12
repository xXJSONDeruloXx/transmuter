/**
 * Language detection and type definitions.
 */
import path from 'path';

/** Supported source languages. */
export type Language = 'c' | 'cpp' | 'pascal';

const EXTENSION_MAP: Record<string, Language> = {
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.pp': 'pascal',
  '.pas': 'pascal',
};

/** All supported file extensions, for error messages. */
const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_MAP).sort();

/**
 * Detect the source language from a file path's extension.
 * Throws if the extension is not recognized.
 */
export function detectLanguage(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase();
  const lang = EXTENSION_MAP[ext];
  if (!lang) {
    throw new Error(
      `Unsupported file extension '${ext}' for '${path.basename(filePath)}'. ` +
        `Supported extensions: ${SUPPORTED_EXTENSIONS.join(', ')}`,
    );
  }
  return lang;
}
