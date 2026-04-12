/**
 * Wraps a shell-based compiler command for use in the mutation pipeline.
 */
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Language } from '~/language.js';
import type { CompileResult } from '~/types.js';

/** Map Language to file extension used for temp source files. */
const LANG_EXT: Record<Language, string> = {
  c: '.c',
  cpp: '.cpp',
  pascal: '.pas',
};

export class Compiler {
  #command: string;
  #cwd: string;
  #functionName: string;
  #signal?: AbortSignal;
  #sourcePrefix: string;
  #ext: string;
  #tmpDirPromise: Promise<string> | null = null;
  #compileCounter = 0;
  #inFlight = new Set<Promise<CompileResult>>();

  constructor(opts: {
    command: string;
    cwd: string;
    functionName: string;
    language?: Language;
    signal?: AbortSignal;
    sourcePrefix?: string;
  }) {
    this.#command = opts.command;
    this.#cwd = opts.cwd;
    this.#functionName = opts.functionName;
    this.#signal = opts.signal;
    this.#sourcePrefix = opts.sourcePrefix ?? '';
    this.#ext = LANG_EXT[opts.language ?? 'c'];
  }

  /**
   * Ensure the shared temp directory exists.
   */
  #ensureTmpDir(): Promise<string> {
    if (!this.#tmpDirPromise) {
      this.#tmpDirPromise = fs.mkdtemp(path.join(os.tmpdir(), 'transmuter-'));
    }
    return this.#tmpDirPromise;
  }

  /**
   * Compile a source code to an object file.
   */
  compile(source: string): Promise<CompileResult> {
    const promise = this.#compileInner(source);
    this.#inFlight.add(promise);
    void promise.finally(() => this.#inFlight.delete(promise));
    return promise;
  }

  async #compileInner(source: string): Promise<CompileResult> {
    if (this.#signal?.aborted) {
      return { success: false, error: 'Aborted' };
    }

    let inputPath = '';
    let outputPath = '';
    try {
      const tmpDir = await this.#ensureTmpDir();
      const id = this.#compileCounter++;
      inputPath = path.join(tmpDir, `input-${id}${this.#ext}`);
      outputPath = path.join(tmpDir, `output-${id}.o`);

      await fs.writeFile(inputPath, this.#sourcePrefix + source);

      const rendered = this.#command
        .replaceAll('{{inputPath}}', inputPath)
        .replaceAll('{{outputPath}}', outputPath)
        .replaceAll('{{functionName}}', this.#functionName);

      const result = await this.#exec(rendered);

      await fs.unlink(inputPath).catch(() => {});

      if (result.exitCode !== 0) {
        await fs.unlink(outputPath).catch(() => {});
        return {
          success: false,
          error: result.stderr.trim() || result.stdout.trim() || `Compiler exited with code ${result.exitCode}`,
        };
      }

      try {
        await fs.access(outputPath);
      } catch {
        return { success: false, error: 'Compiler produced no output file' };
      }

      return { success: true, objPath: outputPath };
    } catch (err) {
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Clean up a compiled object file. */
  static async cleanup(objPath: string): Promise<void> {
    await fs.unlink(objPath).catch(() => {});
  }

  /** Remove the shared temp directory. Called on shutdown. */
  async destroy(): Promise<void> {
    // Wait for any in-flight compiles before wiping the tmp dir from under them.
    if (this.#inFlight.size > 0) {
      await Promise.allSettled([...this.#inFlight]);
    }

    if (this.#tmpDirPromise) {
      const dir = await this.#tmpDirPromise.catch(() => null);
      this.#tmpDirPromise = null;
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  #exec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      // `detached: true` puts the child in its own process group so we can
      // `kill(-pgid)` grandchildren on abort. Without it, aborting a command
      // like `gcc … && as …` would kill the shell but leave the compiler
      // running.
      const proc = spawn('/bin/sh', ['-c', command], {
        cwd: this.#cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });

      let stdout = '';
      let stderr = '';
      let stdoutTruncated = false;
      let stderrTruncated = false;

      proc.stdout.on('data', (data: Buffer) => {
        if (stdoutTruncated) {
          return;
        }
        stdout += data.toString();
        if (stdout.length > 50_000) {
          stdout = stdout.slice(0, 50_000) + '\n... (truncated)';
          stdoutTruncated = true;
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        if (stderrTruncated) {
          return;
        }
        stderr += data.toString();
        if (stderr.length > 50_000) {
          stderr = stderr.slice(0, 50_000) + '\n... (truncated)';
          stderrTruncated = true;
        }
      });

      const onAbort = () => {
        try {
          if (proc.pid !== undefined) {
            // Negative pid → signal the whole process group.
            process.kill(-proc.pid, 'SIGTERM');
          }
        } catch {
          /* already dead */
        }
      };
      this.#signal?.addEventListener('abort', onAbort, { once: true });

      proc.on('close', (code) => {
        this.#signal?.removeEventListener('abort', onAbort);
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });

      proc.on('error', (err) => {
        this.#signal?.removeEventListener('abort', onAbort);
        resolve({ exitCode: 1, stdout, stderr: err.message });
      });
    });
  }
}
