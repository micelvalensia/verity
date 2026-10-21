import type { EvidenceItem, FileDiff } from "./types";

/**
 * Validate that an evidence item refers to real, existent lines in the diff or file.
 * Prevents hallucinated citations from entering the decision engine.
 */
export function validateEvidenceItem(evidence: EvidenceItem, fileDiffs: FileDiff[]): boolean {
  // If evidence is purely reasoning without specific lines
  if (!evidence.lineStart && !evidence.file) {
    return true;
  }

  const file = fileDiffs.find((f) => f.newPath === evidence.file || f.oldPath === evidence.file);
  if (!file) {
    // If file isn't in diff, it could be a symbol match in another workspace file
    return evidence.type === "symbol_match";
  }

  if (evidence.lineStart !== undefined) {
    // Check if the cited line exists in the added lines or hunks of the file diff
    const hasLine = file.addedLines.some((l) => l.lineNumber === evidence.lineStart);
    if (!hasLine) {
      // Check in hunk bounds
      const inHunk = file.hunks.some(
        (h) => evidence.lineStart! >= h.newStart && evidence.lineStart! < h.newStart + h.newLines
      );
      if (!inHunk) {
        return false; // Cited line does not exist in the diff!
      }
    }
  }

  return true;
}

/**
 * Validate all evidence items. Returns array of only valid, verified evidence items.
 */
export function filterValidEvidence(evidenceList: EvidenceItem[], fileDiffs: FileDiff[]): EvidenceItem[] {
  return evidenceList.filter((item) => validateEvidenceItem(item, fileDiffs));
}
