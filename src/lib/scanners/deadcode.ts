import type { GitHubTree } from "@/lib/github-app";
import type { AnalyzerFinding, AnalyzerResult } from "@/lib/analyzers/types";

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go"]);
const TEST_HINT = /(^|\/)(__tests__|tests?|spec|e2e)($|\/)|\.test\.|\.spec\.|_test\.go$/;
const ENTRY_HINT = /(^|\/)(index|main|app|server|cli|_app|page|layout|route|middleware)\./;
const BARREL_HINT = /(^|\/)index\.(ts|tsx|js|jsx|mjs)$/;

function extOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot).toLowerCase() : "";
}

function isSourceFile(path: string): boolean {
  if (!path || path.includes("node_modules") || path.startsWith(".next/") || path.startsWith("dist/")) return false;
  return SOURCE_EXT.has(extOf(path));
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/** Candidate dead-code signal for one unreferenced source file. */
export type DeadCodeCandidate = {
  path: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  autofixable: boolean;
};

/**
 * Heuristic dead-code scan over a GitHub file tree + optional file contents.
 * Safe by design: never flags entry points, barrels, tests, configs, or
 * files with dynamic-import markers. Only `high` confidence is PR-eligible.
 *
 * @param tree Git tree from GitHub API (recursive).
 * @param readFile Optional async reader (path -> text | null) for import-graph check.
 */
export async function findDeadCodeCandidates(
  tree: GitHubTree | null,
  readFile?: (path: string, maxBytes?: number) => Promise<string | null>
): Promise<DeadCodeCandidate[]> {
  if (!tree) return [];
  const sources = tree.tree.filter((e) => e.type === "blob" && isSourceFile(e.path)).map((e) => e.path);
  if (sources.length === 0) return [];

  const testFiles = new Set(sources.filter((p) => TEST_HINT.test(p)));
  const appFiles = sources.filter((p) => !testFiles.has(p));

  // Build a cheap reference index: basename (no ext) -> count of textual mentions.
  const contents = new Map<string, string>();
  if (readFile) {
    const capped = appFiles.slice(0, 120); // rate-limit guard for large repos
    await Promise.all(
      capped.map(async (p) => {
        try {
          const text = await readFile(p, 64_000);
          if (text) contents.set(p, text.slice(0, 64_000));
        } catch {
          // Single-file read failure degrades that file only.
        }
      })
    );
  }

  const candidates: DeadCodeCandidate[] = [];
  for (const file of appFiles) {
    if (ENTRY_HINT.test(file) || BARREL_HINT.test(file)) continue;
    if (/(^|\/)config(\.|$)|(^|\/)\.eslint|tailwind|postcss|next\.config/.test(file)) continue;

    const base = baseName(file).replace(/\.[^.]+$/, "");
    if (base.length <= 1) continue;

    let references = 0;
    let hasDynamicMarker = false;
    for (const [other, text] of contents) {
      if (other === file) continue;
      if (text.includes(base)) references += 1;
      if (text.includes("import(") && text.includes(base)) hasDynamicMarker = true;
      if (references >= 2) break;
    }

    // Without file contents we can only report size/age-style hints as low confidence.
    if (contents.size === 0) {
      if (/\/(unused|deprecated|legacy|old|backup|copy|tmp)[-_\/]/i.test(file)) {
        candidates.push({
          path: file,
          reason: "Suspicious directory/name marker (unused/deprecated/legacy) with no import-graph data — manual review required.",
          confidence: "low",
          autofixable: false,
        });
      }
      continue;
    }

    const body = contents.get(file) ?? "";
    if (/\/\/\s*keep|@keep|side-effect|polyfill/i.test(body)) continue;
    if (/import\s*\(|require\s*\(.*\+|eval\s*\(/.test(body)) continue; // dynamic loading nearby
    if (hasDynamicMarker) continue;

    if (references === 0 && !ENTRY_HINT.test(file)) {
      const small = (body.length ?? 0) < 4000;
      candidates.push({
        path: file,
        reason: `No static import/reference to "${base}" found in ${contents.size} scanned files.`,
        confidence: small ? "high" : "medium",
        autofixable: small,
      });
    }
  }

  return candidates.slice(0, 25);
}

export function toDeadCodeAnalyzerResult(candidates: DeadCodeCandidate[], scannedFiles: number): AnalyzerResult {
  const high = candidates.filter((c) => c.confidence === "high");
  const findings: AnalyzerFinding[] = candidates.slice(0, 6).map((c) => ({
    title: `Possible dead code: ${c.path}`,
    severity: c.confidence === "high" ? "Low" : "Low",
    description: `${c.reason} [${c.confidence} confidence]`,
  }));
  const score = candidates.length === 0 ? 95 : high.length === 0 ? 80 : Math.max(40, 90 - high.length * 10);
  return {
    id: "deadcode",
    label: "Dead code",
    status: high.length > 0 ? "warn" : candidates.length > 0 ? "warn" : "pass",
    score,
    value: candidates.length === 0 ? "no candidates" : `${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`,
    trend: `scanned ${scannedFiles} files`,
    detail:
      candidates.length === 0
        ? `Import-graph scan of ${scannedFiles} files found no unreferenced modules.`
        : `${candidates.length} unreferenced-file candidates (${high.length} high confidence, PR-eligible).`,
    findings,
    actions:
      high.length > 0
        ? [`Review and remove ${high.length} high-confidence dead file${high.length === 1 ? "" : "s"} via a gated cleanup PR.`]
        : candidates.length > 0
          ? ["Manually review low/medium-confidence candidates before removal."]
          : ["No dead-code action needed."],
    metadata: { candidates, scannedFiles, prEligible: high.length },
  };
}
