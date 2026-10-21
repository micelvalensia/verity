import { createHash } from "node:crypto";
import type { ReviewSummary, RuleResult } from "./types";

/**
 * Generate a deterministic SHA256 cryptographic receipt for a review run.
 */
export function generateReceiptHash(
  rawDiff: string,
  results: RuleResult[],
  timestamp: string = new Date().toISOString()
): string {
  const normalizedRules = results
    .map((r) => `${r.ruleId}:${r.status}:${r.severity}`)
    .sort()
    .join(";");

  const payload = `${rawDiff.trim()}\n${normalizedRules}\n${timestamp}`;
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Format Git commit trailers to be appended to a commit message.
 */
export function formatGitTrailers(summary: ReviewSummary): string {
  const rulesList = summary.results.map((r) => r.ruleId).join(",");
  const status = summary.overallDecision === "APPROVE" ? "PASS" : summary.overallDecision;

  return [
    `Verity-Status: ${status}`,
    `Verity-Receipt: ${summary.receipt || "none"}`,
    `Verity-Rules: ${rulesList}`,
  ].join("\n");
}

/**
 * Parse Verity trailers from an existing commit message.
 */
export function parseGitTrailers(commitMessage: string): {
  status?: string;
  receipt?: string;
  rules?: string[];
} | null {
  const lines = commitMessage.split("\n");
  let status: string | undefined;
  let receipt: string | undefined;
  let rules: string[] | undefined;

  for (const line of lines) {
    const statusMatch = line.match(/^Verity-Status:\s*(.+)$/i);
    if (statusMatch) status = statusMatch[1].trim();

    const receiptMatch = line.match(/^Verity-Receipt:\s*(.+)$/i);
    if (receiptMatch) receipt = receiptMatch[1].trim();

    const rulesMatch = line.match(/^Verity-Rules:\s*(.+)$/i);
    if (rulesMatch) rules = rulesMatch[1].split(",").map((r) => r.trim());
  }

  if (status && receipt) {
    return { status, receipt, rules };
  }
  return null;
}
