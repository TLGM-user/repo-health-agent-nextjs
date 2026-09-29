import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export async function resolve(
  specifier: string,
  context: { parentURL: string },
  next: (s: string, c: unknown) => Promise<{ url: string }>
): Promise<{ url: string; shortCircuit?: boolean }> {
  try {
    return await next(specifier, context);
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== "ERR_MODULE_NOT_FOUND") throw err;
    // Mirror tsconfig paths: "@/*" -> "./src/*" (repo root = two levels above tests/hooks).
    if (specifier.startsWith("@/")) {
      const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
      const base = path.join(repoRoot, "src", specifier.slice(2));
      for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (existsSync(cand)) return { url: pathToFileURL(cand).href, shortCircuit: true };
      }
    }
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const parentPath = fileURLToPath(context.parentURL);
      const base = path.resolve(path.dirname(parentPath), specifier);
      for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (existsSync(cand)) return { url: pathToFileURL(cand).href, shortCircuit: true };
      }
    }
    throw err;
  }
}
