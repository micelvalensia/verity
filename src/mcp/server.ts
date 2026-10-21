import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getStagedDiff, getWorkingDiff } from "../core/diff";
import { generateEvidenceDossier } from "../core/dossier";
import { loadRules } from "../core/rules";
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(summary, null, 2),
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
