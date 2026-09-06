import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("no file-token path", () => {
  it("does not ship token-store or .data/tokens.json helpers", () => {
    expect(existsSync(resolve(process.cwd(), "src/lib/token-store.ts"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), ".data/tokens.json"))).toBe(false);
  });
});
