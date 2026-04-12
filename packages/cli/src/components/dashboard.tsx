/**
 * Live dashboard component for the transmuter match command.
 */
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import React from 'react';

import type { CliState } from '../bridge.js';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function sparkline(values: number[]): string {
  if (values.length === 0) {
    return '';
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const chars = '▁▂▃▄▅▆▇█';
  return values
    .map((v) => {
      const idx = Math.round(((v - min) / range) * (chars.length - 1));
      return chars[idx];
    })
    .join('');
}

interface DashboardProps {
  state: CliState;
  functionName: string;
  profileId: string;
}

export function Dashboard({ state, functionName, profileId }: DashboardProps): React.ReactElement {
  if (state.phase === 'idle') {
    return (
      <Box>
        <Text>
          <Spinner type="dots" /> Initializing...
        </Text>
      </Box>
    );
  }

  if (state.phase === 'completed') {
    return <CompletedView state={state} />;
  }

  const maxIter = state.iteration;
  const improvement = state.baseScore > 0 ? state.baseScore - state.bestScore : 0;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>transmuter</Text>
        <Text>
          {' '}
          — {functionName} — {profileId}
        </Text>
      </Box>

      {/* Score line */}
      <Box>
        <Text>
          Score {'  '}
          <Text color="yellow">{state.baseScore}</Text>
          {' → '}
          <Text color="green" bold>
            {state.bestScore}
          </Text>
          {improvement > 0 && <Text color="green"> ↓{improvement}</Text>}
          {'  '}
          <Spinner type="dots" />
          {'  '}
          Iteration: <Text bold>{maxIter.toLocaleString()}</Text>
        </Text>
      </Box>

      {/* Score history sparkline */}
      {state.scoreHistory.length > 1 && (
        <Box marginTop={1}>
          <Text dimColor>
            {state.baseScore} {sparkline(state.scoreHistory)} {state.bestScore}
          </Text>
        </Box>
      )}

      {/* Mutation targets */}
      {state.targets.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Targets ({state.targets.length})</Text>
          {state.targets.slice(0, 10).map((t) => (
            <Box key={t.id}>
              <Text>
                {'  '}
                {t.id.padEnd(14)} score={String(t.score).padEnd(6)} {!t.enabled && <Text color="red">(disabled)</Text>}
              </Text>
            </Box>
          ))}
          {state.targets.length > 10 && (
            <Box>
              <Text dimColor> ... and {state.targets.length - 10} more</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Stats line */}
      <Box marginTop={1}>
        <Text dimColor>
          {state.compiled} compiled · {state.forkCount} forks · {state.errors} errors · {formatDuration(state.elapsed)}
        </Text>
      </Box>

      {/* Last fork */}
      {state.lastFork && (
        <Box>
          <Text dimColor>
            Last fork: {state.lastFork.oldScore} → {state.lastFork.newScore} via {state.lastFork.ruleId}
          </Text>
        </Box>
      )}

      {/* Auto-compact */}
      {state.lastAutoCompact && (
        <Box>
          <Text dimColor>
            Auto-compact: pruned {state.lastAutoCompact.disabled} stale targets, freed {state.lastAutoCompact.removed}{' '}
            candidates
          </Text>
        </Box>
      )}

      {/* Error */}
      {state.errorMessage && (
        <Box marginTop={1}>
          <Text color="red">Error: {state.errorMessage}</Text>
        </Box>
      )}
    </Box>
  );
}

function CompletedView({ state }: { state: CliState }): React.ReactElement {
  const isPerfect = state.bestScore === 0;

  return (
    <Box flexDirection="column">
      <Box>
        <Text>
          {isPerfect ? (
            <Text color="green" bold>
              ✓ Perfect match!
            </Text>
          ) : (
            <Text color="yellow" bold>
              Done.
            </Text>
          )}
          {'  '}
          Score: <Text bold>{state.bestScore}</Text>
          {'  '}
          Iterations: {state.iteration.toLocaleString()}
          {'  '}
          Time: {formatDuration(state.elapsed)}
        </Text>
      </Box>
      {state.completionReason && state.completionReason !== 'perfect-match' && (
        <Box>
          <Text dimColor>Stopped: {state.completionReason}</Text>
        </Box>
      )}
    </Box>
  );
}
