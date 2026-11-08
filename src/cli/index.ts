import { Command } from "commander";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getStagedDiff, getWorkingDiff } from "../core/diff";
import { generateEvidenceDossier } from "../core/dossier";
import { formatGitTrailers } from "../core/receipt";
import { loadRules } from "../core/rules";
import type { ReviewSummary } from "../core/types";
import { verifyDiff } from "../core/verifier";
import { startMcpServer } from "../mcp/server";
import { installGitHook } from "./hook";


// ANSI escape codes for clean terminal output
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export function createCli(): Command {
  const program = new Command();

  program
    .name("verity")
    .description("Evidence-Based AI Code Review Framework & Local MCP Server")
    .version("0.1.0");

  // Command: verity check
  program
    .command("check")
    .description("Audit git diff against loaded rules")
    .option("--staged", "Only audit staged changes (git diff --cached)", false)
    .option("--working", "Audit unstaged working changes (git diff)", false)
    .action(async (options) => {
      try {
        console.log(`\n${colors.bold}${colors.cyan}🔍 VerityReview — Evidence-Based Audit${colors.reset}`);
        console.log(`${colors.gray}Loading rules and diff...${colors.reset}\n`);

        const rules = await loadRules();
        const isStaged = options.staged || !options.working;
        const diff = isStaged ? await getStagedDiff() : await getWorkingDiff();

        if (diff.files.length === 0) {
          console.log(`${colors.green}✓ Tidak ada perubahan yang perlu diperiksa.${colors.reset}\n`);
          process.exit(0);
        }

        const summary = await verifyDiff(diff, rules, { isStaged });

        // Print results table
        console.log(`${colors.bold}Files analyzed (${summary.filesAnalyzed.length}):${colors.reset}`);
        for (const file of summary.filesAnalyzed) {
          console.log(`  ${colors.gray}• ${file}${colors.reset}`);
        }
        console.log("");

        console.log(`${colors.bold}Evaluation Results (${summary.totalRules} rules):${colors.reset}`);
        for (const res of summary.results) {
          let badge = `${colors.green} PASS ${colors.reset}`;
          if (res.status === "FAIL") badge = `${colors.red} FAIL ${colors.reset}`;
          else if (res.status === "UNKNOWN") badge = `${colors.yellow} UNKNOWN ${colors.reset}`;

          const severityTag = `[${res.severity.toUpperCase()}]`;
          console.log(` ${badge} ${colors.bold}${res.ruleId}${colors.reset} ${colors.gray}${severityTag}${colors.reset} — ${res.ruleName}`);

          if (res.status === "FAIL" || res.status === "UNKNOWN") {
            if (res.evidence.length > 0) {
              for (const ev of res.evidence) {
                const lineInfo = ev.lineStart ? `:${ev.lineStart}` : "";
                const colorPrefix = res.status === "FAIL" ? colors.red : colors.yellow;
                console.log(`       ${colorPrefix}↳ ${ev.file}${lineInfo}:${colors.reset} ${ev.explanation}`);
                if (ev.snippet) {
                  console.log(`         ${colors.gray}"${ev.snippet}"${colors.reset}`);
                }
              }
            } else {
              console.log(`       ${colors.yellow}↳ [Audit Semantik]:${colors.reset} ${res.message}`);
            }
          }
        }

        if (summary.semanticAudits && summary.semanticAudits.length > 0) {
          console.log(`\n${colors.bold}${colors.cyan}🤖 Perlu Evaluasi AI Agent / Developer (${summary.semanticAudits.length} rules):${colors.reset}`);
          for (const task of summary.semanticAudits) {
            console.log(`  • ${colors.bold}${task.ruleId}${colors.reset}: "${task.criteria}" (Target: ${task.files.join(", ")})`);
          }
        }

        console.log(`\n${colors.bold}Summary:${colors.reset}`);
        console.log(`  Passed:  ${colors.green}${summary.passed}${colors.reset}`);
        console.log(`  Failed:  ${colors.red}${summary.failed}${colors.reset}`);
        console.log(`  Unknown: ${colors.yellow}${summary.unknown}${colors.reset}`);

        if (summary.overallDecision === "APPROVE") {
          console.log(`\n${colors.bold}${colors.green}✅ DECISION: APPROVE${colors.reset}`);
          console.log(`${colors.gray}Receipt: ${summary.receipt}${colors.reset}\n`);

          // Save receipt to .verity/last-receipt.json
          try {
            await mkdir(".verity", { recursive: true });
            await writeFile(".verity/last-receipt.json", JSON.stringify(summary, null, 2), "utf-8");
          } catch {}

          process.exit(0);
        } else if (summary.overallDecision === "HUMAN_REVIEW") {
          console.log(`\n${colors.bold}${colors.yellow}⚠️ DECISION: HUMAN_REVIEW${colors.reset}`);
          console.log(`${colors.yellow}Beberapa rule berstatus UNKNOWN dan memerlukan tinjauan developer/lead.${colors.reset}\n`);

          try {
            await mkdir(".verity", { recursive: true });
            await writeFile(".verity/last-receipt.json", JSON.stringify(summary, null, 2), "utf-8");
          } catch {}

          process.exit(0); // UNKNOWN does not block commit, but gets flagged
        } else {
          console.log(`\n${colors.bold}${colors.red}❌ DECISION: REQUEST_CHANGES${colors.reset}`);
          console.log(`${colors.red}Commit dibatalkan. Perbaiki temuan FAIL di atas sebelum melakukan commit.${colors.reset}\n`);
          process.exit(1);
        }
      } catch (err: any) {
        console.error(`${colors.red}[Verity Error] ${err.message}${colors.reset}`);
        process.exit(1);
      }
    });

  // Command: verity rules
  program
    .command("rules")
    .description("List all active rules")
    .action(async () => {
      const rules = await loadRules();
      console.log(`\n${colors.bold}${colors.cyan}📋 VerityReview Active Rules (${rules.length}):${colors.reset}\n`);
      for (const r of rules) {
        const sevColor = r.severity === "critical" ? colors.red : r.severity === "high" ? colors.yellow : colors.gray;
        console.log(`  ${colors.bold}${r.id.padEnd(14)}${colors.reset} ${sevColor}[${r.severity.toUpperCase().padEnd(8)}]${colors.reset} ${r.name}`);
      }
      console.log("");
    });

  // Command: verity hook install
  program
    .command("hook")
    .command("install")
    .description("Install Git pre-commit and commit-msg hooks")
    .action(async () => {
      const res = await installGitHook();
      if (res.success) {
        console.log(`\n${colors.green}✓ ${res.message}${colors.reset}\n`);
      } else {
        console.error(`\n${colors.red}✗ ${res.message}${colors.reset}\n`);
        process.exit(1);
      }
    });

  // Command: verity append-trailer <commitMsgFile>
  program
    .command("append-trailer <file>")
    .description("Append Verity trailers to git commit message")
    .action(async (file) => {
      try {
        const receiptPath = join(process.cwd(), ".verity", "last-receipt.json");
        const receiptContent = await readFile(receiptPath, "utf-8");
        const summary: ReviewSummary = JSON.parse(receiptContent);

        const currentMsg = await readFile(file, "utf-8");
        const trailers = formatGitTrailers(summary);
        const updatedMsg = `${currentMsg.trimEnd()}\n\n${trailers}\n`;
        await writeFile(file, updatedMsg, "utf-8");
      } catch {
        // Silently ignore if no recent receipt exists
      }
    });

  // Command: verity dossier
  program
    .command("dossier")
    .description("Generate Markdown Evidence Dossier for PR description")
    .option("--staged", "Audit staged changes", false)
    .option("--working", "Audit unstaged changes", false)
    .action(async (options) => {
      try {
        const rules = await loadRules();
        const isStaged = options.staged || !options.working;
        const diff = isStaged ? await getStagedDiff() : await getWorkingDiff();

        if (diff.files.length === 0) {
          console.log("Tidak ada perubahan git untuk diaudit.");
          return;
        }

        const summary = await verifyDiff(diff, rules, { isStaged });
        console.log(generateEvidenceDossier(summary));
      } catch (err: any) {
        console.error(`[Verity Error] ${err.message}`);
        process.exit(1);
      }
    });

  // Command: verity mcp
  program
    .command("mcp")
    .description("Start the VerityReview Model Context Protocol (MCP) server")
    .action(async () => {
      await startMcpServer();
    });

  return program;
}
