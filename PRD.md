# PRD — VerityReview: Evidence-Based AI Code Review Framework

**Versi:** 0.3  
**Status:** In Review / Ready for Implementation  
**Nama Produk:** VerityReview  
**Bentuk Produk:** Local-First MCP Server (`stdio`), Core CLI, & Git Hook  
**Tech Stack:** TypeScript / Bun  
**Distribusi:** npm package (`npx verity-review` / `bunx verity-review`)

---

## 1. Latar Belakang & Problem Statement

Maraknya penggunaan AI coding assistant dan tren *vibe coding* membuat penulisan kode menjadi sangat cepat. Namun hal ini memicu masalah baru bagi **Team Lead dan Senior Code Reviewer**:
1. **Volume PR membengkak:** Reviewer kewalahan membaca ratusan baris kode baru per hari.
2. **Instruction Drift pada `.cursorrules` / System Prompt:** Saat developer *vibe coding*, AI berfokus menyelesaikan fitur dan kerap melupakan/mengabaikan aturan arsitektur & keamanan setelah percakapan panjang.
3. **AI Reviewer Tradisional yang Memperlambat Deployment:** Menaruh bot AI di GitHub PR (CI) seringkali lambat, menghasilkan *alert fatigue* (komentar panjang tanpa bukti konklusif), dan memicu *ping-pong* review antara developer dan team lead.
4. **Bypass / Tidak Ada Jaminan Review:** Tidak ada cara mudah bagi reviewer untuk mengetahui apakah kode yang di-push benar-benar sudah diaudit atau langsung di-push begitu saja.

VerityReview hadir dengan pendekatan **Shift-Left Local-First**: framework audit kode berbasis bukti (*evidence*) yang berjalan langsung di komputer lokal developer sebelum kode di-commit atau di-push ke repository.

---

## 2. Prinsip Inti Produk

> **"No evidence, no verified pass."**  
> Sistem tidak boleh menyatakan sebuah kode aman hanya karena LLM berasumsi demikian. Setiap klaim wajib menyertakan bukti fisik (baris kode riil, AST node, atau hasil test). **Jika bukti tidak lengkap atau AI tidak yakin, status WAJIB menjadi `UNKNOWN` untuk ditinjau oleh manusia.**

---

## 3. Logika Keputusan Tri-State (`PASS` / `FAIL` / `UNKNOWN`)

VerityReview menolak logika biner (Pass/Fail) naif. Setiap rule menghasilkan salah satu dari 3 status:

1. **`PASS` (Terverifikasi Lolos):**
   * Memiliki bukti konkret bahwa kriteria terpenuhi (misal: sanitasi input ada di baris terkait, middleware auth terpasang, atau test exit code 0).
   * Status ini **menghemat waktu Team Lead** — bagian ini tidak perlu dipelototi lagi.
2. **`FAIL` (Terbukti Melanggar):**
   * Ditemukan bukti konkret adanya pelanggaran terhadap rule (misal: plain text secret ditemukan, unhandled promise terdeteksi, atau fungsi terduplikasi).
   * Commit otomatis dibatalkan atau developer wajib memperbaiki sebelum membuat PR.
3. **`UNKNOWN` (Butuh Tinjauan Manusia / `HUMAN_REVIEW`):**
   * Terjadi jika: konteks diff kurang luas, AI tidak memiliki kepastian tinggi, atau bukti yang diajukan tidak memenuhi standar validasi.
   * **UX untuk Reviewer:** Sistem menghasilkan *Evidence Dossier* ringkas yang secara spesifik menunjuk titik yang belum pasti (*"Tolong cek baris 45-50 apakah pemanggilan service X sudah terotorisasi"*). Team Lead cukup menghabiskan 1–2 menit meninjau titik ini saja, bukan membaca 500 baris kode secara buta.

---

## 4. Mekanisme Penanda Pra-Commit & Cryptographic Receipt

Untuk mencegah developer melewati (*bypass*) proses audit sebelum push:

### A. Git Pre-Commit Hook (`bunx verity hook install`)
* Terpasang secara otomatis di `.git/hooks/pre-commit`.
* Berjalan saat developer mengetik `git commit`.
* Hanya memeriksa perubahan yang sudah di-stage (`git diff --cached`), menjaga waktu eksekusi tetap kilat (1–2 detik).
* **Jika ada rule `FAIL`:** Commit langsung dibatalkan (`exit 1`) dan baris kode yang melanggar ditampilkan di terminal.

