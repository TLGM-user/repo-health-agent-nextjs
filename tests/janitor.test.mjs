import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prioritizeFindings } from "../src/lib/prioritize.ts";
import { scanTextForSecrets, toSecretsAnalyzerResult } from "../src/lib/scanners/secrets.ts";
import { toDeadCodeAnalyzerResult } from "../src/lib/scanners/deadcode.ts";
import { buildPrPreview, verifyPrPreview } from "../src/lib/pr-bot/pr-bot.ts";
import { prBodyFor } from "../src/lib/pr-bot/template.ts";
import { selectApplyTargets } from "../src/lib/pr-bot/github-writes.ts";
import { FIX_RUN_TTL_MS, isFixRunExpired } from "../src/lib/persistence.ts";

describe("prioritize", () => {
  it("ranks critical secrets above low deadcode, gates PR eligibility", () => {
    const ranked = prioritizeFindings([
      { finding: { title: "dead", severity: "Low", description: "x" }, source: "deadcode", confidence: "high", autofixable: true },
      { finding: { title: "secret", severity: "Critical", description: "y" }, source: "secrets", confidence: "high", autofixable: false },
    ]);
    assert.equal(ranked[0].finding.title, "secret");
    assert.equal(ranked[0].tier, "P1-needs-review"); // secrets need review, never silent autofix
    const preview = buildPrPreview("acme/web", ranked);
    assert.ok(preview.requiresApproval);
    assert.ok(preview.branch.startsWith("repo-health/"));
  });
});

describe("secrets", () => {
  it("redacts values, never returns raw secret", () => {
    const hits = scanTextForSecrets("a.ts", 'const k = "ghp_abcdefghijklmnopqrstuvwxyz1234";');
    assert.equal(hits.length, 1);
    assert.ok(!hits[0].redactedPreview.includes("ghp_abcdefghijklmnopqrstuvwxyz1234"));
    assert.ok(hits[0].redactedPreview.includes("***"));
  });

  it("analyzer fails closed with redacted metadata", () => {
    const hits = scanTextForSecrets(".env", "AWS_KEY=AKIAIOSFODNN7EXAMPLE\npassword = \"hunter2hunter2\"\n");
    const result = toSecretsAnalyzerResult(hits, 1);
    assert.equal(result.id, "secrets");
    assert.equal(result.status, "fail");
    assert.ok(result.score !== null && result.score < 100);
    const raw = JSON.stringify(result.metadata);
    assert.ok(!raw.includes("AKIAIOSFODNN7EXAMPLE"));
  });

  it("deadcode analyzer uses its own id so it cannot clobber maintenance", () => {
    const result = toDeadCodeAnalyzerResult(
      [{ path: "src/old.ts", reason: "unreferenced", confidence: "high", autofixable: true }],
      10
    );
    assert.equal(result.id, "deadcode");
    assert.equal(result.metadata.prEligible, 1);
  });
});

describe("apply gate", () => {
  const p0 = (path) => ({
    finding: { title: `Possible dead code: ${path}`, severity: "Low", description: "unreferenced" },
    source: "deadcode", confidence: "high", autofixable: true, path,
  });
  const ranked = () => prioritizeFindings([p0("src/a.ts"), p0("src/b.ts")]);

  it("a fresh preview verifies", () => {
    const preview = buildPrPreview("acme/web", ranked(), "00000000-0000-4000-8000-000000000000");
    assert.equal(verifyPrPreview(preview), true);
    assert.deepEqual([...preview.files].sort(), ["src/a.ts", "src/b.ts"]);
  });

  it("swapping in a foreign path fails closed", () => {
    const preview = buildPrPreview("acme/web", ranked(), "00000000-0000-4000-8000-000000000000");
    const tampered = { ...preview, files: ["src/a.ts", "src/important-core.ts"] };
    assert.equal(verifyPrPreview(tampered), false);
    // Defense in depth: even a re-signed foreign path is dropped by target selection
    const { targets, dropped } = selectApplyTargets({
      ...preview,
      files: [...preview.files, "src/important-core.ts", "../escape.ts", "/abs.ts"],
    });
    assert.ok(targets.every((t) => ["src/a.ts", "src/b.ts"].includes(t.path)));
    assert.equal(dropped, 3);
  });

  it("caps files per PR", () => {
    const many = Array.from({ length: 25 }, (_, i) => p0(`src/f${i}.ts`));
    const preview = buildPrPreview("acme/web", prioritizeFindings(many), "00000000-0000-4000-8000-000000000001");
    const { targets, dropped } = selectApplyTargets(preview, 10);
    assert.equal(targets.length, 10);
    assert.equal(dropped, 15);
  });

  it("previews expire after 24h", () => {
    assert.equal(FIX_RUN_TTL_MS, 24 * 60 * 60 * 1000);
    const now = Date.now();
    assert.equal(isFixRunExpired(new Date(now - 1000).toISOString(), now), false);
    assert.equal(isFixRunExpired(new Date(now - FIX_RUN_TTL_MS - 1000).toISOString(), now), true);
  });

  it("PR body carries the merge checklist", () => {
    const body = prBodyFor("acme/web", [], "run-1");
    assert.ok(body.includes("DRAFT"));
    assert.ok(body.includes("CI is green"));
  });
});
