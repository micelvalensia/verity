# 🛡️ VerityReview

> **Evidence-Based AI Code Review Framework & Local-First MCP Server**  
> *"No evidence, no verified pass."*

[![Built with Bun](https://img.shields.io/badge/runtime-Bun-f472b6.svg)](https://bun.sh)
[![Protocol](https://img.shields.io/badge/MCP-Model_Context_Protocol-blue.svg)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-11%20passed-brightgreen.svg)](#testing)

---

## 📖 Overview

As developers embrace AI coding assistants and *vibe coding*, the sheer volume of code changes explodes. However, relying purely on prompts or `.cursorrules` often fails due to **instruction drift**—agents focus on feature delivery and inadvertently bypass architectural, security, or clean-code constraints.

**VerityReview** shifts review left to the developer's local machine. Running as a **local MCP server (`stdio`)** and a **Git pre-commit guard**, Verity acts as an adversarial, evidence-demanding verifier:
- It **never trusts claims without physical proof** (exact line citations or AST symbol matches).
- It rejects naive binary passes in favor of a **Tri-State decision engine** (`PASS`, `FAIL`, `UNKNOWN`).
- It stamps every verified commit with a **cryptographic SHA-256 receipt** as Git commit metadata.

```text
┌────────────────────────────────────────────────────────┐
│ Developer Local Machine (0 Cloud Cost, 100% Privacy)   │
│                                                        │
│  AI Coding Agent (Antigravity CLI, Cursor, Windsurf)   │
│     │ (stdio MCP JSON-RPC)                             │
│     ▼                                                  │
│  VerityReview MCP Engine                               │
│     ├── 1. Context & Diff Parser (Hunks & Line Ranges) │
│     ├── 2. Rule Matcher (Built-in + .verity/ rules)    │
│     ├── 3. Deterministic & Local Symbol DRY Search     │
│     ├── 4. Anti-Hallucination Evidence Validator       │
│     └── 5. Tri-State Decision Engine                   │
└────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

* **Tri-State Decision Engine (`PASS` / `FAIL` / `UNKNOWN`):**
  * `PASS`: Verified with concrete evidence (e.g. valid guard clause, line citation).
  * `FAIL`: Concrete violation found. Pre-commit hooks will abort `git commit`.
  * `UNKNOWN`: Missing context or ambiguous intent. Explicitly flagged for 1-minute human review instead of silently assuming safety.
* **Zero-Token DRY Detection:** Identifies duplicate functions or utilities across your entire codebase in milliseconds using local filesystem AST traversal before invoking an LLM.
* **Cryptographic Git Receipts:** Successful commits automatically receive Git Commit Trailers (`Verity-Status`, `Verity-Receipt: <sha256>`), allowing CI and Team Leads to immediately identify unreviewed bypasses.
* **PR Evidence Dossier:** Generates clean, ready-to-paste Markdown tables summarizing the evidence for Pull Request descriptions.
* **Extensible & Team-Friendly:** Define custom architectural rules in `.verity/rules/*.yaml` that version-control alongside your repository.

---

## 🚀 Quick Start

### 1. Installation

Clone and link VerityReview globally on your machine using [Bun](https://bun.sh):

```bash
git clone https://github.com/your-username/verity-review.git
cd verity-review
bun install
bun link
```

Verify installation:
```bash
verity --version
verity rules
```

---

## 🛠️ CLI Usage

Navigate to any Git project in your terminal:

### Audit Working Changes (Unstaged)
```bash
verity check --working
```

### Audit Staged Changes (`git diff --cached`)
```bash
verity check --staged
```

### Install Git Pre-Commit Hook
Install the automated guard in your local project's `.git/hooks/`:
```bash
verity hook install
```
*If any rule evaluates to `FAIL`, `git commit` is immediately aborted and line-level violations are displayed in your terminal.*

### Generate PR Evidence Dossier
```bash
verity dossier --working
```

---

## 🤖 MCP Server Setup (For Vibe Coding with AI)

Verity exposes an official Model Context Protocol (MCP) server over `stdio`, providing tools like `verity_review_diff`, `verity_list_rules`, and `verity_generate_dossier`.

### Option A: Antigravity CLI (`agy`)
Add to `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "verity": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/verity-review/src/mcp/server.ts"]
    }
  }
}
```

Add a `GEMINI.md` (or `.cursorrules`) to your project root to instruct the agent:
```markdown
# Quality Gate (VerityReview)

Pedoman penggunaan tool `verity_review_diff`:
1. **Kapan dipanggil:** Panggil `verity_review_diff` HANYA SATU KALI setelah selesai mengedit kode fitur/logika (misal file di `src/`, `components/`, dll) sebelum commit.
2. **Kapan JANGAN dipanggil:** JANGAN memanggil Verity jika tugasnya hanya membuat/mengedit rules (`.verity/**`), file dokumentasi (`.md`), atau konfigurasi.
3. **Aturan Semantik:** Jika ada rule semantik (muncul di daftar `semanticAudits`), baca kriterianya:
   - Jika kode yang baru kamu ubah melanggar kriteria tersebut, perbaiki kodenya.
   - Jika kode sudah sesuai atau tidak relevan, langsung selesaikan task dan laporkan ke user. JANGAN memanggil Verity berulang-ulang!
```

### Option B: Cursor / Windsurf
Add to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in your workspace):
```json
{
  "mcpServers": {
    "verity": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/verity-review/src/mcp/server.ts"]
    }
  }
}
```

---

## 📋 Built-in Rules (`verity:core`)

| Rule ID | Severity | Description |
| :--- | :---: | :--- |
| `GEN-SEC-001` | **CRITICAL** | **No Hardcoded Secrets:** Detects API keys, private keys, tokens, and credentials. |
| `GEN-DRY-001` | **HIGH** | **No Duplicate Code:** Catches identical function signatures existing in other files. |
| `GEN-ERR-001` | **HIGH** | **No Silent Error Swallowing:** Disallows empty `catch`/`except` blocks. |
| `GEN-ARCH-001` | **MEDIUM** | **Code Splitting:** Flags single files > 300 lines or functions > 50 lines. |
| `GEN-CLN-001` | **MEDIUM** | **No Leftover Debugger Code:** Flags `console.log`, `debugger`, or ad-hoc print calls. |
| `GEN-CLN-002` | **MEDIUM** | **Early Exit over Deep Nesting:** Enforces guard clauses; disallows nesting depth > 3. |
| `GEN-CLN-003` | **LOW** | **No Magic Numbers:** Flags unassigned literals in business conditionals for review. |

---

## 🧩 Adding Custom Rules for Your Team

To add custom team or project-specific rules, create a `.verity/rules/` directory inside your project root:

```text
my-project/
├── .verity/
│   ├── config.yaml          # Optional config overrides
│   └── rules/
│       └── AUTH-001.yaml    # Your custom rule
```

### 1. Deterministic Rule (Checked locally via Regex & AST)
```yaml
id: AUTH-001
name: Mandatory Auth Guard on Admin Routes
severity: critical
file_patterns:
  - "src/routes/admin/**/*.ts"
criteria: |
  All route definitions in admin directories must apply authentication middleware.
verification:
  method: deterministic
  regex_patterns:
    - "(authGuard|verifyAdmin|requireRole)"
```

### 2. Semantic Rule (Evaluated directly by your AI Coding Agent)
No separate API key or cloud billing required. Verity detects semantic rules and instructs your current coding agent (e.g. Antigravity / Cursor) to inspect the diff and fix violations:
```yaml
id: NO-EMOTE-001
name: No Emojis in Code Comments
severity: high
file_patterns:
  - "**/*"
criteria: |
  Hapus semua komentar kode yang mengandung emote atau emoji.
verification:
  method: semantic
```

---

## 🧪 Testing

Run the test suite using Bun:

```bash
bun test
```

All 11 test suites (Diff Parser, Rule Matcher, DRY Symbol Search, and Verification Engine) execute in < 500ms.

---

## 📄 License

[MIT](LICENSE) © 2026 VerityReview Authors
