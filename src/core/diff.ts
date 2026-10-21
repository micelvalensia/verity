import { spawn } from "node:child_process";
import type { AddedLine, DiffHunk, DiffLine, FileDiff, ParsedDiff } from "./types";

/**
 * Parse standard unified git diff string into structured FileDiff objects.
 */
export function parseGitDiff(rawDiff: string): ParsedDiff {
  const files: FileDiff[] = [];
  const lines = rawDiff.split("\n");

  let currentFile: Partial<FileDiff> | null = null;
  let currentHunk: DiffHunk | null = null;
  let currentOldLine = 0;
  let currentNewLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File header start: diff --git a/path b/path
    if (line.startsWith("diff --git ")) {
      if (currentFile && currentFile.newPath) {
        if (currentHunk) {
          currentFile.hunks!.push(currentHunk);
          currentHunk = null;
        }
        files.push(currentFile as FileDiff);
      }

      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      const oldPath = match ? match[1] : undefined;
      const newPath = match ? match[2] : "";

      currentFile = {
        oldPath,
        newPath,
        isNew: false,
        isDeleted: false,
        isBinary: false,
        hunks: [],
        addedLines: [],
      };
      continue;
    }

    if (!currentFile) continue;

    // Detect new / deleted / binary
    if (line.startsWith("new file mode ")) {
      currentFile.isNew = true;
    } else if (line.startsWith("deleted file mode ")) {
      currentFile.isDeleted = true;
    } else if (line.startsWith("Binary files ") || line.includes("GIT binary patch")) {
      currentFile.isBinary = true;
    } else if (line.startsWith("--- ")) {
      if (line === "--- /dev/null") {
        currentFile.isNew = true;
      }
    } else if (line.startsWith("+++ ")) {
      if (line === "+++ /dev/null") {
        currentFile.isDeleted = true;
      } else {
        const p = line.replace(/^\+\+\+ (b\/)?/, "").trim();
        if (p) currentFile.newPath = p;
      }
    } else if (line.startsWith("@@ ")) {
      // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@ [optional heading]
      if (currentHunk) {
        currentFile.hunks!.push(currentHunk);
      }

      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (hunkMatch) {
        const oldStart = parseInt(hunkMatch[1], 10);
        const oldLines = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
        const newStart = parseInt(hunkMatch[3], 10);
        const newLines = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;
        const heading = hunkMatch[5]?.trim() || undefined;

        currentOldLine = oldStart;
        currentNewLine = newStart;

        currentHunk = {
          oldStart,
          oldLines,
          newStart,
          newLines,
          heading,
          lines: [],
        };
      }
    } else if (currentHunk) {
      if (line.startsWith("+")) {
        const content = line.slice(1);
        const diffLine: DiffLine = {
          type: "add",
          content,
          newLineNumber: currentNewLine,
        };
        currentHunk.lines.push(diffLine);
        currentFile.addedLines!.push({
          lineNumber: currentNewLine,
          content,
        });
        currentNewLine++;
      } else if (line.startsWith("-")) {
        const content = line.slice(1);
        const diffLine: DiffLine = {
          type: "del",
          content,
          oldLineNumber: currentOldLine,
        };
        currentHunk.lines.push(diffLine);
        currentOldLine++;
      } else if (line.startsWith(" ") || line === "") {
        const content = line.startsWith(" ") ? line.slice(1) : "";
        const diffLine: DiffLine = {
          type: "normal",
          content,
          oldLineNumber: currentOldLine,
          newLineNumber: currentNewLine,
        };
        currentHunk.lines.push(diffLine);
        currentOldLine++;
        currentNewLine++;
      }
    }
  }

  if (currentFile && currentFile.newPath) {
    if (currentHunk) {
      currentFile.hunks!.push(currentHunk);
    }
    files.push(currentFile as FileDiff);
  }

  return {
    files,
    raw: rawDiff,
  };
}

/**
 * Execute git command and return stdout as string.
 */
function execGit(args: string[], cwd: string = process.cwd()): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Git command failed (${code}): ${stderr}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Get staged changes (`git diff --cached`).
 */
export async function getStagedDiff(cwd?: string): Promise<ParsedDiff> {
  const raw = await execGit(["diff", "--cached", "--no-color"], cwd);
  return parseGitDiff(raw);
}

/**
 * Get unstaged working changes (`git diff`).
 */
export async function getWorkingDiff(cwd?: string): Promise<ParsedDiff> {
  const raw = await execGit(["diff", "--no-color"], cwd);
  return parseGitDiff(raw);
}

/**
 * Get diff for specific commit.
 */
export async function getCommitDiff(commitSha: string, cwd?: string): Promise<ParsedDiff> {
  const raw = await execGit(["diff", `${commitSha}^!`, "--no-color"], cwd);
  return parseGitDiff(raw);
}