### B. Git Commit Trailer & Receipt Checksum
Jika seluruh rule berstatus `PASS` atau `UNKNOWN` yang dapat diterima:
1. Verity menghitung cryptographic hash:
   $$\text{Receipt} = \text{SHA256}(\text{staged diff} + \text{rules checksum} + \text{timestamp})$$
2. Verity otomatis menyisipkan **Git Commit Trailers** ke dalam pesan commit:
   ```git
   feat: implement checkout payment logic

   Verity-Status: PASS
   Verity-Receipt: a8f9c1b2d3...
   Verity-Rules: GEN-SEC-001,GEN-DRY-001,GEN-ARCH-001
   ```
3. **Deteksi di CI/GitHub PR (1 Detik):**
   * 🟢 **PRE-REVIEWED:** Commit memiliki trailer receipt valid yang cocok dengan diff SHA.
   * 🔴 **UNREVIEWED / BYPASS:** Commit tidak memiliki trailer atau hash tidak cocok (misal di-commit pakai `--no-verify`). PR otomatis ditandai `⚠️ unreviewed`.

---

## 5. Efisiensi Token & Deteksi Duplikasi (DRY) Lintas Repo

### Masalah Token & Duplikasi di Luar Git Changes:
* Melempar seluruh repository ke LLM untuk mendeteksi duplikasi akan menghabiskan ribuan token dan mahal.
* Namun jika hanya membaca diff, AI tidak tahu jika fungsi serupa sudah pernah dibuat di file lain.

### Solusi Cerdas Verity (Deterministic-First Search):
1. **Local Symbol & AST Extractor (Token = 0):** Saat membaca diff, Verity mengekstrak nama dan signature fungsi baru secara lokal.
2. **Local Grep / Tree-sitter Search (Token = 0):** Verity melakukan lookup secepat kilat (menggunakan ripgrep/AST) di seluruh codebase lokal untuk mencari fungsi dengan nama/tujuan serupa.
3. **Targeted LLM Comparison (~300 Token):** Jika ditemukan kandidat yang mirip, Verity hanya mengirimkan 2 potongan kecil (fungsi baru vs fungsi lama yang ada di file lain) ke LLM untuk memastikan kesamaan semantik.
4. **Estimasi Biaya:** Konsumsi rata-rata per review hanya **1.000 – 2.500 token** (~Rp 15 - Rp 30 per review pada model flash/mini).

---

## 6. Katalog Rules Bawaan Framework (`verity:core`)

### A. Keamanan & Kebersihan Dasar
1. **`GEN-SEC-001: No Hardcoded Secrets` (Severity: `critical`)**
   * *Kriteria:* Larangan keras menyimpan credential, API keys, private key, atau secret token dalam bentuk string literal.
2. **`GEN-ERR-001: No Silent Error Swallowing` (Severity: `high`)**
   * *Kriteria:* Blok `catch`/`except` tidak boleh kosong atau menelan error tanpa logging/penanganan yang memadai.
3. **`GEN-CLN-001: No Leftover Debugger Code` (Severity: `medium`)**
   * *Kriteria:* Tidak boleh ada sisa `console.log`, `debugger`, `print()`, atau `dump()` pada perubahan baru.

### B. Clean Code & Arsitektur
4. **`GEN-DRY-001: No Duplicate Code / Logic` (Severity: `high`)**
   * *Kriteria:* Fungsi, utilitas, atau logika bisnis yang identik tidak boleh dibuat ulang jika sudah ada fungsi serupa di repository atau di dalam diff.
5. **`GEN-ARCH-001: Code Splitting & Modularity` (Severity: `medium`)**
   * *Kriteria:* 
     * Panjang file baru/refaktor tidak boleh melebihi batas wajar (> 250-300 baris tanpa modularisasi).
     * Satu fungsi tidak boleh terlalu panjang (> 40-50 baris).
     * UI component tidak boleh mencampur database query / raw API calls langsung tanpa service/hook abstraction.
