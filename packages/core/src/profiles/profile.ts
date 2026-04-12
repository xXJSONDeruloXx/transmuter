/** Compiler profile definition. */
export interface Profile {
  /** Unique profile ID (e.g., 'agbcc') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the target compiler and platform */
  description: string;
  /** Default rule weight overrides for this compiler */
  ruleWeights: Record<string, number>;
  /** Rules to disable entirely for this compiler */
  disabledRules: string[];
  /** Auto-detection: return true if the compiler command matches this profile */
  detect?: (compilerCommand: string) => boolean;
}
