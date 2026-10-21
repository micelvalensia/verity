import { z } from "zod";

export const RuleSeveritySchema = z.enum(["critical", "high", "medium", "low"]);
export type RuleSeverity = z.infer<typeof RuleSeveritySchema>;

export const RuleStatusSchema = z.enum(["PASS", "FAIL", "UNKNOWN"]);
export type RuleStatus = z.infer<typeof RuleStatusSchema>;

export const EvidenceTypeSchema = z.enum([
  "line_citation",
  "symbol_match",
  "test_output",
  "ast_pattern",
  "reasoning",
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const EvidenceItemSchema = z.object({
  type: EvidenceTypeSchema,
  file: z.string(),
  lineStart: z.number().optional(),
  lineEnd: z.number().optional(),
  snippet: z.string().optional(),
  explanation: z.string(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const RuleDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  pack: z.string().default("custom"),
  severity: RuleSeveritySchema,
  file_patterns: z.array(z.string()).default(["**/*"]),
  criteria: z.string(),
  verification: z
    .object({
      method: z.enum(["deterministic", "semantic", "hybrid"]).default("hybrid"),
      regex_patterns: z.array(z.string()).optional(),
      max_file_lines: z.number().optional(),
      max_function_lines: z.number().optional(),
      max_nesting_depth: z.number().optional(),
    })
    .optional(),
  evidence_requirements: z
    .object({
      pass_condition: z.string().optional(),
      fail_condition: z.string().optional(),
      unknown_condition: z.string().optional(),
    })
    .optional(),
});
export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;

export const RuleResultSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  severity: RuleSeveritySchema,
  status: RuleStatusSchema,
  evidence: z.array(EvidenceItemSchema),
  message: z.string(),
  recommendation: z.string().optional(),
});
export type RuleResult = z.infer<typeof RuleResultSchema>;

export const ReviewSummarySchema = z.object({
  timestamp: z.string(),
  commitSha: z.string().optional(),
  isStaged: z.boolean().default(false),
  filesAnalyzed: z.array(z.string()),
  totalRules: z.number(),
  passed: z.number(),
  failed: z.number(),
  unknown: z.number(),
  overallDecision: z.enum(["APPROVE", "REQUEST_CHANGES", "HUMAN_REVIEW"]),
  receipt: z.string().optional(),
  results: z.array(RuleResultSchema),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

export const DiffLineSchema = z.object({
  type: z.enum(["add", "del", "normal"]),
  content: z.string(),
  newLineNumber: z.number().optional(),
  oldLineNumber: z.number().optional(),
});
export type DiffLine = z.infer<typeof DiffLineSchema>;

export const DiffHunkSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  heading: z.string().optional(),
  lines: z.array(DiffLineSchema),
});
export type DiffHunk = z.infer<typeof DiffHunkSchema>;

export const AddedLineSchema = z.object({
  lineNumber: z.number(),
  content: z.string(),
});
export type AddedLine = z.infer<typeof AddedLineSchema>;

export const FileDiffSchema = z.object({
  oldPath: z.string().optional(),
  newPath: z.string(),
  isNew: z.boolean(),
  isDeleted: z.boolean(),
  isBinary: z.boolean(),
  hunks: z.array(DiffHunkSchema),
  addedLines: z.array(AddedLineSchema),
});
export type FileDiff = z.infer<typeof FileDiffSchema>;

export const ParsedDiffSchema = z.object({
  files: z.array(FileDiffSchema),
  raw: z.string(),
});
export type ParsedDiff = z.infer<typeof ParsedDiffSchema>;

