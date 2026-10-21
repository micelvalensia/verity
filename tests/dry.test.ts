import { describe, expect, it } from "bun:test";
import { parseGitDiff } from "../src/core/diff";
import { loadRules } from "../src/core/rules";
import { verifyDiff } from "../src/core/verifier";

describe("DRY Duplicate Detection Engine", () => {
  it("should detect duplicate function defined elsewhere in workspace", async () => {
    const rules = await loadRules();
    // parseGitDiff is a real function defined in src/core/diff.ts
    // Let's create a diff that tries to re-define parseGitDiff in another file!
    const diff = parseGitDiff(`diff --git a/src/utils/my-diff.ts b/src/utils/my-diff.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/utils/my-diff.ts
@@ -0,0 +1,5 @@
+export function parseGitDiff(rawDiff: string) {
+  // duplicate implementation!
+  return null;
+}
`);

    const summary = await verifyDiff(diff, rules);
    const dryResult = summary.results.find((r) => r.ruleId === "GEN-DRY-001");
    expect(dryResult?.status).toBe("FAIL");
    expect(dryResult?.evidence.length).toBeGreaterThan(0);
    expect(dryResult?.evidence[0].file).toBe("src/core/diff.ts");
    expect(dryResult?.message).toContain("parseGitDiff");
  });
});
