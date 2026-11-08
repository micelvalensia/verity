import { extractNewFunctions, findDuplicateSymbolInWorkspace } from "./dry";
import { filterValidEvidence } from "./evidence";
import { generateReceiptHash } from "./receipt";
import { matchRulesForFile } from "./rules";
import type {
  EvidenceItem,
  FileDiff,
  ParsedDiff,
  ReviewSummary,
  RuleDefinition,
  RuleResult,
  RuleStatus,
  SemanticAuditTask,
} from "./types";

/**
 * Safely create a RegExp handling inline flags like (?i) for cross-language rule compatibility.
 */
function createSafeRegExp(pattern: string, defaultFlags = "i"): RegExp {
  let flags = defaultFlags;
  let cleanPattern = pattern;
  if (cleanPattern.startsWith("(?i)")) {
    cleanPattern = cleanPattern.slice(4);
    if (!flags.includes("i")) flags += "i";
  }
  return new RegExp(cleanPattern, flags);
}

/**
 * Calculate the nesting level based on indentation (assuming 2 or 4 spaces or tabs).
 */
function calculateIndentationDepth(line: string): number {
  const match = line.match(/^(\s*)/);
  if (!match) return 0;
  const whitespace = match[1];
  let depth = 0;
  for (const char of whitespace) {
    if (char === "\t") depth += 1;
    else if (char === " ") depth += 0.5; // 2 spaces per level
  }
  return Math.floor(depth);
}

/**
 * Check if a file should be ignored from code review (e.g. verity internal configs, git metadata).
 */
function isIgnoredFile(path: string): boolean {
  return (
    path.startsWith(".verity/") ||
    path.startsWith(".git/") ||
    path.startsWith(".agent/") ||
    path.startsWith(".agents/") ||
    path.includes("node_modules/")
  );
}

/**
 * Check if a file is a test/spec or config file.
 */
function isTestOrConfigFile(path: string): boolean {
  return (
    path.includes(".test.") ||
    path.includes(".spec.") ||
    path.includes("__tests__") ||
    path.endsWith("config.ts") ||
    path.endsWith("config.js") ||
    path.endsWith("config.yaml") ||
    path.endsWith("config.json")
  );
}

/**
 * Run rule verification across all files in the diff.
 */
