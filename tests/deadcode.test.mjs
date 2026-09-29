import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findDeadCodeCandidates } from "../src/lib/scanners/deadcode.ts";

const tree = (paths) => ({ sha: "abc", truncated: false, tree: paths.map((p) => ({ path: p, type: "blob" })) });

describe("deadcode scanner", () => {
  it("flags unreferenced modules, skips entries and barrels", async () => {
    const t = tree(["src/index.ts", "src/app.ts", "src/unused-helper.ts", "src/__tests__/app.test.ts"]);
    const read = async (p) => (p.endsWith("index.ts") || p.endsWith("app.ts") ? "import x from './other';" : "export const a = 1;");
    const out = await findDeadCodeCandidates(t, read);
    assert.ok(out.some((c) => c.path.includes("unused-helper")));
    assert.ok(!out.some((c) => c.path.includes("index.ts")));
  });

  it("returns [] without tree", async () => {
    assert.deepEqual(await findDeadCodeCandidates(null), []);
  });
});
