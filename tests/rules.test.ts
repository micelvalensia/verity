import { describe, expect, it } from "bun:test";
import { loadRules, matchesFilePattern, matchRulesForFile } from "../src/core/rules";

describe("Rule Loader & Matcher", () => {
  it("should load all built-in rules", async () => {
    const rules = await loadRules();
    expect(rules.length).toBeGreaterThanOrEqual(7);

    const ids = rules.map((r) => r.id);
    expect(ids).toContain("GEN-SEC-001");
    expect(ids).toContain("GEN-DRY-001");
    expect(ids).toContain("GEN-ARCH-001");
    expect(ids).toContain("GEN-ERR-001");
    expect(ids).toContain("GEN-CLN-001");
    expect(ids).toContain("GEN-CLN-002");
    expect(ids).toContain("GEN-CLN-003");
  });

  it("should match file patterns accurately", () => {
    expect(matchesFilePattern("src/auth.ts", ["**/*"])).toBe(true);
    expect(matchesFilePattern("src/auth.ts", ["**/*.ts"])).toBe(true);
    expect(matchesFilePattern("src/auth.ts", ["**/*.py"])).toBe(false);
    expect(matchesFilePattern("src/routes/user.ts", ["src/routes/**"])).toBe(true);
  });

  it("should filter rules for a file", async () => {
    const rules = await loadRules();
    const matched = matchRulesForFile("src/services/payment.ts", rules);
    expect(matched.length).toBeGreaterThan(0);
  });
});