export async function verifyDiff(
  parsedDiff: ParsedDiff,
  rules: RuleDefinition[],
  options: {
    workspaceRoot?: string;
    isStaged?: boolean;
    commitSha?: string;
  } = {}
): Promise<ReviewSummary> {
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const ruleResultsMap = new Map<string, RuleResult>();
  const semanticAuditTasksMap = new Map<string, SemanticAuditTask>();

  // Initialize all active rules
  for (const rule of rules) {
    ruleResultsMap.set(rule.id, {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      status: "PASS",
      evidence: [],
      message: `Rule ${rule.id} lolos evaluasi.`,
    });
  }

  const reviewableFiles = parsedDiff.files.filter(
    (file) => !file.isBinary && !file.isDeleted && !isIgnoredFile(file.newPath)
  );

  // If only ignored files (e.g. .verity/rules/*.yaml, git configs) are changed, skip auditing
  if (reviewableFiles.length === 0) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      commitSha: options.commitSha,
      isStaged: options.isStaged || false,
      filesAnalyzed: [],
      totalRules: rules.length,
      passed: rules.length,
      failed: 0,
      unknown: 0,
      overallDecision: "APPROVE",
      receipt: generateReceiptHash(parsedDiff.raw, [], timestamp),
      results: rules.map((r) => ({
        ruleId: r.id,
        ruleName: r.name,
        severity: r.severity,
        status: "PASS" as const,
        evidence: [],
        message: "Tidak ada file kode yang relevan untuk diperiksa.",
      })),
      semanticAudits: [],
    };
  }

  // Iterate over files in diff
  for (const file of reviewableFiles) {

    const applicableRules = matchRulesForFile(file.newPath, rules);

    for (const rule of applicableRules) {
      const currentResult = ruleResultsMap.get(rule.id)!;
      // If already failed, keep collecting evidence or maintain fail
      let ruleStatus: RuleStatus = currentResult.status;
      const ruleEvidence: EvidenceItem[] = [...currentResult.evidence];
      let ruleMessage = currentResult.message;

      // 1. GEN-SEC-001: No Hardcoded Secrets
      if (rule.id === "GEN-SEC-001" && rule.verification?.regex_patterns) {
        if (!isTestOrConfigFile(file.newPath)) {
          for (const line of file.addedLines) {
            for (const patternStr of rule.verification.regex_patterns) {
              const regex = createSafeRegExp(patternStr);
              if (regex.test(line.content)) {
                ruleStatus = "FAIL";
                ruleEvidence.push({
                  type: "line_citation",
                  file: file.newPath,
                  lineStart: line.lineNumber,
                  lineEnd: line.lineNumber,
                  snippet: line.content.trim(),
                  explanation: `Ditemukan potensi credential/token sensitif pada baris ${line.lineNumber}.`,
                });
                ruleMessage = `Pelanggaran keamanan: Ditemukan string sensitif di ${file.newPath}:${line.lineNumber}.`;
              }
            }
          }
        }
      }

      // 2. GEN-DRY-001: No Duplicate Code / Logic
      else if (rule.id === "GEN-DRY-001") {
        const newFunctions = extractNewFunctions(file.newPath, file.addedLines);
        for (const fn of newFunctions) {
          const duplicateEvidence = await findDuplicateSymbolInWorkspace(workspaceRoot, fn);
          if (duplicateEvidence) {
            ruleStatus = "FAIL";
            ruleEvidence.push(duplicateEvidence);
            ruleMessage = `Duplikasi kode terdeteksi: Fungsi '${fn.name}' di ${file.newPath}:${fn.lineNumber} sudah ada di ${duplicateEvidence.file}.`;
          }
        }
      }

      // 3. GEN-ARCH-001: Code Splitting & Modularity
      else if (rule.id === "GEN-ARCH-001") {
        const maxFileLines = rule.verification?.max_file_lines || 300;
        const maxFunctionLines = rule.verification?.max_function_lines || 50;

        // Check added lines volume
        if (file.addedLines.length > maxFileLines) {
          ruleStatus = "FAIL";
          ruleEvidence.push({
            type: "line_citation",
            file: file.newPath,
            lineStart: 1,
            lineEnd: file.addedLines.length,
            snippet: `Total baris baru: ${file.addedLines.length} baris`,
            explanation: `File melebihi batas batas wajar ${maxFileLines} baris. Pertimbangkan code splitting.`,
          });
          ruleMessage = `File ${file.newPath} terlalu besar (${file.addedLines.length} baris baru).`;
        }
      }

      // 4. GEN-ERR-001: No Silent Error Swallowing
      else if (rule.id === "GEN-ERR-001" && rule.verification?.regex_patterns) {
        for (const line of file.addedLines) {
          for (const patternStr of rule.verification.regex_patterns) {
            const regex = createSafeRegExp(patternStr);
            if (regex.test(line.content)) {
              ruleStatus = "FAIL";
              ruleEvidence.push({
                type: "line_citation",
                file: file.newPath,
                lineStart: line.lineNumber,
                lineEnd: line.lineNumber,
                snippet: line.content.trim(),
                explanation: `Blok penanganan error kosong atau menelan error tanpa tindakan di baris ${line.lineNumber}.`,
              });
              ruleMessage = `Error swallowing terdeteksi di ${file.newPath}:${line.lineNumber}.`;
            }
          }
        }
      }

      // 5. GEN-CLN-001: No Leftover Debugger Code
      else if (rule.id === "GEN-CLN-001" && rule.verification?.regex_patterns) {
        if (!isTestOrConfigFile(file.newPath)) {
          for (const line of file.addedLines) {
            for (const patternStr of rule.verification.regex_patterns) {
              const regex = createSafeRegExp(patternStr);
              if (regex.test(line.content)) {
                ruleStatus = "FAIL";
                ruleEvidence.push({
                  type: "line_citation",
                  file: file.newPath,
                  lineStart: line.lineNumber,
                  lineEnd: line.lineNumber,
                  snippet: line.content.trim(),
                  explanation: `Sisa fungsi debugging (${line.content.trim()}) terdeteksi pada baris ${line.lineNumber}.`,
                });
                ruleMessage = `Sisa kode debugger terdeteksi di ${file.newPath}:${line.lineNumber}.`;
              }
            }
          }
        }
      }

      // 6. GEN-CLN-002: Early Exit over Deep Nesting
      else if (rule.id === "GEN-CLN-002") {
        const maxDepth = rule.verification?.max_nesting_depth || 3;
        for (const line of file.addedLines) {
          const depth = calculateIndentationDepth(line.content);
          if (depth > maxDepth + 1) {
            ruleStatus = "FAIL";
            ruleEvidence.push({
              type: "line_citation",
              file: file.newPath,
              lineStart: line.lineNumber,
              lineEnd: line.lineNumber,
              snippet: line.content.trim(),
              explanation: `Kedalaman struktur kondisional/blok mencapai level ${depth} (maksimal ${maxDepth}). Utamakan early return.`,
            });
            ruleMessage = `Deep nesting terdeteksi di ${file.newPath}:${line.lineNumber}.`;
            break;
          }
        }
      }

      // 7. GEN-CLN-003: Magic Numbers / Unexplained Literals
      else if (rule.id === "GEN-CLN-003") {
        if (!isTestOrConfigFile(file.newPath)) {
          for (const line of file.addedLines) {
            // Match numbers > 10 in conditional checks or timeouts
            const magicMatch = line.content.match(/(===|==|!==|!=|>|<|setTimeout|setInterval)\s*(\d{2,})/);
            if (magicMatch && !["100", "200", "404", "500"].includes(magicMatch[2])) {
              ruleStatus = "UNKNOWN";
              ruleEvidence.push({
                type: "line_citation",
                file: file.newPath,
                lineStart: line.lineNumber,
                lineEnd: line.lineNumber,
                snippet: line.content.trim(),
                explanation: `Terdeteksi angka literal (${magicMatch[2]}) tanpa nama variabel konstan pada baris ${line.lineNumber}. Periksa apakah perlu diekstrak ke enum/konstanta.`,
              });
              ruleMessage = `Tinjauan manusia: Kemungkinan magic number (${magicMatch[2]}) di ${file.newPath}:${line.lineNumber}.`;
              break;
            }
          }
        }
      }

      // Generic regex check for custom rules
      else if (rule.verification?.regex_patterns && rule.verification.regex_patterns.length > 0) {
        for (const line of file.addedLines) {
          for (const patternStr of rule.verification.regex_patterns) {
            const regex = createSafeRegExp(patternStr);
            if (regex.test(line.content)) {
              ruleStatus = "FAIL";
              ruleEvidence.push({
                type: "line_citation",
                file: file.newPath,
                lineStart: line.lineNumber,
                lineEnd: line.lineNumber,
                snippet: line.content.trim(),
                explanation: `Pelanggaran pola kriteria rule ${rule.id} pada baris ${line.lineNumber}.`,
              });
              ruleMessage = `Pelanggaran rule ${rule.id} di ${file.newPath}:${line.lineNumber}.`;
            }
          }
        }
      }

      // 8. Custom Semantic Rule (requires LLM / Agent reasoning to evaluate)
      else if (
        rule.verification?.method === "semantic" ||
        (!rule.verification?.regex_patterns &&
          !["GEN-SEC-001", "GEN-DRY-001", "GEN-ARCH-001", "GEN-ERR-001", "GEN-CLN-001", "GEN-CLN-002", "GEN-CLN-003"].includes(rule.id))
      ) {
        ruleStatus = "UNKNOWN";
        ruleMessage = `Evaluasi Semantik Diperlukan: "${rule.criteria.trim()}". AI Agent wajib memverifikasi diff ini.`;

        if (!semanticAuditTasksMap.has(rule.id)) {
          semanticAuditTasksMap.set(rule.id, {
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            criteria: rule.criteria.trim(),
            files: [file.newPath],
            actionRequired: `AI Agent WAJIB mengevaluasi perubahan kode terhadap kriteria: "${rule.criteria.trim()}". Jika diff melanggar, Anda HARUS memperbaiki kodenya sekarang sebelum menyelesaikan tugas!`,
          });
        } else {
          const task = semanticAuditTasksMap.get(rule.id)!;
          if (!task.files.includes(file.newPath)) {
            task.files.push(file.newPath);
          }
        }
      }

      // Update map entry
      ruleResultsMap.set(rule.id, {
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        status: ruleStatus,
        evidence: filterValidEvidence(ruleEvidence, parsedDiff.files),
        message: ruleMessage,
      });
    }
  }

  const results = Array.from(ruleResultsMap.values());
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const unknown = results.filter((r) => r.status === "UNKNOWN").length;

  // Determine overall PR decision
  let overallDecision: "APPROVE" | "REQUEST_CHANGES" | "HUMAN_REVIEW" = "APPROVE";
  if (failed > 0) {
    overallDecision = "REQUEST_CHANGES";
  } else if (unknown > 0) {
    overallDecision = "HUMAN_REVIEW";
  }

  const timestamp = new Date().toISOString();
  const receipt = generateReceiptHash(parsedDiff.raw, results, timestamp);

  return {
    timestamp,
    commitSha: options.commitSha,
    isStaged: options.isStaged || false,
    filesAnalyzed: reviewableFiles.map((f) => f.newPath),
    totalRules: results.length,
    passed,
    failed,
    unknown,
    overallDecision,
    receipt,
    results,
    semanticAudits: Array.from(semanticAuditTasksMap.values()),
  };
}
