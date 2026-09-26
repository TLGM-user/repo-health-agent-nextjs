export type AnalyzerId = "security" | "dependencies" | "tests" | "maintenance";

export type AnalyzerStatus = "pass" | "warn" | "fail" | "unknown";

export type AnalyzerFinding = {
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  description: string;
};

/**
 * Result of a single analyzer.
 *
 * `score` is 0-100, or `null` when the analyzer could not produce a meaningful
 * score (missing permission, feature disabled upstream, unsupported ecosystem).
 * Null scores are excluded from the weighted overall score instead of silently
 * dragging it down.
 */
export type AnalyzerResult = {
  id: AnalyzerId;
  label: string;
  status: AnalyzerStatus;
  score: number | null;
  /** Short display value for the dashboard check card. */
  value: string;
  /** Short trend/qualifier line for the dashboard check card. */
  trend: string;
  /** Human-readable explanation of how the score was derived. */
  detail: string;
  findings: AnalyzerFinding[];
  actions: string[];
  metadata: Record<string, unknown>;
};

export type AnalyzerInput = {
  repo: string;
  ref: string;
  token?: string;
};
