import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { RuleDefinitionSchema, type RuleDefinition, type RuleSeverity } from "./types";

interface VerityConfig {
  extends?: string[];
  rules?: Record<string, { severity?: RuleSeverity; enabled?: boolean }>;
}

/**
 * Check if a file matches any of the glob patterns.
 */
export function matchesFilePattern(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern === "**/*" || pattern === "*") return true;
    try {
      const glob = new Bun.Glob(pattern);
      if (glob.match(filePath)) return true;
    } catch {
      // Fallback simple extension check
      if (pattern.startsWith("*.") && filePath.endsWith(pattern.slice(1))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Filter rules applicable to a specific file.
 */
export function matchRulesForFile(filePath: string, rules: RuleDefinition[]): RuleDefinition[] {
  return rules.filter((rule) => matchesFilePattern(filePath, rule.file_patterns));
}

/**
 * Read and parse all YAML rule files in a directory.
 */
export async function loadRulesFromDirectory(dirPath: string): Promise<RuleDefinition[]> {
  const rules: RuleDefinition[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        const fullPath = join(dirPath, entry.name);
        const content = await readFile(fullPath, "utf-8");
        const parsed = parseYaml(content);
        const validated = RuleDefinitionSchema.safeParse(parsed);
        if (validated.success) {
          rules.push(validated.data);
        } else {
          console.warn(`[Verity] Warning: Failed to validate rule ${entry.name}:`, validated.error.message);
        }
      }
    }
  } catch {
    // Directory might not exist, silently return empty array
  }
  return rules;
}

/**
 * Load all active rules (built-in + workspace custom rules with overrides).
 */
export async function loadRules(workspaceRoot: string = process.cwd()): Promise<RuleDefinition[]> {
  // 1. Load built-in rules
  const currentDir = import.meta.dir;
  const builtInDir = resolve(currentDir, "../rules");
  const builtInRules = await loadRulesFromDirectory(builtInDir);

  // 2. Load workspace config if exists
  const configPath = join(workspaceRoot, ".verity", "config.yaml");
  let config: VerityConfig = {};
  try {
    const configContent = await readFile(configPath, "utf-8");
    config = parseYaml(configContent) || {};
  } catch {
    // No config file, default settings apply
  }

  // 3. Load custom rules in workspace .verity/rules/
  const customRulesDir = join(workspaceRoot, ".verity", "rules");
  const customRules = await loadRulesFromDirectory(customRulesDir);

  // 4. Merge rules: custom rules can override or add to built-in rules
  const rulesMap = new Map<string, RuleDefinition>();

  // Add built-ins first
  for (const rule of builtInRules) {
    rulesMap.set(rule.id, rule);
  }

  // Add custom rules (can overwrite built-in if same ID)
  for (const rule of customRules) {
    rulesMap.set(rule.id, rule);
  }

  // 5. Apply config overrides (severity or disabled)
  const finalRules: RuleDefinition[] = [];
  for (const [id, rule] of rulesMap.entries()) {
    const ruleConfig = config.rules?.[id];
    if (ruleConfig?.enabled === false) {
      continue; // Skip disabled rule
    }

    if (ruleConfig?.severity) {
      finalRules.push({
        ...rule,
        severity: ruleConfig.severity,
      });
    } else {
      finalRules.push(rule);
    }
  }

  return finalRules;
}
