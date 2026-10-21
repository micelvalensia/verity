import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { AddedLine, EvidenceItem } from "./types";

interface ExtractedFunction {
  name: string;
  signature: string;
  file: string;
  lineNumber: number;
}

// Regex patterns to detect function declarations across TS, JS, Python, Go
const FUNCTION_DECLARATION_PATTERNS = [
  // function foo(...) or async function foo(...)
  /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/,
  // const foo = (...) => or let foo = async (...) =>
  /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/,
  // Python: def foo(...)
  /def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\):/,
  // Go: func foo(...) or func (r *Receiver) foo(...)
  /func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)/,
];

/**
 * Extract new function declarations from added lines in a diff.
 */
export function extractNewFunctions(file: string, addedLines: AddedLine[]): ExtractedFunction[] {
  const functions: ExtractedFunction[] = [];

  for (const line of addedLines) {
    const trimmed = line.content.trim();
    for (const pattern of FUNCTION_DECLARATION_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        const name = match[1];
        // Ignore generic / anonymous / common lifecycle hooks
        if (["render", "constructor", "init", "main", "test", "it", "describe"].includes(name)) {
          continue;
        }
        functions.push({
          name,
          signature: match[0],
          file,
          lineNumber: line.lineNumber,
        });
        break;
      }
    }
  }

  return functions;
}

/**
 * Scan workspace for existing function definitions matching the name.
 * Uses fast local filesystem traversal, ignoring node_modules, .git, dist, etc.
 */
export async function findDuplicateSymbolInWorkspace(
  workspaceRoot: string,
  targetFunction: ExtractedFunction
): Promise<EvidenceItem | null> {
  const ignoredDirs = new Set(["node_modules", ".git", "dist", "build", ".bun", ".verity", "coverage"]);

  async function walk(dir: string): Promise<EvidenceItem | null> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name)) {
            const found = await walk(join(dir, entry.name));
            if (found) return found;
          }
        } else if (entry.isFile()) {
          const fullPath = join(dir, entry.name);
          const relPath = relative(workspaceRoot, fullPath);

          // Skip the file where the function was just added, and skip test files
          if (relPath === targetFunction.file || relPath.includes(".test.") || relPath.includes(".spec.")) {
            continue;
          }

          // Only scan source code files
          if (!/\.(ts|js|tsx|jsx|py|go|rs|java|rb|php)$/.test(entry.name)) {
            continue;
          }

          const content = await readFile(fullPath, "utf-8");
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pattern of FUNCTION_DECLARATION_PATTERNS) {
              const match = line.match(pattern);
              if (match && match[1] === targetFunction.name) {
                // Found an existing definition of this function name!
                return {
                  type: "symbol_match",
                  file: relPath,
                  lineStart: i + 1,
                  lineEnd: i + 1,
                  snippet: line.trim(),
                  explanation: `Fungsi '${targetFunction.name}()' yang didefinisikan di ${targetFunction.file}:${targetFunction.lineNumber} sudah pernah didefinisikan sebelumnya di ${relPath}:${i + 1}.`,
                };
              }
            }
          }
        }
      }
    } catch {
      // Ignore read errors
    }
    return null;
  }

  return walk(workspaceRoot);
}
