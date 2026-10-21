import type { ReviewSummary } from "./types";

/**
 * Generate a clean, readable Markdown Evidence Dossier table suitable
 * for embedding directly into GitHub PR descriptions for Team Leads and Reviewers.
 */
export function generateEvidenceDossier(summary: ReviewSummary): string {
  const badgeMap: Record<string, string> = {
    PASS: "🟢 `PASS`",
    FAIL: "🔴 `FAIL`",
    UNKNOWN: "🟡 `UNKNOWN`",
  };

  const decisionBadge: Record<string, string> = {
    APPROVE: "✅ **APPROVE** (All rules verified with evidence)",
    REQUEST_CHANGES: "❌ **REQUEST_CHANGES** (Action required before merge)",
    HUMAN_REVIEW: "⚠️ **HUMAN_REVIEW** (Spot-check needed on unknown points)",
  };

  const rows = summary.results.map((r) => {
    let evidenceText = r.message;
    if (r.evidence.length > 0) {
      const topEvidence = r.evidence[0];
      const loc = topEvidence.lineStart ? `\`${topEvidence.file}:${topEvidence.lineStart}\`` : `\`${topEvidence.file}\``;
      evidenceText = `${loc} — ${topEvidence.explanation}`;
    }
    return `| \`${r.ruleId}\` | ${badgeMap[r.status] || r.status} | **${r.severity.toUpperCase()}** | ${evidenceText} |`;
  });

  return [
    `### 🛡️ VerityReview — Evidence Dossier`,
    ``,
    `**Overall Decision:** ${decisionBadge[summary.overallDecision] || summary.overallDecision}  `,
    `**Cryptographic Receipt:** \`${summary.receipt || "N/A"}\`  `,
    `**Timestamp:** ${summary.timestamp}  `,
    `**Files Evaluated:** ${summary.filesAnalyzed.length > 0 ? summary.filesAnalyzed.map((f) => `\`${f}\``).join(", ") : "None"}`,
    ``,
    `| Rule ID | Status | Severity | Evidence & Details |`,
    `| :--- | :---: | :---: | :--- |`,
    ...rows,
    ``,
    `> *Verified locally via VerityReview framework before commit. No evidence, no verified pass.*`,
  ].join("\n");
}
