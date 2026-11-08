import { chmod, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Initialize .verity folder with rule templates, README, and GEMINI.md in the workspace.
 */
export async function initializeVerityProject(workspaceRoot: string = process.cwd()): Promise<string[]> {
  const createdItems: string[] = [];
  const verityDir = join(workspaceRoot, ".verity");
  const rulesDir = join(verityDir, "rules");

  // 1. Create .verity/rules/
  await mkdir(rulesDir, { recursive: true });

  // 2. Create .verity/rules/EXAMPLE-001.yaml if not present
  const exampleRulePath = join(rulesDir, "EXAMPLE-001.yaml");
  if (!existsSync(exampleRulePath)) {
    const exampleContent = `# -----------------------------------------------------------------------------
# CONTOH FORMAT RULE VERITY (.verity/rules/*.yaml)
# File ini berfungsi sebagai panduan dan template saat Anda atau AI membuat aturan tim baru.
# -----------------------------------------------------------------------------

# ID unik untuk rule ini (misal: SEC-001, ARCH-002, CLN-NO-EMOTE)
id: EXAMPLE-001

# Nama singkat aturan
name: Example Rule Template

# Tingkat keparahan (Severity):
# - critical : Pelanggaran fatal (Memblokir git commit secara mutlak)
# - high     : Pelanggaran serius (Memblokir git commit)
# - medium   : Pelanggaran moderat (Perlu diperbaiki sebelum merge)
# - low      : Saran / minor
severity: medium

# Target file yang diawasi (menggunakan glob pattern).
# Contoh: ["src/routes/**/*.ts"], ["**/*.tsx"], atau ["**/*"] untuk semua file.
file_patterns:
  - "**/*"

# Kriteria aturan dalam bahasa manusia (dibaca oleh developer dan AI Agent)
criteria: |
  Jelaskan aturan yang harus dipatuhi oleh kode di sini.
  Misalnya: "Semua komentar kode harus profesional dan tidak boleh memuat emoji."

# Metode Verifikasi:
# 1. deterministic : Menggunakan pola regex instan (dieksekusi lokal, 0 token)
# 2. semantic      : Menggunakan nalar AI Agent (untuk bahasa/logika abstrak)
# 3. hybrid        : Gabungan regex + evaluasi AI
verification:
  method: deterministic
  # regex_patterns: Daftar regex untuk mendeteksi pelanggaran (opsional jika method: semantic)
  regex_patterns:
    - "TODO_REPLACE_WITH_REGEX"

# Persyaratan Bukti (Evidence Requirements)
evidence_requirements:
  pass_condition: "Kondisi saat kode dinyatakan lolos aturan."
  fail_condition: "Kondisi saat kode terbukti melanggar aturan."
  unknown_condition: "Kondisi ambigu yang membutuhkan tinjauan manual manusia."
`;
    await writeFile(exampleRulePath, exampleContent, "utf-8");
    createdItems.push(".verity/rules/EXAMPLE-001.yaml");
  }

  // 3. Create GEMINI.md if not present
  const geminiMdPath = join(workspaceRoot, "GEMINI.md");
  if (!existsSync(geminiMdPath)) {
    const geminiContent = `# Quality Gate (VerityReview)

Pedoman penggunaan tool \`verity_review_diff\`:
1. **Kapan dipanggil:** Panggil \`verity_review_diff\` HANYA SATU KALI setelah selesai mengedit kode fitur/logika (misal file di \`src/\`, \`components/\`, dll) sebelum commit.
2. **Kapan JANGAN dipanggil:** JANGAN memanggil Verity jika tugasnya hanya membuat/mengedit rules (\`.verity/**\`), file dokumentasi (\`.md\`), atau konfigurasi.
3. **Aturan Semantik:** Jika ada rule semantik (muncul di daftar \`semanticAudits\`), baca kriterianya:
   - Jika kode yang baru kamu ubah melanggar kriteria tersebut, perbaiki kodenya.
   - Jika kode sudah sesuai atau tidak relevan, langsung selesaikan task dan laporkan ke user. JANGAN memanggil Verity berulang-ulang!

## Panduan Format Rules Baru (.verity/rules/*.yaml)
Jika user meminta membuat rule baru, JANGAN mencari ke luar workspace! Langsung buat file YAML di \`.verity/rules/<ID>.yaml\` menggunakan format ini:

\`\`\`yaml
id: ID-RULE-001
name: Judul Singkat Rule
severity: critical | high | medium | low
file_patterns:
  - "**/*"
criteria: |
  Penjelasan aturan yang harus dipatuhi kode.
verification:
  method: deterministic # (jika ada regex_patterns) ATAU semantic (jika logika bahasa)
  regex_patterns: # opsional untuk deterministic
    - "pola_regex"
\`\`\`
`;
    await writeFile(geminiMdPath, geminiContent, "utf-8");
    createdItems.push("GEMINI.md");
  }

  return createdItems;
}

/**
 * Install Git pre-commit and commit-msg hooks into the local repository,
 * and automatically scaffold .verity templates.
 */
export async function installGitHook(workspaceRoot: string = process.cwd()): Promise<{ success: boolean; message: string }> {
  const gitDir = join(workspaceRoot, ".git");
  if (!existsSync(gitDir)) {
    return {
      success: false,
      message: "Bukan repository Git (folder .git tidak ditemukan). Jalankan 'git init' terlebih dahulu.",
    };
  }

  // 1. Initialize .verity template & GEMINI.md
  const createdItems = await initializeVerityProject(workspaceRoot);

  const hooksDir = join(gitDir, "hooks");

  // 2. Pre-commit hook
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

  // 3. Commit-msg hook (to append trailers)
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

  let extraMsg = "";
  if (createdItems.length > 0) {
    extraMsg = `\n  Template otomatis dibuat:\n${createdItems.map((i) => `    • ${i}`).join("\n")}`;
  }

  return {
    success: true,
    message: `Git pre-commit dan commit-msg hooks berhasil dipasang di .git/hooks/.${extraMsg}`,
  };
}
