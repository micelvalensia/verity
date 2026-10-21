import { describe, expect, it } from "bun:test";
import { parseGitDiff } from "../src/core/diff";

describe("Git Diff Parser", () => {
  it("should parse unified git diff correctly", () => {
    const rawDiff = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..89abcdef 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,8 @@ export function authenticate() {
   const token = getHeader();
   if (!token) return false;
+  const secret = "super_secret_123456789";
+  validate(secret);
   return true;
 }
`;

    const parsed = parseGitDiff(rawDiff);
    expect(parsed.files.length).toBe(1);

    const file = parsed.files[0];
    expect(file.newPath).toBe("src/auth.ts");
    expect(file.isNew).toBe(false);
    expect(file.isDeleted).toBe(false);
    expect(file.hunks.length).toBe(1);

    const hunk = file.hunks[0];
    expect(hunk.oldStart).toBe(10);
    expect(hunk.newStart).toBe(10);

    expect(file.addedLines.length).toBe(2);
    expect(file.addedLines[0].lineNumber).toBe(12);
    expect(file.addedLines[0].content).toBe('  const secret = "super_secret_123456789";');
    expect(file.addedLines[1].lineNumber).toBe(13);
    expect(file.addedLines[1].content).toBe("  validate(secret);");
  });

  it("should handle new file additions", () => {
    const rawDiff = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,3 @@
+export const hello = () => {
+  return "world";
+};
`;

    const parsed = parseGitDiff(rawDiff);
    expect(parsed.files.length).toBe(1);
    const file = parsed.files[0];
    expect(file.newPath).toBe("src/new-file.ts");
    expect(file.isNew).toBe(true);
    expect(file.addedLines.length).toBe(3);
    expect(file.addedLines[0].lineNumber).toBe(1);
  });
});
