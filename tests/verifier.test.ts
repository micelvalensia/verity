import { describe, expect, it } from "bun:test";
import { parseGitDiff } from "../src/core/diff";
import { loadRules } from "../src/core/rules";
import { verifyDiff } from "../src/core/verifier";

describe("Verification Engine", () => {
  it("should fail when hardcoded secret is introduced (GEN-SEC-001)", async () => {
    const rules = await loadRules();
    const diff = parseGitDiff(`diff --git a/src/api.ts b/src/api.ts
index 0000000..1111111 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -1,3 +1,4 @@
 export function getClient() {
+  const api_key = "sk_live_1234567890abcdef123456";
   return null;
 }
`);

    const summary = await verifyDiff(diff, rules);
    expect(summary.overallDecision).toBe("REQUEST_CHANGES");
    const secResult = summary.results.find((r) => r.ruleId === "GEN-SEC-001");
    expect(secResult?.status).toBe("FAIL");
    expect(secResult?.evidence.length).toBeGreaterThan(0);
    expect(secResult?.evidence[0].file).toBe("src/api.ts");
    expect(secResult?.evidence[0].lineStart).toBe(2);
  });

  it("should fail when console.log is introduced (GEN-CLN-001)", async () => {
    const rules = await loadRules();
    const diff = parseGitDiff(`diff --git a/src/controller.ts b/src/controller.ts
index 0000000..1111111 100644
--- a/src/controller.ts
+++ b/src/controller.ts
@@ -1,3 +1,4 @@
 export function handleRequest() {
+  console.log("debugging user payload");
   return true;
 }
`);

    const summary = await verifyDiff(diff, rules);
    expect(summary.overallDecision).toBe("REQUEST_CHANGES");
    const clnResult = summary.results.find((r) => r.ruleId === "GEN-CLN-001");
    expect(clnResult?.status).toBe("FAIL");
    expect(clnResult?.evidence[0].lineStart).toBe(2);
  });

  it("should fail on empty catch error swallowing (GEN-ERR-001)", async () => {
    const rules = await loadRules();
    const diff = parseGitDiff(`diff --git a/src/service.ts b/src/service.ts
index 0000000..1111111 100644
--- a/src/service.ts
+++ b/src/service.ts
@@ -1,3 +1,6 @@
 export function run() {
+  try {
+    doSomething();
+  } catch (err) {}
 }
`);

    const summary = await verifyDiff(diff, rules);
    expect(summary.overallDecision).toBe("REQUEST_CHANGES");
    const errResult = summary.results.find((r) => r.ruleId === "GEN-ERR-001");
    expect(errResult?.status).toBe("FAIL");
  });

  it("should flag magic numbers as UNKNOWN for human review (GEN-CLN-003)", async () => {
    const rules = await loadRules();
    const diff = parseGitDiff(`diff --git a/src/order.ts b/src/order.ts
index 0000000..1111111 100644
--- a/src/order.ts
+++ b/src/order.ts
@@ -1,3 +1,4 @@
 export function checkStatus(status: number) {
+  if (status === 88) return false;
   return true;
 }
`);

    const summary = await verifyDiff(diff, rules);
    const magicResult = summary.results.find((r) => r.ruleId === "GEN-CLN-003");
    expect(magicResult?.status).toBe("UNKNOWN");
    expect(summary.overallDecision).toBe("HUMAN_REVIEW");
  });

  it("should approve clean code and generate receipt hash", async () => {
    const rules = await loadRules();
    const diff = parseGitDiff(`diff --git a/src/math.ts b/src/math.ts
index 0000000..1111111 100644
--- a/src/math.ts
+++ b/src/math.ts
@@ -1,2 +1,6 @@
+export function add(a: number, b: number): number {
+  return a + b;
+}
`);

    const summary = await verifyDiff(diff, rules);
    expect(summary.overallDecision).toBe("APPROVE");
    expect(summary.failed).toBe(0);
    expect(summary.receipt).toBeDefined();
    expect(summary.receipt?.length).toBe(64); // SHA-256 hex length
  });

  it("should capture custom semantic rules and generate semantic audit tasks for AI agent", async () => {
    const customRule = {
      id: "NO-EMOTE-001",
      name: "No Emojis in Comments",
      pack: "custom",
      severity: "high" as const,
      file_patterns: ["**/*"],
      criteria: "Hapus semua komentar yang ada emotenya",
      verification: {
        method: "semantic" as const,
      },
    };

    const diff = parseGitDiff(`diff --git a/src/comment.ts b/src/comment.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/comment.ts
@@ -0,0 +1,3 @@
+// Halo dunia 🚀
+export const ok = true;
+`);

    const summary = await verifyDiff(diff, [customRule]);
    expect(summary.semanticAudits.length).toBe(1);
    expect(summary.semanticAudits[0].ruleId).toBe("NO-EMOTE-001");
    expect(summary.semanticAudits[0].actionRequired).toContain("AI Agent WAJIB mengevaluasi");
    expect(summary.semanticAudits[0].files).toContain("src/comment.ts");
    expect(summary.overallDecision).toBe("HUMAN_REVIEW");
  });

  it("should not flag JSX nesting as deep control-flow nesting in TSX files (GEN-CLN-002)", async () => {
    const rules = await loadRules();
    const diff = parseGitDiff(`diff --git a/src/components/Scanner.tsx b/src/components/Scanner.tsx
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/components/Scanner.tsx
@@ -0,0 +1,18 @@
+export function PosBarcodeScanner() {
+    return (
+        <div className="relative w-full">
+            <div className="relative flex items-center">
+                <Barcode
+                    className="absolute left-3.5 size-5"
+                />
+                <div className="absolute right-2.5 flex items-center">
+                    <span className="flex items-center">
+                        <Sparkles className="size-3" />
+                    </span>
+                </div>
+            </div>
+        </div>
+    );
+}
+`);

    const summary = await verifyDiff(diff, rules);
    const nestingResult = summary.results.find((r) => r.ruleId === "GEN-CLN-002");
    expect(nestingResult?.status).toBe("PASS");
  });
});
