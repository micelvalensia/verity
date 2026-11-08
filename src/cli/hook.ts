import { chmod, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Install Git pre-commit and commit-msg hooks into the local repository.
 */
export async function installGitHook(workspaceRoot: string = process.cwd()): Promise<{ success: boolean; message: string }> {
  const gitDir = join(workspaceRoot, ".git");
  if (!existsSync(gitDir)) {
    return {
      success: false,
      message: "Bukan repository Git (folder .git tidak ditemukan). Jalankan 'git init' terlebih dahulu.",
    };
  }

  const hooksDir = join(gitDir, "hooks");

  // 1. Pre-commit hook
  const preCommitPath = join(hooksDir, "pre-commit");
  const preCommitScript = `#!/bin/sh
# VerityReview Pre-commit Guard
if command -v verity >/dev/null 2>&1; then
  verity check --staged
elif command -v bunx >/dev/null 2>&1; then
  bunx verity-review check --staged
elif command -v npx >/dev/null 2>&1; then
  npx verity-review check --staged
else
  echo "[Verity] Warning: verity command not found in PATH, skipping local pre-commit check."
  exit 0
fi
`;

  await writeFile(preCommitPath, preCommitScript, { mode: 0o755 });
  await chmod(preCommitPath, 0o755);

  // 2. Commit-msg hook (to append trailers)
  const commitMsgPath = join(hooksDir, "commit-msg");
  const commitMsgScript = `#!/bin/sh
# VerityReview Commit Trailer Appender
if command -v verity >/dev/null 2>&1; then
  verity append-trailer "$1"
elif command -v bunx >/dev/null 2>&1; then
  bunx verity-review append-trailer "$1"
elif command -v npx >/dev/null 2>&1; then
  npx verity-review append-trailer "$1"
fi
`;

  await writeFile(commitMsgPath, commitMsgScript, { mode: 0o755 });
  await chmod(commitMsgPath, 0o755);

  return {
    success: true,
    message: "Git pre-commit dan commit-msg hooks berhasil dipasang di .git/hooks/",
  };
}
