import { fetchFileText, type GitHubTree } from "@/lib/github-app";
import type { AnalyzerFinding, AnalyzerResult } from "./types";

type Ecosystem = "npm" | "pypi" | "golang" | "cargo" | "rubygems" | "packagist";

type ManifestSpec = { file: string; ecosystem: Ecosystem; label: string };

const MANIFESTS: ManifestSpec[] = [
  { file: "package.json", ecosystem: "npm", label: "package.json" },
  { file: "requirements.txt", ecosystem: "pypi", label: "requirements.txt" },
  { file: "pyproject.toml", ecosystem: "pypi", label: "pyproject.toml" },
  { file: "go.mod", ecosystem: "golang", label: "go.mod" },
  { file: "Cargo.toml", ecosystem: "cargo", label: "Cargo.toml" },
  { file: "Gemfile", ecosystem: "rubygems", label: "Gemfile" },
  { file: "composer.json", ecosystem: "packagist", label: "composer.json" },
];

const LOCKFILES = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "Pipfile.lock",
  "go.sum",
  "Cargo.lock",
  "Gemfile.lock",
  "composer.lock",
];

/** Registry freshness checks are capped per scan to stay inside rate limits. */
const MAX_REGISTRY_LOOKUPS = 8;
const LOOKUP_CONCURRENCY = 4;

type Dependency = { name: string; currentVersion: string | null };

type RegistryVerdict = {
  outdatedMajor: number;
  outdatedMinor: number;
  checked: number;
  skipped: number;
  examples: Array<{ name: string; current: string; latest: string; major: boolean }>;
};

function isExcludedPath(path: string) {
  return /(^|\/)(node_modules|dist|build|vendor|\.next|__pycache__|coverage)\//.test(path);
}

function findManifest(tree: GitHubTree): { spec: ManifestSpec; path: string } | null {
  for (const spec of MANIFESTS) {
    const hit = tree.tree.find(
      (entry) =>
        entry.type === "blob" && !isExcludedPath(entry.path) && entry.path.split("/").pop() === spec.file
    );
    if (hit) return { spec, path: hit.path };
  }
  return null;
}

function hasLockfile(tree: GitHubTree) {
  return LOCKFILES.some((lockfile) =>
    tree.tree.some((entry) => entry.type === "blob" && entry.path.split("/").pop() === lockfile)
  );
}

/** Strips npm range prefixes (`^`, `~`, `>=`, workspace:, git urls, ...) leaving a plain version or null. */
function stripNpmRange(version: string): string | null {
  const trimmed = version.trim();
  if (!trimmed || /^(workspace:|file:|link:|git\+|github:|https?:|\*|latest|npm:)/.test(trimmed)) {
    return null;
  }
  const match = trimmed.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match[0] : null;
}

function compareVersions(current: string, latest: string): "major" | "minor" | "same" | "unknown" {
  const a = current.match(/^(\d+)\.(\d+)\.(\d+)/);
  const b = latest.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!a || !b) return "unknown";
  const [aMajor, aMinor, aPatch] = [Number(a[1]), Number(a[2]), Number(a[3])];
  const [bMajor, bMinor, bPatch] = [Number(b[1]), Number(b[2]), Number(b[3])];
  if (bMajor !== aMajor) return bMajor > aMajor ? "major" : "same";
  if (bMinor !== aMinor) return bMinor > aMinor ? "minor" : "same";
  if (bPatch !== aPatch) return bPatch > aPatch ? "minor" : "same";
  return "same";
}

function parseNpmManifest(raw: string): Dependency[] {
  const manifest = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const merged = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  return Object.entries(merged).map(([name, range]) => ({
    name,
    currentVersion: stripNpmRange(range),
  }));
}

