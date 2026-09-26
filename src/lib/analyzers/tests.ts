import type { GitHubTree } from "@/lib/github-app";
import type { AnalyzerFinding, AnalyzerResult } from "./types";

const TEST_PATTERNS = [
  /\.(test|spec)\.[cm]?[jt]sx?$/i, // foo.test.ts, foo.spec.js
  /\.(test|spec)\.py$/i, // test_foo style via directory match below too
  /_test\.go$/i, // foo_test.go
  /_spec\.rb$/i, // foo_spec.rb
  /^test_[^/]*\.py$/i, // test_foo.py
  /(^|\/)(tests?|__tests__|spec)\//, // test directories
];

const SOURCE_EXTENSIONS =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|php|java|kt|swift|cs|scala|cpp|cc|c|h|hpp)$/i;

const WORKFLOW_PATTERN = /^\.github\/workflows\/[^/]+\.ya?ml$/i;

function isExcludedPath(path: string) {
  return /(^|\/)(node_modules|dist|build|vendor|\.next|__pycache__|coverage|fixtures?)\//.test(path);
}

export function isTestPath(path: string) {
  return TEST_PATTERNS.some((pattern) => pattern.test(path));
}

export function runTestsAnalyzer(tree: GitHubTree | null): AnalyzerResult {
  if (!tree) {
    return {
      id: "tests",
      label: "Test coverage",
      status: "unknown",
      score: null,
      value: "Unavailable",
      trend: "file tree unreadable",
      detail: "The repository file tree could not be fetched, so test files were not counted.",
      findings: [],
      actions: [],
      metadata: {},
    };
  }

  const blobs = tree.tree.filter((entry) => entry.type === "blob" && !isExcludedPath(entry.path));

  const testFiles = blobs.filter((entry) => isTestPath(entry.path)).length;
  const sourceFiles = blobs.filter((entry) => SOURCE_EXTENSIONS.test(entry.path)).length;
  const hasCiWorkflow = blobs.some((entry) => WORKFLOW_PATTERN.test(entry.path));
  const ratio = sourceFiles > 0 ? testFiles / sourceFiles : 0;
  const ratioPercent = Math.round(ratio * 100);

  const metadata = { testFiles, sourceFiles, ratio: Number(ratio.toFixed(3)), hasCiWorkflow, treeTruncated: tree.truncated };

  if (testFiles === 0) {
    const finding: AnalyzerFinding = {
      title: "No test files detected",
      severity: "High",
      description:
        "No files matched test naming conventions (test/, __tests__/, *.test.*, *_test.go, etc.) anywhere in the repository tree.",
    };
    return {
      id: "tests",
      label: "Test coverage",
      status: "fail",
      score: 25,
      value: "0 test files",
      trend: hasCiWorkflow ? "CI present, no tests" : "no tests, no CI",
      detail:
        "Scanned the full file tree: zero test files detected. Add tests around the highest-risk modules first.",
      findings: [finding],
      actions: [
        "Add a test suite for the highest-risk business logic and wire it into CI.",
        ...(hasCiWorkflow ? [] : ["Create a CI workflow so tests run on every pull request."]),
      ],
      metadata,
    };
  }

  // 55 baseline + up to 40 for test-to-source density, ±5 for CI presence.
  const score = Math.max(25, Math.min(98, Math.round(55 + Math.min(40, ratio * 160) + (hasCiWorkflow ? 5 : -5))));
  const status: AnalyzerResult["status"] = score >= 80 ? "pass" : score >= 60 ? "warn" : "fail";

  const findings: AnalyzerFinding[] = [];
  if (ratio < 0.05) {
    findings.push({
      title: "Thin test-to-source ratio",
      severity: "Medium",
      description: `Only ${testFiles} test file${testFiles === 1 ? "" : "s"} for ${sourceFiles} source files (${ratioPercent}%).`,
    });
  }
  if (!hasCiWorkflow) {
    findings.push({
      title: "No CI workflow detected",
      severity: "Low",
      description: "Tests exist but there is no .github/workflows definition to run them automatically.",
    });
  }

  const actions: string[] = [];
  if (ratio < 0.05) actions.push("Grow coverage around untested modules — target at least a 10% test-file ratio.");
  if (!hasCiWorkflow) actions.push("Add a CI workflow that runs the test suite on every pull request.");
  if (actions.length === 0) actions.push("Coverage signal looks healthy — keep tests close to the code they protect.");

  return {
    id: "tests",
    label: "Test coverage",
    status,
    score,
    value: `${testFiles} test file${testFiles === 1 ? "" : "s"}`,
    trend: `${ratioPercent}% of code files${hasCiWorkflow ? " · CI workflows" : " · no CI"}`,
    detail: `Scanned ${blobs.length} tracked files: ${testFiles} test files against ${sourceFiles} source files${hasCiWorkflow ? ", with CI workflows configured" : ", no CI workflows found"}.`,
    findings,
    actions,
    metadata,
  };
}
