import { describe, expect, it, vi } from 'vitest';
import { Compiler } from '~/compiler/compiler.js';
import type { Deduplicator } from '~/pipeline/deduplicator.js';
import { Pool } from '~/pipeline/pool.js';
import { Rng } from '~/rng.js';
import { AdaptiveSelector } from '~/rules/adaptive-selector.js';
import type { MutationEngine } from '~/rules/engine.js';
import type {
  AssemblyScoreResult,
  CompileResult,
  DiffBreakdown,
  MutationResult,
  MutationSearchEvent,
} from '~/types.js';

import { SlotOrchestrator, type SlotOrchestratorOptions, type SlotScorer } from './slot-orchestrator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ZERO_BREAKDOWN: DiffBreakdown = {
  total: 0,
  insert: 0,
  delete: 0,
  replace: 0,
  opMismatch: 0,
  argMismatch: 0,
};

function makeBreakdown(total: number): DiffBreakdown {
  return { ...ZERO_BREAKDOWN, total };
}

function makeAssemblyResult(score: number): AssemblyScoreResult {
  return { score, assembly: '', assemblyDiff: '', breakdown: makeBreakdown(score) };
}

function makeMutation(source: string, ruleId = 'test-rule'): MutationResult {
  return { source, ruleIds: [ruleId], location: { line: 1, column: 1 } };
}

interface GenesisIds {
  candidateId: string;
  targetId: string;
}

function createPool(initialScore = 10): { pool: Pool; genesis: GenesisIds } {
  const pool = new Pool(new Rng(42));
  const { candidate, target } = pool.init('int main() { return 0; }', initialScore, {
    assembly: '',
    assemblyDiff: '',
    breakdown: makeBreakdown(initialScore),
  });
  return { pool, genesis: { candidateId: candidate.id, targetId: target.id } };
}

// ---------------------------------------------------------------------------
// Mock builders. Each returns a properly-shaped object cast to the production
// interface so individual tests don't need their own type-bypass casts.
// ---------------------------------------------------------------------------

function makeEngineMock(
  config: { source?: string | (() => string); ruleId?: string; alwaysNull?: boolean } = {},
): MutationEngine {
  let counter = 0;
  return {
    mutate: vi.fn(() => {
      if (config.alwaysNull) {
        return null;
      }
      counter++;
      const source =
        typeof config.source === 'function' ? config.source() : (config.source ?? `int main() { return ${counter}; }`);
      return makeMutation(source, config.ruleId);
    }),
  } as unknown as MutationEngine;
}

function makeCompilerMock(config: { succeed?: boolean; errorMessage?: string; delayMs?: number } = {}): Compiler {
  const succeed = config.succeed ?? true;
  return {
    compile: vi.fn(async (): Promise<CompileResult> => {
      if (config.delayMs) {
        await new Promise((r) => setTimeout(r, config.delayMs));
      }
      if (!succeed) {
        return { success: false, error: config.errorMessage ?? 'mock compile error' };
      }
      return { success: true, objPath: '/tmp/slot-orchestrator-test.o' };
    }),
  } as unknown as Compiler;
}

function makeScorerMock(score: number | (() => number)): SlotScorer {
  return {
    scoreWithAssembly: vi.fn(async () => makeAssemblyResult(typeof score === 'function' ? score() : score)),
  };
}

function makeDeduplicatorMock(config: { hits?: boolean | (() => boolean) } = {}): Deduplicator {
  const hits = config.hits ?? false;
  return {
    checkAndAdd: vi.fn(() => (typeof hits === 'function' ? hits() : hits)),
  } as unknown as Deduplicator;
}

// ---------------------------------------------------------------------------
// Orchestrator builder. Sensible defaults; override only what the test cares about.
// ---------------------------------------------------------------------------

interface MakeOrchestratorOverrides extends Partial<Omit<SlotOrchestratorOptions, 'engineFactory'>> {
  /** Shorthand: provide a single engine instead of a factory. */
  engine?: MutationEngine;
  engineFactory?: SlotOrchestratorOptions['engineFactory'];
}