6. **`GEN-CLN-002: Early Exit over Deep Nesting` (Severity: `medium`)**
   * *Kriteria:* Maksimal level nesting kondisional adalah 2–3 tingkat. Wajib utamakan *Guard Clauses / Early Return*.
7. **`GEN-CLN-003: No Magic Numbers / Unexplained Literals` (Severity: `low`)**
   * *Kriteria:* Angka konstan atau status raw wajib didefinisikan ke dalam variabel bernama atau enum.

---

## 7. Arsitektur Produk & Antarmuka MCP

Sistem tidak membutuhkan server cloud 24/7 (Zero infrastructure cost, 100% code privacy).

```text
┌────────────────────────────────────────────────────────┐
│ Developer Environment (Local Machine)                  │
│                                                        │
│  IDE (Cursor, Claude Code, Windsurf, Antigravity)      │
│     │ (stdio JSON-RPC)                                 │
│     ▼                                                  │
│  VerityReview MCP Server (Bun / TypeScript)            │
│     ├── 1. Context & Diff Parser (Git diff & Hunks)    │
│     ├── 2. Rule Matcher (Built-in + Local Custom)      │
│     ├── 3. Verification Pipeline (Deterministic + LLM) │
│     ├── 4. Evidence Validator (Anti-Halusinasi)        │
│     └── 5. Decision Engine (PASS / FAIL / UNKNOWN)     │
└────────────────────────────────────────────────────────┘
```

### Tools MCP yang Disediakan:
1. `verity_review_diff`: Mengaudit git diff lokal (staged/unstaged) berdasarkan rules aktif.
2. `verity_list_rules`: Menampilkan daftar rule yang berlaku untuk workspace saat ini.
3. `verity_get_evidence`: Mengambil detail bukti teknis dan rantai logika dari temuan tertentu.
4. `verity_generate_dossier`: Menghasilkan ringkasan bukti format Markdown untuk ditempel di PR GitHub bagi Team Lead.

---

## 8. Sistem Rules: Hierarki & Kustomisasi

Rules tidak disimpan di cloud, melainkan ter-versioning bersama codebase di dalam folder `.verity/`.

```text
my-project/
├── .verity/
│   ├── config.yaml          <-- Mengatur rule bawaan mana yang aktif
│   └── rules/               <-- Rules custom buatan tim sendiri
│       ├── SEC-CUSTOM-001.yaml
│       └── ARCH-002.yaml
├── package.json
└── src/
```

User dapat menggunakan aturan bawaan (`extends: ["verity:recommended"]`) sekaligus menambahkan aturan spesifik tim yang di-versioning bersama Git.

---

## 9. Rencana Pengujian (Testing Strategy)

1. **Unit & Integration Test:** Menggunakan `bun test` dengan mock git diff dan fixture rules.
2. **MCP Inspector GUI:** Debugging protokol MCP menggunakan `@modelcontextprotocol/inspector`.
3. **End-to-End Client Test:** Pengujian langsung pada IDE (Cursor, Claude Desktop, Antigravity) melalui konfigurasi lokal.

---

## 10. Roadmap Pengembangan

### Fase 1: Core Engine & Rule Schema
- Implementasi Git diff parser & file hunk context extractor.
- Schema parser untuk `.verity/config.yaml` dan rules YAML.
- Rule matcher berdasarkan file patterns.

### Fase 2: Verification Engine & Evidence Validator
- Implementasi verifier deterministik (regex, AST, local symbol search ripgrep).
- Integrasi verifier semantik (LLM structured output).
- Evidence Validator mekanis (validasi keberadaan baris kode & commit integrity).
- Decision Engine penghitung `PASS`, `FAIL`, `UNKNOWN`.

### Fase 3: Pre-Commit Hook & Receipt Engine
- CLI command `verity hook install`.
- Generator cryptographic hash receipt & Git Commit Trailers.

### Fase 4: MCP Server Implementation
- Setup MCP server menggunakan `@modelcontextprotocol/sdk` via `stdio`.
- Implementasi tools MCP: `verity_review_diff`, `verity_list_rules`, `verity_generate_dossier`.
- Pengujian menggunakan MCP Inspector.

### Fase 5: Packaging & Distribution
- CLI entrypoint (`bin/verity.ts`).
- Konfigurasi `package.json` untuk publikasi ke npm registry (`npx verity-review`).