function parseRequirementsTxt(raw: string): Dependency[] {
  const dependencies: Dependency[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
    const pinned = trimmed.match(/^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?\s*==\s*([^\s;#]+)/);
    if (pinned) {
      dependencies.push({ name: pinned[1], currentVersion: pinned[2] });
      continue;
    }
    const nameOnly = trimmed.match(/^([A-Za-z0-9._-]+)/);
    if (nameOnly) dependencies.push({ name: nameOnly[1], currentVersion: null });
  }
  return dependencies;
}

/** Light extraction of `dependencies = ["pkg>=1.0", ...]` entries from pyproject.toml. */
function parsePyproject(raw: string): Dependency[] {
  const dependencies: Dependency[] = [];
  const block = raw.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
  const lines = block ? block[1].split(/\r?\n/) : [];
  for (const line of lines) {
    const entry = line.trim().replace(/^["']|["'],?$/g, "");
    const nameMatch = entry.match(/^([A-Za-z0-9._-]+)/);
    if (!nameMatch) continue;
    const pin = entry.match(/==\s*([^\s"',;]+)/);
    dependencies.push({ name: nameMatch[1], currentVersion: pin ? pin[1] : null });
  }
  return dependencies;
}

async function fetchLatestVersion(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: string; info?: { version?: string } };
    return data.version ?? data.info?.version ?? null;
  } catch {
    return null;
  }
}

function registryUrl(ecosystem: Ecosystem, name: string): string | null {
  if (ecosystem === "npm") return `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`;
  if (ecosystem === "pypi") return `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
  return null;
}

async function checkRegistry(dependencies: Dependency[], ecosystem: Ecosystem): Promise<RegistryVerdict> {
  const verdict: RegistryVerdict = {
    outdatedMajor: 0,
    outdatedMinor: 0,
    checked: 0,
    skipped: 0,
    examples: [],
  };

  const candidates = dependencies
    .filter((dep) => dep.currentVersion !== null && registryUrl(ecosystem, dep.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_REGISTRY_LOOKUPS);

  verdict.skipped = dependencies.length - candidates.length;

  for (let index = 0; index < candidates.length; index += LOOKUP_CONCURRENCY) {
    const chunk = candidates.slice(index, index + LOOKUP_CONCURRENCY);

    await Promise.all(
      chunk.map(async (dep) => {
        const url = registryUrl(ecosystem, dep.name);
        if (!url || !dep.currentVersion) return;
        const latest = await fetchLatestVersion(url);
        if (!latest) {
          verdict.skipped += 1;
          return;
        }
        verdict.checked += 1;
        const comparison = compareVersions(dep.currentVersion, latest);
        if (comparison === "unknown") return;
        if (comparison === "same") return;
        const major = comparison === "major";
        if (major) verdict.outdatedMajor += 1;
        else verdict.outdatedMinor += 1;
        if (verdict.examples.length < 3) {
          verdict.examples.push({ name: dep.name, current: dep.currentVersion, latest, major });
        }
      })
    );
  }

  return verdict;
}

export async function runDependenciesAnalyzer(input: {
  repo: string;
  ref: string;
  tree: GitHubTree | null;
  token?: string;
}): Promise<AnalyzerResult> {
  const { repo, ref, tree, token } = input;

  if (!tree) {
    return {
      id: "dependencies",
      label: "Dependencies",
      status: "unknown",
      score: null,
      value: "Unavailable",
      trend: "file tree unreadable",
      detail: "The repository file tree could not be fetched, so manifests were not inspected.",
      findings: [],
      actions: [],
      metadata: {},
    };
  }

  const manifest = findManifest(tree);

  if (!manifest) {
    return {
      id: "dependencies",
      label: "Dependencies",
      status: "unknown",
      score: null,
      value: "No manifest",
      trend: "unsupported ecosystem",
      detail: `No supported manifest found (looked for ${MANIFESTS.map((m) => m.file).join(", ")}).`,
      findings: [],
      actions: [],
      metadata: { supported: MANIFESTS.map((m) => m.file) },
    };
  }

  const { spec, path } = manifest;
  const lockfile = hasLockfile(tree);
  const raw = await fetchFileText(repo, path, ref, token);

  if (raw === null) {
    return {
      id: "dependencies",
      label: "Dependencies",
      status: "unknown",
      score: null,
      value: "Unreadable",
      trend: spec.label,
      detail: `Found ${path} in the tree but its contents could not be read.`,
      findings: [],
      actions: [],
      metadata: { manifestPath: path },
    };
  }

  let dependencies: Dependency[] = [];
  try {
    if (spec.file === "package.json") dependencies = parseNpmManifest(raw);
    else if (spec.file === "requirements.txt") dependencies = parseRequirementsTxt(raw);
    else if (spec.file === "pyproject.toml") dependencies = parsePyproject(raw);
    else dependencies = []; // inventory-only ecosystems (go/cargo/ruby/php) below
  } catch {
    return {
      id: "dependencies",
      label: "Dependencies",
      status: "warn",
      score: lockfile ? 70 : 55,
      value: "Parse error",
      trend: spec.label,
      detail: `${path} could not be parsed; dependency inventory is unavailable for this scan.`,
      findings: [{ title: "Manifest parse failure", severity: "Medium", description: `${path} is not valid JSON/TOML.` }],
      actions: [`Fix ${path} so future scans can inventory dependencies.`],
      metadata: { manifestPath: path, ecosystem: spec.ecosystem },
    };
  }

  const supportsFreshness =
    (spec.ecosystem === "npm" && spec.file === "package.json") ||
    (spec.ecosystem === "pypi" && spec.file === "requirements.txt");

  const verdict = supportsFreshness
    ? await checkRegistry(dependencies, spec.ecosystem)
    : { outdatedMajor: 0, outdatedMinor: 0, checked: 0, skipped: 0, examples: [] };

  const outdated = verdict.outdatedMajor + verdict.outdatedMinor;

  // Scoring: outdated majors weigh most, missing lockfile signals unreproducible builds.
  let score = 100;
  score -= Math.min(40, verdict.outdatedMajor * 8);
  score -= Math.min(15, verdict.outdatedMinor * 3);
  if (!lockfile) score -= 10;
  score = Math.max(15, score);

  const status: AnalyzerResult["status"] =
    verdict.outdatedMajor >= 3
      ? "fail"
      : verdict.outdatedMajor >= 1 || verdict.outdatedMinor >= 5 || !lockfile
        ? "warn"
        : "pass";

  const findings: AnalyzerFinding[] = verdict.examples.map((example) => ({
    title: example.major ? `Major upgrade available: ${example.name}` : `Update available: ${example.name}`,
    severity: example.major ? "High" : "Medium",
    description: `${example.name} ${example.current} → ${example.latest} (registry-verified).`,
  }));

  const actions: string[] = [];
  if (verdict.outdatedMajor > 0) {
    actions.push(`Open an update PR covering ${verdict.outdatedMajor} major upgrade${verdict.outdatedMajor === 1 ? "" : "s"}.`);
  } else if (outdated > 0) {
    actions.push(`Batch the ${outdated} pending minor/patch updates into one dependency PR.`);
  }
  if (!lockfile) actions.push("Commit a lockfile so builds and CI resolve reproducible versions.");
  if (!supportsFreshness && dependencies.length > 0) {
    actions.push(`Freshness verification is automated for npm/PyPI; ${spec.label} is inventoried only.`);
  }
  if (actions.length === 0) actions.push("Dependencies are current and locked — keep the update cadence.");

  const value = supportsFreshness
    ? outdated > 0
      ? `${outdated} of ${verdict.checked} outdated`
      : verdict.checked > 0
        ? `${verdict.checked} up to date`
        : `${dependencies.length} deps`
    : `${dependencies.length} direct deps`;

  return {
    id: "dependencies",
    label: "Dependencies",
    status,
    score,
    value,
    trend: `${spec.label}${lockfile ? " · lockfile" : " · no lockfile"}`,
    detail: supportsFreshness
      ? `Compared ${verdict.checked} pinned dependenc${verdict.checked === 1 ? "y" : "ies"} against the ${
          spec.ecosystem === "npm" ? "npm" : "PyPI"
        } registry${verdict.skipped > 0 ? ` (${verdict.skipped} unpinned or uncapped)` : ""}: ${outdated} outdated.` +
        (lockfile ? "" : " No lockfile found.")
      : `Inventoried ${dependencies.length} direct dependenc${dependencies.length === 1 ? "y" : "ies"} from ${spec.label}` +
        (lockfile ? " with a lockfile present." : "; no lockfile found."),
    findings,
    actions,
    metadata: {
      ecosystem: spec.ecosystem,
      manifestPath: path,
      directDependencies: dependencies.length,
      lockfile,
      registry: supportsFreshness ? { checked: verdict.checked, outdated, skipped: verdict.skipped } : null,
      treeTruncated: tree.truncated,
    },
  };
}
