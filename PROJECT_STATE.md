# VerityReview — Project State & Handover

**Terakhir Diperbarui:** 2026-10-20  
**Status Saat Ini:** Fase 1 — Setup Project & PRD v0.3 Selesai  
**Cabang Git:** `main`

---

## 📌 Ringkasan Keputusan Kunci
1. **Bentuk Produk:** Local-First MCP Server (`stdio`) berbasis Bun & TypeScript + Git Pre-Commit Hook.
2. **Filosofi:** *"No evidence, no verified pass"*.
3. **Tri-State Decision:** `PASS`, `FAIL`, dan `UNKNOWN` (wajib ditinjau manusia jika bukti kurang / ragu).
4. **Pre-Commit Enforcement:** Menolak commit lokal jika ada rule `Critical`/`High` berstatus `FAIL`.
5. **Anti-Bypass Receipt:** Commit yang lolos otomatis disematkan Git Commit Trailer (`Verity-Status`, `Verity-Receipt` SHA256).
6. **Anti-Duplikasi (DRY) Hemat Token:** Deteksi fungsi duplikat di luar git changes menggunakan *Local Symbol/Grep Search* (0 token), lalu potongan kecil diverifikasi semantik oleh LLM (~300 token).

---

## 📂 Struktur File yang Sudah Dibuat
- `PRD.md`: Dokumen PRD v0.3 lengkap.
- `.gitignore`: Proteksi ketat untuk public repo (blokir `.env`, secrets, caches).
- `package.json`: Konfigurasi package Bun dengan `@modelcontextprotocol/sdk`, `zod`, `yaml`, `commander`.
- `src/core/types.ts`: Zod schemas & TypeScript types untuk rules, evidence, dan keputusan.
- `src/index.ts`: Entrypoint export core types.

---

## 🚀 Agenda Lanjutan untuk Besok (Next Steps)
1. **Membuat Katalog Built-in Rules (`src/rules/*.yaml`):**
   - `GEN-SEC-001` (No Hardcoded Secrets)
   - `GEN-DRY-001` (No Duplicate Functions/Logic)
   - `GEN-ARCH-001` (Code Splitting & Modularity)
   - `GEN-ERR-001` (No Silent Error Swallowing)
   - `GEN-CLN-001` (No Leftover Debugger Code)
   - `GEN-CLN-002` (Max Nesting Depth / Early Exit)
   - `GEN-CLN-003` (No Magic Numbers)
2. **Membangun Git Diff Parser (`src/core/diff.ts`):**
   - Membaca perubahan `git diff --cached` (staged files & hunks).
3. **Membangun Rule Loader & Matcher (`src/core/rules.ts`):**
   - Membaca rule bawaan + custom rules di `.verity/`.
