import type { AnalyzerFinding } from "@/lib/analyzers/types";

export type RiskTier = "P0-autofix-safe" | "P1-needs-review" | "P2-informational";

export type ScoredFinding = {
  finding: AnalyzerFinding;
  source: "security" | "dependencies" | "deadcode" | "secrets" | "tests" | "maintenance";
  confidence: "high" | "medium" | "low";
  autofixable: boolean;
  /** Repository-relative file path this finding acts on (dead-code removals). */
  path?: string;
  risk: number;
  tier: RiskTier;
};

const SEVERITY_WEIGHT: Record<AnalyzerFinding["severity"], number> = {
  Critical: 100,
  High: 60,
  Medium: 25,
  Low: 8,
};

const SOURCE_WEIGHT: Record<ScoredFinding["source"], number> = {
  secrets: 1.5,
  security: 1.4,
  dependencies: 1.1,
  tests: 0.8,
  maintenance: 0.7,
  deadcode: 0.5,
};

const CONFIDENCE_FACTOR = { high: 1, medium: 0.6, low: 0.3 } as const;

function tierFor(
  risk: number,
  autofixable: boolean,
  confidence: ScoredFinding["confidence"],
  source: ScoredFinding["source"]
): RiskTier {
  // P0 is safety-gated, not impact-gated: high-confidence, autofixable work
  // is eligible when it is either high-risk OR inherently low-blast-radius
  // and fully revertible (dead-code file removal = one revert to undo).
  if (autofixable && confidence === "high" && (risk >= 40 || source === "deadcode")) {
    return "P0-autofix-safe";
  }
  if (risk >= 25) return "P1-needs-review";
  return "P2-informational";
}

/** Deterministic risk score 0..150. Pure function — easy to unit test. */
export function scoreFinding(input: Omit<ScoredFinding, "risk" | "tier">): ScoredFinding {
  const base = SEVERITY_WEIGHT[input.finding.severity] ?? 10;
  const risk = Math.round(base * (SOURCE_WEIGHT[input.source] ?? 1) * CONFIDENCE_FACTOR[input.confidence]);
  return { ...input, risk, tier: tierFor(risk, input.autofixable, input.confidence, input.source) };
}

export function prioritizeFindings(items: Array<Omit<ScoredFinding, "risk" | "tier">>): ScoredFinding[] {
  return items.map(scoreFinding).sort((a, b) => b.risk - a.risk);
}

/** Only P0 items may open automated PRs without human triage. */
export function prEligible(items: ScoredFinding[]): ScoredFinding[] {
  return items.filter((i) => i.tier === "P0-autofix-safe");
}
