# VerityReview — Project State & Handover

**Terakhir Diperbarui:** 2026-10-21  
**Status Saat Ini:** Fase 1, 2, 3, & 4 Selesai (Core Engine, Verification Pipeline, Git Hook, & MCP Server Siap)  
**Cabang Git:** `main`  
**Hasil Test:** 11 Pass, 0 Fail (100% Success)

---

## 📌 Ringkasan Keputusan & Implementasi Kunci
1. **Bentuk Produk:** Local-First MCP Server (`stdio`) berbasis Bun & TypeScript + Git Pre-Commit Hook + CLI.
2. **Filosofi:** *"No evidence, no verified pass"*.
3. **Tri-State Decision:** `PASS`, `FAIL`, dan `UNKNOWN` (wajib ditinjau manusia jika bukti kurang / ragu).
4. **Pre-Commit Enforcement:** Menolak commit lokal jika ada rule `Critical`/`High` berstatus `FAIL` (`exit 1`).
5. **Anti-Bypass Receipt:** Commit yang lolos otomatis disematkan Git Commit Trailer (`Verity-Status`, `Verity-Receipt` SHA256, `Verity-Rules`).
6. **Anti-Duplikasi (DRY) Hemat Token:** Deteksi fungsi duplikat di luar git changes menggunakan *Local Symbol Search* (0 token), menghasilkan bukti `symbol_match` secara instan (43ms).
7. **MCP Server:** Menyediakan tools `verity_review_diff`, `verity_list_rules`, dan `verity_generate_dossier` untuk coding agent di IDE (Cursor, Claude Code, Antigravity, dll).

---

## 📂 Struktur File Terkini
```text
miga/
├── bin/
│   └── verity.ts             # CLI executable entrypoint
├── src/
│   ├── core/
│   │   ├── types.ts          # Zod schemas & TypeScript types (Diff, Rules, Evidence, Summary)
│   │   ├── diff.ts           # Git diff parser (unified diff, hunks, addedLines with line numbers)
│   │   ├── rules.ts          # Rule loader & matcher (Bun.Glob, built-in + .verity/ rules)
│   │   ├── dry.ts            # Local symbol search & DRY duplicate function extractor (0 token)
│   │   ├── evidence.ts       # Anti-hallucination evidence validator
│   │   ├── receipt.ts        # SHA256 receipt & Git Commit Trailer generator
│   │   ├── dossier.ts        # Markdown Evidence Dossier generator for GitHub PRs
│   │   └── verifier.ts       # Verification pipeline & tri-state decision engine
│   ├── rules/                # 7 Built-in Framework Rules (verity:core)
│   │   ├── GEN-SEC-001.yaml  # No Hardcoded Secrets (Critical)
│   │   ├── GEN-DRY-001.yaml  # No Duplicate Code/Logic (High)
│   │   ├── GEN-ARCH-001.yaml # Code Splitting & Modularity (Medium)
│   │   ├── GEN-ERR-001.yaml  # No Silent Error Swallowing (High)
│   │   ├── GEN-CLN-001.yaml  # No Leftover Debugger Code (Medium)
│   │   ├── GEN-CLN-002.yaml  # Early Exit over Deep Nesting (Medium)
│   │   └── GEN-CLN-003.yaml  # No Magic Numbers / Unexplained Literals (Low)
│   ├── cli/
│   │   ├── index.ts          # Commander CLI commands (check, rules, hook, dossier, mcp)
│   │   └── hook.ts           # Git pre-commit & commit-msg hook installer
│   ├── mcp/
│   │   └── server.ts         # Stdio MCP Server (@modelcontextprotocol/sdk)
│   └── index.ts              # Core library export
├── tests/
│   ├── diff.test.ts          # 2 tests
│   ├── rules.test.ts         # 3 tests
│   ├── verifier.test.ts      # 5 tests
│   └── dry.test.ts           # 1 test
├── package.json              # verity-review v0.1.0 (MIT)
├── PRD.md                    # PRD v0.3
└── PROJECT_STATE.md
```

---

## 🚀 Perintah yang Siap Digunakan
- **Jalankan Audit Lokal:** `bun run bin/verity.ts check --working` atau `bun run bin/verity.ts check --staged`
- **Daftar Rules:** `bun run bin/verity.ts rules`
- **Generate PR Dossier:** `bun run bin/verity.ts dossier --working`
- **Install Git Hook:** `bun run bin/verity.ts hook install`
- **Nyalakan MCP Server:** `bun run src/mcp/server.ts` atau `bun run bin/verity.ts mcp`
- **Jalankan Unit Test:** `bun test`
