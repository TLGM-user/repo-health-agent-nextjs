// Safe, redacted secret-pattern scan. Never returns raw secret values.
import type { AnalyzerFinding, AnalyzerResult } from "@/lib/analyzers/types";

export type SecretHit = {
  path: string;
  line: number;
  ruleId: string;
  redactedPreview: string;
  confidence: "high" | "medium";
};

const RULES: Array<{ id: string; pattern: RegExp; confidence: SecretHit["confidence"] }> = [
  { id: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/, confidence: "high" },
  { id: "github-pat", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, confidence: "high" },
  { id: "stripe-live-key", pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/, confidence: "high" },
  { id: "private-key-block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, confidence: "high" },
  { id: "generic-password-assign", pattern: /(password|passwd|pwd|secret)\s*[:=]\s*["'][^"']{8,}["']/i, confidence: "medium" },
];

function redact(line: string, maxLen = 80): string {
  const trimmed = line.trim().slice(0, maxLen);
  // Drop values, keep structure: mask quoted payloads AND bare secret tokens
  // (keys, PATs, private-key material) so unquoted secrets never leak either.
  return trimmed
    .replace(/(["'])[^"']{4,}\1/g, "$1***$1")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "AKIA***")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "ghp_***")
    .replace(/\bsk_live_[A-Za-z0-9]{16,}\b/g, "sk_live_***")
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "-----BEGIN *** PRIVATE KEY-----");
}

export function scanTextForSecrets(path: string, text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.length > 2000) continue;
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        hits.push({ path, line: i + 1, ruleId: rule.id, redactedPreview: redact(line), confidence: rule.confidence });
        break; // one hit per line is enough for triage
      }
    }
    if (hits.length >= 20) break;
  }
  return hits;
}

export function toSecretFindings(hits: SecretHit[]): AnalyzerFinding[] {
  return hits.slice(0, 6).map((h) => ({
    title: `Possible secret in ${h.path}:${h.line}`,
    severity: h.confidence === "high" ? "Critical" : "High",
    description: `[${h.ruleId}] Redacted preview: ${h.redactedPreview}. Rotate and remove from history.`,
  }));
}

export function toSecretsAnalyzerResult(hits: SecretHit[], scannedFiles: number): AnalyzerResult {
  const critical = hits.filter((h) => h.confidence === "high").length;
  const score = hits.length === 0 ? 100 : Math.max(5, 100 - critical * 30 - (hits.length - critical) * 10);
  return {
    id: "secrets",
    label: "Secrets",
    status: hits.length === 0 ? "pass" : "fail",
    score,
    value: hits.length === 0 ? "no hits" : `${hits.length} possible secret${hits.length === 1 ? "" : "s"}`,
    trend: `scanned ${scannedFiles} files (redacted)`,
    detail:
      hits.length === 0
        ? `Pattern scan of ${scannedFiles} files found no committed-secret markers.`
        : `${hits.length} committed-secret markers (${critical} high confidence). Rotate any real credentials and purge from history — previews are redacted.`,
    findings: toSecretFindings(hits),
    actions:
      hits.length === 0
        ? ["No secret action needed — keep secret scanning enabled."]
        : ["Rotate any confirmed credentials, purge from git history, and add a pre-commit secret hook."],
    metadata: {
      scannedFiles,
      rules: hits.map((h) => h.ruleId),
      // Redacted previews only — raw values never persisted.
      hits: hits.slice(0, 20).map((h) => ({ path: h.path, line: h.line, ruleId: h.ruleId, preview: h.redactedPreview })),
    },
  };
}
