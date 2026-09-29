// Node test hook: resolve extensionless relative imports to .ts files.
// Lets plain `node --test` import Next-idiomatic TS (extensionless, no alias)
// without adding a test runner dependency.
import { register } from "node:module";

register("./resolve-extensionless.ts", import.meta.url);
