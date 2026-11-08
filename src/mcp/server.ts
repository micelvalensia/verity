import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getStagedDiff, getWorkingDiff } from "../core/diff";
import { generateEvidenceDossier } from "../core/dossier";
import { createCustomRule, loadRules } from "../core/rules";
import { verifyDiff } from "../core/verifier";

/**
 * Start the VerityReview Model Context Protocol (MCP) Server using stdio transport.
 */
export async function startMcpServer() {
  const server = new Server(
    {
      name: "verity-review",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "verity_review_diff",
          description:
            "Audit current local Git changes (staged or unstaged) against repository rules and Verity core rules. Enforces tri-state (PASS, FAIL, UNKNOWN) with exact line citations and cryptographic receipt.",
          inputSchema: {
            type: "object",
            properties: {
              staged: {
                type: "boolean",
                description: "If true, audits staged changes (`git diff --cached`). If false, audits unstaged working changes (`git diff`). Default: true.",
                default: true,
              },
              workspaceRoot: {
                type: "string",
                description: "Optional root path of the target workspace. Defaults to current working directory.",
              },
            },
          },
        },
        {
          name: "verity_list_rules",
          description:
            "List all active rules (both built-in and repository-custom rules from .verity/rules) with their severity, criteria, and evidence requirements.",
          inputSchema: {
            type: "object",
            properties: {
              workspaceRoot: {
                type: "string",
                description: "Optional root path of the target workspace. Defaults to current working directory.",
              },
            },
          },
        },
        {
          name: "verity_generate_dossier",
          description:
            "Audit git changes and generate a GitHub PR-ready Markdown Evidence Dossier table to attach to PR descriptions for Team Leads / Reviewers.",
          inputSchema: {
            type: "object",
            properties: {
              staged: {
                type: "boolean",
                description: "If true, audits staged changes. If false, audits unstaged working changes. Default: true.",
                default: true,
              },
              workspaceRoot: {
                type: "string",
                description: "Optional root path of the target workspace. Defaults to current working directory.",
              },
            },
          },
        },
        {
          name: "verity_create_rule",
          description:
            "Create a new custom rule YAML file inside .verity/rules/ in the current project workspace. ALWAYS call this tool whenever the user asks to create, add, or define a new Verity rule. NEVER search ~/.gemini, ps aux, or external folders.",
          inputSchema: {
            type: "object",
            required: ["id", "name", "criteria"],
            properties: {
              id: {
                type: "string",
                description: "Unique rule identifier (e.g. SEC-001, CLN-NO-EMOTE, ARCH-002)",
              },
              name: {
                type: "string",
                description: "Short human-readable title of the rule",
              },
              severity: {
                type: "string",
                enum: ["critical", "high", "medium", "low"],
                description: "Severity level of the rule (default: 'medium')",
                default: "medium",
              },
              file_patterns: {
                type: "array",
                items: { type: "string" },
                description: "Glob patterns of files to inspect (e.g. ['**/*'] or ['src/**/*.ts']). Default: ['**/*']",
                default: ["**/*"],
              },
              criteria: {
                type: "string",
                description: "Clear explanation in human language of what the rule requires or prohibits.",
              },
              verification_method: {
                type: "string",
                enum: ["deterministic", "semantic", "hybrid"],
                description: "Use 'deterministic' if there are regex patterns; use 'semantic' if it requires LLM reasoning/natural language understanding.",
                default: "semantic",
              },
              regex_patterns: {
                type: "array",
                items: { type: "string" },
                description: "Optional list of regex strings if verification_method is deterministic or hybrid.",
              },
              workspaceRoot: {
                type: "string",
                description: "Optional root path of the target workspace. Defaults to current working directory.",
              },
            },
          },
        },
      ],
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const workspaceRoot = (args?.workspaceRoot as string) || process.cwd();
    const staged = args?.staged !== false; // default true

    try {
      if (name === "verity_list_rules") {
        const rules = await loadRules(workspaceRoot);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rules, null, 2),
            },
          ],
        };
      }

      if (name === "verity_review_diff") {
        const rules = await loadRules(workspaceRoot);
        const diff = staged ? await getStagedDiff(workspaceRoot) : await getWorkingDiff(workspaceRoot);

        if (diff.files.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "NO_CHANGES",
                    message: "Tidak ada perubahan git yang terdeteksi untuk diaudit.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const summary = await verifyDiff(diff, rules, { workspaceRoot, isStaged: staged });

        let responseText = JSON.stringify(summary, null, 2);

        if (summary.semanticAudits && summary.semanticAudits.length > 0) {
          const semanticInstructions = summary.semanticAudits
            .map(
              (task, idx) =>
                `${idx + 1}. [${task.ruleId}] ${task.ruleName} (${task.severity.toUpperCase()})\n` +
                `   Files: ${task.files.join(", ")}\n` +
                `   Kriteria: "${task.criteria}"\n` +
                `   Tindakan Wajib untuk AI: ${task.actionRequired}`
            )
            .join("\n\n");

          responseText += `\n\n═══════════════════════════════════════════════════════════════════\n` +
            `🚨 PERHATIAN KHUSUS UNTUK AI AGENT (SEMANTIC AUDIT INSTRUCTIONS)\n` +
            `Terdapat ${summary.semanticAudits.length} rule semantik yang memerlukan evaluasi Anda secara langsung terhadap perubahan kode:\n\n` +
            `${semanticInstructions}\n\n` +
            `Jika kode yang baru Anda ubah melanggar kriteria di atas, Anda WAJIB segera memperbaiki kodenya sekarang sebelum menyelesaikan task!\n` +
            `═══════════════════════════════════════════════════════════════════`;
        }

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      }

      if (name === "verity_generate_dossier") {
        const rules = await loadRules(workspaceRoot);
        const diff = staged ? await getStagedDiff(workspaceRoot) : await getWorkingDiff(workspaceRoot);

        if (diff.files.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Tidak ada perubahan git yang terdeteksi untuk diaudit.",
              },
            ],
          };
        }

        const summary = await verifyDiff(diff, rules, { workspaceRoot, isStaged: staged });
        const dossier = generateEvidenceDossier(summary);
        return {
          content: [
            {
              type: "text",
              text: dossier,
            },
          ],
        };
      }

      if (name === "verity_create_rule") {
        const id = (args?.id as string) || "CUSTOM-001";
        const ruleName = (args?.name as string) || id;
        const criteria = (args?.criteria as string) || "";
        const severity = (args?.severity as any) || "medium";
        const file_patterns = (args?.file_patterns as string[]) || ["**/*"];
        const verification_method = (args?.verification_method as any) || "semantic";
        const regex_patterns = (args?.regex_patterns as string[]) || undefined;

        if (!criteria) {
          throw new Error("Field 'criteria' wajib diisi untuk mendefinisikan aturan.");
        }

        const { path, rule } = await createCustomRule(workspaceRoot, {
          id,
          name: ruleName,
          severity,
          file_patterns,
          criteria,
          verification_method,
          regex_patterns,
        });

        return {
          content: [
            {
              type: "text",
              text: `✅ Rule '${rule.id}' (${rule.name}) berhasil dibuat!\nLokasi: ${path}\nTipe: ${rule.verification?.method}\nSeverity: ${rule.severity}\nRule ini sekarang aktif dan akan otomatis dievaluasi oleh Verity pada proyek ini.`,
            },
          ],
        };
      }

      throw new Error(`Tool unknown: ${name}`);
    } catch (err: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `[Verity Error] ${err.message}`,
          },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// If run directly
if (import.meta.main) {
  startMcpServer().catch((err) => {
    console.error("Fatal MCP error:", err);
    process.exit(1);
  });
}