interface MakeOrchestratorResult {
  orchestrator: SlotOrchestrator;
  pool: Pool;
  events: MutationSearchEvent[];
  adaptiveSelector: AdaptiveSelector;
  /** IDs of the genesis candidate/target the pool was initialized with. */
  genesis: GenesisIds;
}

function makeOrchestrator(overrides: MakeOrchestratorOverrides = {}): MakeOrchestratorResult {
  const events: MutationSearchEvent[] = [];

  let pool: Pool;
  let genesis: GenesisIds;
  if (overrides.pool) {
    // Caller provided a pool — derive the genesis from its current state.
    // For a freshly initialized pool, getAllCandidates()[0] is the genesis.
    pool = overrides.pool;
    const firstCandidate = pool.getAllCandidates()[0];
    const firstTarget = pool.getActiveTargets()[0];
    if (!firstCandidate || !firstTarget) {
      throw new Error('makeOrchestrator: provided pool has no genesis candidate/target');
    }
    genesis = { candidateId: firstCandidate.id, targetId: firstTarget.id };
  } else {
    const created = createPool();
    pool = created.pool;
    genesis = created.genesis;
  }

  const adaptiveSelector = overrides.adaptiveSelector ?? new AdaptiveSelector();
  const engineFactory = overrides.engineFactory ?? (() => overrides.engine ?? makeEngineMock());

  const orchestrator = new SlotOrchestrator({
    pool,
    engineFactory,
    compiler: overrides.compiler ?? makeCompilerMock(),
    scorer: overrides.scorer ?? makeScorerMock(15), // worse than default initial 10 → no fork by default
    deduplicator: overrides.deduplicator ?? makeDeduplicatorMock(),
    functionName: overrides.functionName ?? 'main',
    adaptiveSelector,
    concurrency: overrides.concurrency ?? 1,
    maxIterations: overrides.maxIterations ?? 50,
    timeoutMs: overrides.timeoutMs ?? Infinity,
    mutationDepth: overrides.mutationDepth ?? 1,
    statsInterval: overrides.statsInterval ?? 10_000,
    onEvent: overrides.onEvent ?? ((e) => events.push(e)),
    signal: overrides.signal ?? new AbortController().signal,
    candidateFilter: overrides.candidateFilter,
    scoreTransform: overrides.scoreTransform,
    maxUnproductiveIterations: overrides.maxUnproductiveIterations,
  });

  return { orchestrator, pool, events, adaptiveSelector, genesis };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlotOrchestrator', () => {
  describe('stop conditions', () => {
    it('stops when maxIterations is reached', async () => {
      const { orchestrator } = makeOrchestrator({ maxIterations: 10 });
      await orchestrator.run();
      expect(orchestrator.getIteration()).toBeGreaterThanOrEqual(10);
      // Single slot can't overshoot beyond 1 — the check fires synchronously after each tick
      expect(orchestrator.getIteration()).toBeLessThanOrEqual(11);
    });

    it('stops when timeoutMs is exceeded', async () => {
      const { orchestrator } = makeOrchestrator({
        timeoutMs: 50,
        maxIterations: Infinity,
        compiler: makeCompilerMock({ delayMs: 5 }),
      });
      const start = Date.now();
      await orchestrator.run();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(1000); // safety net — must not run forever
    });

    it('stops when the abort signal fires', async () => {
      const controller = new AbortController();
      const { orchestrator } = makeOrchestrator({
        signal: controller.signal,
        maxIterations: Infinity,
        compiler: makeCompilerMock({ delayMs: 5 }),
      });
      setTimeout(() => controller.abort(), 30);
      await orchestrator.run();
      expect(controller.signal.aborted).toBe(true);
    });

    it('stops on perfect match (score 0) and emits a perfect-match event', async () => {
      const { orchestrator, events } = makeOrchestrator({ scorer: makeScorerMock(0) });
      await orchestrator.run();
      const perfectMatch = events.find((e) => e.type === 'perfect-match');
      expect(perfectMatch).toBeDefined();
      // Stops on the first iteration that scores 0 — not on maxIterations
      expect(orchestrator.getIteration()).toBeLessThan(5);
    });

    it('stops when signalPerfectMatch() is called externally', async () => {
      const { orchestrator } = makeOrchestrator({
        maxIterations: Infinity,
        compiler: makeCompilerMock({ delayMs: 5 }),
      });
      setTimeout(() => orchestrator.signalPerfectMatch(), 30);
      await orchestrator.run();
      // Did not run forever; iteration count is bounded by how much it managed before the signal
      expect(orchestrator.getIteration()).toBeGreaterThan(0);
    });

    it('stops when maxUnproductiveIterations exhausts without compilation', async () => {
      // Reproduces refine-mode lockup: candidateFilter rejects every mutation,
      // so iteration ticks but compile never runs.
      const { orchestrator } = makeOrchestrator({
        candidateFilter: () => false,
        maxIterations: Infinity,
        maxUnproductiveIterations: 100,
      });
      await orchestrator.run();
      expect(orchestrator.getIteration()).toBeGreaterThanOrEqual(100);
      expect(orchestrator.getIteration()).toBeLessThan(200);
      expect(orchestrator.getCompiledCount()).toBe(0);
    });

    it('does NOT stop on maxUnproductiveIterations when compilations are happening', async () => {
      const { orchestrator } = makeOrchestrator({
        maxIterations: 200,
        maxUnproductiveIterations: 50,
      });
      await orchestrator.run();
      // Reaches maxIterations because compilations are happening
      expect(orchestrator.getCompiledCount()).toBeGreaterThan(50);
    });
  });

  describe('fork lifecycle', () => {
    it('emits a scored event after every successful score', async () => {
      const { orchestrator, events, genesis } = makeOrchestrator({
        scorer: makeScorerMock(15), // no fork
        maxIterations: 3,
      });
      await orchestrator.run();
      const scored = events.filter((e) => e.type === 'scored');
      expect(scored).toHaveLength(3);
      for (const e of scored) {
        if (e.type !== 'scored') {
          continue;
        }
        expect(e.score).toBe(15);
        expect(e.ruleId).toBe('test-rule');
        // No fork has happened, so the genesis target is still the only one being mutated
        expect(e.mutationTargetId).toBe(genesis.targetId);
      }
    });

    it('emits forked + mutation-target-created when score improves', async () => {
      const { orchestrator, events, genesis } = makeOrchestrator({
        scorer: makeScorerMock(5), // genesis pool score is 10
        maxIterations: 1,
      });
      await orchestrator.run();

      const forked = events.find((e) => e.type === 'forked');
      const targetCreated = events.find((e) => e.type === 'mutation-target-created');
      expect(forked).toBeDefined();
      expect(targetCreated).toBeDefined();
      if (forked?.type !== 'forked' || targetCreated?.type !== 'mutation-target-created') {
        return;
      }
      expect(forked.oldScore).toBe(10);
      expect(forked.newScore).toBe(5);
      // The fork's parent must be the candidate that existed before the run
      expect(forked.parentCandidateId).toBe(genesis.candidateId);
      expect(forked.candidateId).toBe(targetCreated.candidateId);
      expect(forked.mutationTargetId).toBe(targetCreated.mutationTargetId);
      expect(targetCreated.origin).toBe('organic');
    });

    it('does NOT emit forked when score does not improve', async () => {
      const { orchestrator, events } = makeOrchestrator({
        scorer: makeScorerMock(10), // equal to initial — no improvement, no lateral budget
        maxIterations: 1,
      });
      await orchestrator.run();
      expect(events.find((e) => e.type === 'scored')).toBeDefined();
      expect(events.find((e) => e.type === 'forked')).toBeUndefined();
      expect(events.find((e) => e.type === 'mutation-target-created')).toBeUndefined();
    });
  });

  describe('adaptive selector integration', () => {
    it('records success=true and forks the selector when a fork happens', async () => {
      const adaptiveSelector = new AdaptiveSelector();
      const recordSpy = vi.spyOn(adaptiveSelector, 'record');
      const forkSpy = vi.spyOn(adaptiveSelector, 'fork');
      const { orchestrator, genesis } = makeOrchestrator({
        adaptiveSelector,
        scorer: makeScorerMock(5),
        maxIterations: 1,
      });
      await orchestrator.run();
      expect(recordSpy).toHaveBeenCalledWith(genesis.targetId, 'test-rule', true);
      expect(forkSpy).toHaveBeenCalledTimes(1);
      // The selector is forked from the genesis target onto the new (forked) target
      expect(forkSpy).toHaveBeenCalledWith(genesis.targetId, expect.any(String));
    });

    it('records success=false and does NOT fork the selector when no fork happens', async () => {
      const adaptiveSelector = new AdaptiveSelector();
      const recordSpy = vi.spyOn(adaptiveSelector, 'record');
      const forkSpy = vi.spyOn(adaptiveSelector, 'fork');
      const { orchestrator, genesis } = makeOrchestrator({
        adaptiveSelector,
        scorer: makeScorerMock(15),
        maxIterations: 1,
      });
      await orchestrator.run();
      expect(recordSpy).toHaveBeenCalledWith(genesis.targetId, 'test-rule', false);
      expect(forkSpy).not.toHaveBeenCalled();
    });
  });

  describe('compile failures', () => {
    it('records failure to pool and emits compilation-error', async () => {
      const { pool, genesis } = createPool();
      const recordFailureSpy = vi.spyOn(pool, 'recordFailure');
      const { orchestrator, events } = makeOrchestrator({
        pool,
        compiler: makeCompilerMock({ succeed: false, errorMessage: 'syntax error' }),
        maxIterations: 1,
      });
      await orchestrator.run();
      expect(recordFailureSpy).toHaveBeenCalledWith(genesis.targetId);
      const errorEvent = events.find((e) => e.type === 'compilation-error');
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type !== 'compilation-error') {
        return;
      }
      expect(errorEvent.error).toBe('syntax error');
      expect(errorEvent.ruleId).toBe('test-rule');
      expect(errorEvent.mutationTargetId).toBe(genesis.targetId);
    });

    it('does not increment compiled count on failure', async () => {
      const { orchestrator } = makeOrchestrator({
        compiler: makeCompilerMock({ succeed: false }),
        maxIterations: 5,
      });
      await orchestrator.run();
      expect(orchestrator.getCompiledCount()).toBe(0);
    });
  });

  describe('score transform', () => {
    it('uses the transformed score for fork decisions', async () => {
      // Raw asm score is 20 (worse than initial 10, would NOT fork).
      // Transform overrides it to 3 (better than 10, SHOULD fork).
      const { orchestrator, events } = makeOrchestrator({
        scorer: makeScorerMock(20),
        scoreTransform: () => 3,
        maxIterations: 1,
      });
      await orchestrator.run();
      const forked = events.find((e) => e.type === 'forked');
      expect(forked).toBeDefined();
      if (forked?.type !== 'forked') {
        return;
      }
      expect(forked.newScore).toBe(3);
    });

    it('passes the mutation source to scoreTransform', async () => {
      const transform = vi.fn(() => 10);
      const { orchestrator } = makeOrchestrator({
        engine: makeEngineMock({ source: 'transformed source' }),
        scorer: makeScorerMock(10),
        scoreTransform: transform,
        maxIterations: 1,
      });
      await orchestrator.run();
      expect(transform).toHaveBeenCalledWith('transformed source', expect.objectContaining({ score: 10 }));
    });
  });

  describe('iteration accounting', () => {
    it('does not tick the iteration counter when engine.mutate returns null', async () => {
      // mutate returning null is the "no rule could apply" case — happens in production
      // when avoid regions or filters reject every candidate at the rule level.
      let mutateCalls = 0;
      const engine = {
        mutate: vi.fn(() => {
          mutateCalls++;
          return null;
        }),
      } as unknown as MutationEngine;

      const { orchestrator } = makeOrchestrator({
        engine,
        timeoutMs: 50,
        maxIterations: Infinity,
      });
      await orchestrator.run();

      expect(mutateCalls).toBeGreaterThan(10); // many calls happened
      expect(orchestrator.getIteration()).toBe(0); // but iteration never advanced
    });

    it('skips compile and score on dedup hits, but iteration still advances', async () => {
      const scorer = makeScorerMock(10);
      const { orchestrator } = makeOrchestrator({
        deduplicator: makeDeduplicatorMock({ hits: true }),
        scorer,
        maxIterations: 5,
      });
      await orchestrator.run();
      expect(orchestrator.getIteration()).toBeGreaterThanOrEqual(5);
      expect(orchestrator.getCompiledCount()).toBe(0);
      expect(scorer.scoreWithAssembly).not.toHaveBeenCalled();
    });

    it('shares the iteration counter across concurrent slots', async () => {
      const { orchestrator } = makeOrchestrator({
        concurrency: 4,
        maxIterations: 30,
      });
      await orchestrator.run();
      // Each slot increments the shared counter; total caps near maxIterations
      // (with a small overshoot from in-flight slots when the threshold trips).
      expect(orchestrator.getIteration()).toBeGreaterThanOrEqual(30);
      expect(orchestrator.getIteration()).toBeLessThan(60);
    });
  });

  describe('pause/resume', () => {
    it('does not advance the iteration counter while paused', async () => {
      const { orchestrator } = makeOrchestrator({
        maxIterations: Infinity,
        timeoutMs: 5000, // safety net only
      });

      orchestrator.pause();
      const runPromise = orchestrator.run();

      // Slot should park immediately at #waitIfPaused before any iteration
      await new Promise((r) => setTimeout(r, 50));
      expect(orchestrator.getIteration()).toBe(0);

      // signalPerfectMatch wakes the parked slot AND tells it to stop
      orchestrator.signalPerfectMatch();
      await runPromise;

      expect(orchestrator.getIteration()).toBe(0);
    });

    it('resume() lets a paused slot continue', async () => {
      const { orchestrator } = makeOrchestrator({
        maxIterations: 5,
      });

      orchestrator.pause();
      const runPromise = orchestrator.run();

      await new Promise((r) => setTimeout(r, 30));
      expect(orchestrator.getIteration()).toBe(0);

      orchestrator.resume();
      await runPromise;

      expect(orchestrator.getIteration()).toBe(5);
    });
  });

  describe('event handler resilience', () => {
    it('continues processing when onEvent throws', async () => {
      let throwCount = 0;
      const { orchestrator } = makeOrchestrator({
        onEvent: () => {
          throwCount++;
          throw new Error('consumer bug');
        },
        maxIterations: 5,
      });
      await orchestrator.run();
      expect(throwCount).toBeGreaterThan(0);
      expect(orchestrator.getIteration()).toBe(5);
    });
  });

  describe('stats events', () => {
    it('emits a stats event every statsInterval iterations', async () => {
      const { orchestrator, events } = makeOrchestrator({
        statsInterval: 5,
        maxIterations: 15,
      });
      await orchestrator.run();
      const stats = events.filter((e) => e.type === 'stats');
      // Iterations 5, 10, 15 each trigger a stats emission
      expect(stats.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('engine factory', () => {
    it('calls engineFactory once per slot with sequential indices', async () => {
      const slotIndices: number[] = [];
      const controller = new AbortController();
      const { orchestrator } = makeOrchestrator({
        signal: controller.signal,
        concurrency: 4,
        engineFactory: (slotIndex) => {
          slotIndices.push(slotIndex);
          return {
            mutate: () => {
              controller.abort();
              return null;
            },
          } as unknown as MutationEngine;
        },
      });
      await orchestrator.run();
      expect(slotIndices).toEqual([0, 1, 2, 3]);
    });
  });
});
