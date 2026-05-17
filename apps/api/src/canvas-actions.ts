import type { Intelligence, ToolCall, ToolDefinition, Workflow, WorkflowNode } from "@baryon/core";

type CanvasActionName =
  | "canvas_add_node"
  | "canvas_update_node"
  | "canvas_delete_node"
  | "canvas_connect_nodes"
  | "canvas_select_node"
  | "canvas_auto_layout"
  | "canvas_set_workflow_name"
  | "canvas_run_workflow";

export interface CanvasAction {
  name: CanvasActionName;
  input: Record<string, unknown>;
  source?: "model" | "text" | "fallback";
}

export interface CanvasActionResult {
  action: CanvasActionName;
  ok: boolean;
  message: string;
  nodeId?: string;
  edgeId?: string;
  selectedNodeId?: string | null;
}

export interface ApplyCanvasActionsResult {
  workflow: Workflow;
  changed: boolean;
  selectedNodeId?: string | null;
  runRequested: boolean;
  results: CanvasActionResult[];
}

interface NodeCatalogEntry {
  type: string;
  kind: WorkflowNode["kind"];
  name: string;
  aliases: string[];
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  workflowName: string;
  nodes: Array<{ key: string; type: string; name?: string; config?: Record<string, unknown> }>;
  links: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
}

export const canvasTools: ToolDefinition[] = [
  {
    name: "canvas_add_node",
    description: "Add one node to current canvas workflow.",
    risk: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        nodeType: { type: "string", description: "Exact node type, for example agent.run, telegram.trigger, http.request, shell.action." },
        name: { type: "string", description: "Optional visible node name." },
        key: { type: "string", description: "Optional temporary key used by later connect actions in same response." },
        config: { type: "object", additionalProperties: true },
        position: {
          type: "object",
          additionalProperties: false,
          properties: { x: { type: "number" }, y: { type: "number" } }
        }
      },
      required: ["nodeType"]
    }
  },
  {
    name: "canvas_update_node",
    description: "Update node name or config. Use node = selected for current selected node.",
    risk: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        node: { type: "string", description: "Node id, node name, node type, or selected." },
        name: { type: "string" },
        config: { type: "object", additionalProperties: true },
        provider: { type: "string" },
        model: { type: "string" },
        intelligence: { type: "string", enum: ["off", "low", "medium", "high"] }
      },
      required: ["node"]
    }
  },
  {
    name: "canvas_delete_node",
    description: "Delete one node from canvas.",
    risk: "destructive",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { node: { type: "string", description: "Node id, node name, node type, or selected." } },
      required: ["node"]
    }
  },
  {
    name: "canvas_connect_nodes",
    description: "Connect source node to target node. Use targetHandle soul, skill, or personality for AI Agent profile links.",
    risk: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        source: { type: "string" },
        target: { type: "string" },
        sourceHandle: { type: "string" },
        targetHandle: { type: "string" }
      },
      required: ["source", "target"]
    }
  },
  {
    name: "canvas_select_node",
    description: "Select a node so inspector opens on it.",
    risk: "read",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { node: { type: "string" } },
      required: ["node"]
    }
  },
  {
    name: "canvas_auto_layout",
    description: "Arrange canvas nodes left to right.",
    risk: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { direction: { type: "string", enum: ["horizontal", "vertical"] } }
    }
  },
  {
    name: "canvas_set_workflow_name",
    description: "Rename current canvas workflow.",
    risk: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { name: { type: "string" } },
      required: ["name"]
    }
  },
  {
    name: "canvas_run_workflow",
    description: "Run current canvas workflow after any requested edits.",
    risk: "write",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  }
];

const nodeCatalog: NodeCatalogEntry[] = [
  entry("manual.trigger", "trigger", "Manual Trigger", ["manual", "manual trigger", "channel input", "input"]),
  entry("schedule.trigger", "trigger", "Schedule Trigger", ["schedule", "cron", "timer"]),
  entry("webhook.trigger", "trigger", "Webhook Trigger", ["webhook", "http trigger"]),
  entry("github.trigger", "trigger", "GitHub Trigger", ["github trigger", "repo trigger"]),
  entry("jira.trigger", "trigger", "Jira Trigger", ["jira trigger"]),
  entry("slack.trigger", "trigger", "Slack Trigger", ["slack trigger"]),
  entry("email.trigger", "trigger", "Email Trigger", ["email trigger", "inbound email"]),
  entry("form.trigger", "trigger", "Form Trigger", ["form", "form trigger"]),
  entry("error.trigger", "trigger", "Error Trigger", ["error trigger", "on error"]),
  entry("telegram.trigger", "trigger", "Telegram Trigger", ["telegram trigger", "telegram inbound", "telegram"]),
  entry("whatsapp.trigger", "trigger", "WhatsApp Trigger", ["whatsapp trigger", "whatsapp inbound", "whatsapp"]),
  entry("agent.run", "agent", "AI Agent", ["ai agent", "agent node", "agent run", "agent"]),
  entry("agent.soul", "action", "Soul", ["soul", "soul node"]),
  entry("agent.skill", "action", "Skill Asset", ["skill asset", "skill node", "skill"]),
  entry("agent.personality", "action", "Personality", ["personality", "personality node"]),
  entry("approval.request", "action", "Approval", ["approval", "approve"]),
  entry("stop.error", "action", "Stop And Error", ["stop and error", "fail workflow", "throw error"]),
  entry("wait.delay", "action", "Wait", ["wait", "delay", "sleep"]),
  entry("workflow.execute", "action", "Execute Workflow", ["execute workflow", "sub workflow", "workflow call"]),
  entry("notify.send", "action", "Notify", ["notify", "reply", "send reply", "return to chat"]),
  entry("http.request", "action", "HTTP Request", ["http", "http request", "api request", "request"]),
  entry("webhook.response", "action", "Webhook Response", ["webhook response", "http response"]),
  entry("condition.filter", "action", "IF / Filter", ["if filter", "filter", "if node", "condition"]),
  entry("switch.route", "action", "Switch", ["switch", "route"]),
  entry("item.limit", "action", "Limit Items", ["limit", "limit items"]),
  entry("item.split", "action", "Split Out", ["split out", "split items"]),
  entry("item.merge", "action", "Merge Items", ["merge", "merge items"]),
  entry("item.sort", "action", "Sort Items", ["sort", "sort items"]),
  entry("item.aggregate", "action", "Aggregate Items", ["aggregate", "group items"]),
  entry("item.dedupe", "action", "Remove Duplicates", ["dedupe", "remove duplicates"]),
  entry("compare.datasets", "action", "Compare Datasets", ["compare datasets", "compare"]),
  entry("edit.fields", "action", "Edit Fields", ["edit fields", "set fields"]),
  entry("json.transform", "action", "JSON Transform", ["json transform", "json", "transform"]),
  entry("text.template", "action", "Text Template", ["text template", "template"]),
  entry("csv.parse", "action", "CSV Parse", ["csv", "parse csv"]),
  entry("xml.parse", "action", "XML", ["xml", "parse xml"]),
  entry("html.extract", "action", "HTML Extract", ["html extract", "scrape html"]),
  entry("rss.read", "action", "RSS Read", ["rss", "rss read", "feed"]),
  entry("date.time", "action", "Date & Time", ["date", "time", "date time"]),
  entry("crypto.hash", "action", "Crypto", ["crypto", "hash", "hmac"]),
  entry("code.javascript", "action", "JavaScript", ["javascript", "js", "nodejs"]),
  entry("code.typescript", "action", "TypeScript", ["typescript", "ts"]),
  entry("code.python", "action", "Python", ["python", "py"]),
  entry("code.bash", "action", "Bash Script", ["bash", "bash script"]),
  entry("code.powershell", "action", "PowerShell", ["powershell", "pwsh"]),
  entry("code.go", "action", "Go", ["golang", "go code"]),
  entry("code.rust", "action", "Rust", ["rust"]),
  entry("code.java", "action", "Java", ["java"]),
  entry("code.csharp", "action", "C#", ["csharp", "c#"]),
  entry("code.php", "action", "PHP", ["php"]),
  entry("code.ruby", "action", "Ruby", ["ruby"]),
  entry("code.lua", "action", "Lua", ["lua"]),
  entry("code.perl", "action", "Perl", ["perl"]),
  entry("code.r", "action", "R", ["r script", "r language"]),
  entry("code.c", "action", "C", ["c language", "c code"]),
  entry("code.cpp", "action", "C++", ["cpp", "c++"]),
  entry("code.sql", "action", "SQL Script", ["sql", "sql script"]),
  entry("code.regex", "action", "Regex", ["regex", "regular expression"]),
  entry("code.jq", "action", "jq", ["jq"]),
  entry("cache.store", "action", "Cache Store", ["cache", "cache store"]),
  entry("queue.publish", "action", "Queue Publish", ["queue", "publish"]),
  entry("telegram.send", "action", "Telegram Send", ["telegram send", "send telegram"]),
  entry("whatsapp.send", "action", "WhatsApp Send", ["whatsapp send", "send whatsapp"]),
  entry("discord.send", "action", "Discord", ["discord"]),
  entry("slack.send", "action", "Slack", ["slack send", "send slack"]),
  entry("email.send", "action", "Email Send", ["email send", "send email", "smtp"]),
  entry("gmail.action", "action", "Gmail", ["gmail"]),
  entry("google.sheets", "action", "Google Sheets", ["google sheets", "sheets", "spreadsheet"]),
  entry("google.drive", "action", "Google Drive", ["google drive", "drive"]),
  entry("notion.action", "action", "Notion", ["notion"]),
  entry("airtable.action", "action", "Airtable", ["airtable"]),
  entry("hubspot.action", "action", "HubSpot", ["hubspot"]),
  entry("trello.action", "action", "Trello", ["trello"]),
  entry("linear.action", "action", "Linear", ["linear"]),
  entry("jira.action", "action", "Jira", ["jira"]),
  entry("github.action", "action", "GitHub", ["github"]),
  entry("s3.action", "action", "S3", ["s3", "bucket"]),
  entry("ftp.action", "action", "FTP/SFTP", ["ftp", "sftp"]),
  entry("redis.action", "action", "Redis", ["redis"]),
  entry("mongodb.action", "action", "MongoDB", ["mongodb", "mongo"]),
  entry("elasticsearch.action", "action", "Elasticsearch", ["elasticsearch", "elastic"]),
  entry("file.action", "action", "File", ["file", "files"]),
  entry("git.action", "action", "Git", ["git"]),
  entry("test.run", "action", "Run Tests", ["run tests", "test"]),
  entry("database.query", "action", "Database Query", ["database", "db query", "postgres", "mysql", "sqlite"]),
  entry("docker.action", "action", "Docker", ["docker", "container"]),
  entry("shell.action", "action", "Shell", ["shell", "terminal", "command"]),
  entry("ssh.action", "action", "SSH", ["ssh", "server"])
];

const nodeTypes = new Set(nodeCatalog.map((item) => item.type));

const workflowTemplates: WorkflowTemplate[] = [
  template(
    "ctf_artifact_triage",
    "CTF Artifact Triage",
    "Manual input -> file/artifact read -> CTF agent -> findings reply.",
    ["ctf", "challenge", "artifact", "forensics", "reverse", "pwn", "web ctf", "malware", "flag"],
    "CTF Artifact Triage",
    [
      tplNode("manual", "manual.trigger", "Challenge Input"),
      tplNode("file", "file.action", "Artifact Reader", { operation: "read", tool: "file.read", path: "", target: "" }),
      tplNode("soul", "agent.soul", "CTF Soul", { soul: "You are Frostyyy's CTF teammate. Inspect artifacts carefully, form hypotheses, test evidence, and avoid unsafe real-world harm." }),
      tplNode("skill", "agent.skill", "CTF Skill Pack", {
        name: "CTF triage",
        instructions: "Classify challenge type, list observable facts, suggest next probes, and return commands that should be approved before mutation.",
        toolNames: ["file.read", "repo.inspect", "shell.run"]
      }),
      tplNode("personality", "agent.personality", "Frost Style", { personality: "Direct, methodical, CTF-minded, concise." }),
      tplNode("agent", "agent.run", "CTF Analysis Agent", { tools: ["file.read", "repo.inspect", "shell.run"], intelligence: "high" }),
      tplNode("reply", "notify.send", "Findings Reply", { channel: "chat", message: "{{content}}" })
    ],
    [
      tplLink("manual", "file"),
      tplLink("file", "agent"),
      tplLink("soul", "agent", "workflow-output", "soul"),
      tplLink("skill", "agent", "workflow-output", "skill"),
      tplLink("personality", "agent", "workflow-output", "personality"),
      tplLink("agent", "reply")
    ]
  ),
  template(
    "repo_ops_agent",
    "Repo + Ops Agent",
    "Manual input -> repo/coding agent -> optional approval -> tests -> reply.",
    ["repo", "coding", "code", "bug", "fix", "project", "diagnose", "debug", "tests", "ops"],
    "Repo Ops Assistant",
    [
      tplNode("manual", "manual.trigger", "Task Input"),
      tplNode("agent", "agent.run", "Repo + Ops Agent", { tools: ["repo.inspect", "file.read", "shell.run"], intelligence: "high" }),
      tplNode("approval", "approval.request", "Approve Mutations", { message: "Approve repo/server mutation?" }),
      tplNode("test", "test.run", "Run Tests", { command: "npm test", cwd: ".", target: "npm test" }),
      tplNode("reply", "notify.send", "Reply", { channel: "chat", message: "{{content}}" })
    ],
    [tplLink("manual", "agent"), tplLink("agent", "approval"), tplLink("approval", "test"), tplLink("test", "reply")]
  ),
  template(
    "telegram_whatsapp_agent",
    "Telegram + WhatsApp Agent Gateway",
    "Telegram/WhatsApp triggers -> shared agent -> channel reply.",
    ["telegram", "whatsapp", "bot", "channel", "chatbot", "customer", "support"],
    "Channel Agent Gateway",
    [
      tplNode("telegram", "telegram.trigger", "Telegram Inbound"),
      tplNode("whatsapp", "whatsapp.trigger", "WhatsApp Inbound"),
      tplNode("agent", "agent.run", "Channel Agent", { tools: ["http.request", "file.read"], intelligence: "medium" }),
      tplNode("reply", "notify.send", "Channel Reply", { channel: "source", message: "{{content}}" })
    ],
    [tplLink("telegram", "agent"), tplLink("whatsapp", "agent"), tplLink("agent", "reply")]
  ),
  template(
    "server_diagnostics",
    "Server Diagnostics With Approval",
    "Manual input -> SSH read diagnostics -> approval -> shell/SSH mutation -> reply.",
    ["server", "ssh", "diagnostic", "diagnostics", "linux", "vps", "service", "logs", "restart"],
    "Server Diagnostics",
    [
      tplNode("manual", "manual.trigger", "Incident Input"),
      tplNode("ssh", "ssh.action", "SSH Diagnostics", { operation: "inspect", tool: "ssh.inspect", command: "uptime && df -h && systemctl --failed", target: "" }),
      tplNode("agent", "agent.run", "Ops Reasoner", { tools: ["ssh.inspect", "shell.run"], intelligence: "high" }),
      tplNode("approval", "approval.request", "Approve Fix", { message: "Approve server mutation command?" }),
      tplNode("reply", "notify.send", "Ops Report", { channel: "chat", message: "{{content}}" })
    ],
    [tplLink("manual", "ssh"), tplLink("ssh", "agent"), tplLink("agent", "approval"), tplLink("approval", "reply")]
  ),
  template(
    "api_monitor",
    "API Monitor",
    "Schedule -> HTTP request -> IF filter -> notify on failure.",
    ["api", "monitor", "health", "uptime", "status", "endpoint", "http check"],
    "API Monitor",
    [
      tplNode("schedule", "schedule.trigger", "Every Hour", { cron: "0 * * * *", timezone: "local" }),
      tplNode("http", "http.request", "Health Check", { method: "GET", url: "https://example.com/health", timeoutSeconds: 20 }),
      tplNode("filter", "condition.filter", "Failed Check", { field: "status", operator: "greaterThan", value: "299" }),
      tplNode("notify", "notify.send", "Alert", { channel: "chat", message: "API check failed: {{json}}" })
    ],
    [tplLink("schedule", "http"), tplLink("http", "filter"), tplLink("filter", "notify")]
  ),
  template(
    "webhook_router",
    "Webhook Router",
    "Webhook -> switch -> agent/HTTP branches -> webhook response.",
    ["webhook", "router", "routing", "switch", "branch", "api gateway"],
    "Webhook Router",
    [
      tplNode("webhook", "webhook.trigger", "Inbound Webhook"),
      tplNode("switch", "switch.route", "Route By Type", { field: "type", rulesText: "agent=agent\napi=api", rules: { agent: "agent", api: "api" } }),
      tplNode("agent", "agent.run", "Agent Branch"),
      tplNode("http", "http.request", "API Branch"),
      tplNode("response", "webhook.response", "Response", { status: 200, contentType: "application/json", bodyText: "{\"ok\":true}" })
    ],
    [tplLink("webhook", "switch"), tplLink("switch", "agent"), tplLink("switch", "http"), tplLink("agent", "response"), tplLink("http", "response")]
  ),
  template(
    "gmail_triage",
    "Gmail Triage",
    "Schedule -> Gmail search -> AI summarize/classify -> notify.",
    ["gmail", "email", "inbox", "summarize email", "mail triage"],
    "Gmail Triage",
    [
      tplNode("schedule", "schedule.trigger", "Inbox Schedule", { cron: "*/30 * * * *", timezone: "local" }),
      tplNode("gmail", "gmail.action", "Search Gmail", { operation: "search", body: "newer_than:1d", target: "newer_than:1d" }),
      tplNode("agent", "agent.run", "Mail Triage Agent", { tools: ["gmail.action"], intelligence: "medium" }),
      tplNode("notify", "notify.send", "Digest", { channel: "chat", message: "{{content}}" })
    ],
    [tplLink("schedule", "gmail"), tplLink("gmail", "agent"), tplLink("agent", "notify")]
  ),
  template(
    "sheets_intake",
    "Form To Google Sheets",
    "Form trigger -> validate fields -> append row -> reply.",
    ["form", "intake", "google sheets", "sheets", "lead", "survey"],
    "Form Intake To Sheets",
    [
      tplNode("form", "form.trigger", "Intake Form"),
      tplNode("fields", "edit.fields", "Normalize Fields", { mode: "set", fieldsText: "createdAt={{date}}\nsource=form", fields: { createdAt: "{{date}}", source: "form" } }),
      tplNode("sheets", "google.sheets", "Append Row", { operation: "append", spreadsheetId: "", sheetName: "Intake", fieldsText: "" }),
      tplNode("reply", "notify.send", "Confirmation", { channel: "chat", message: "Saved intake row." })
    ],
    [tplLink("form", "fields"), tplLink("fields", "sheets"), tplLink("sheets", "reply")]
  ),
  template(
    "github_issue_triage",
    "GitHub Issue Triage",
    "GitHub trigger -> filter issue events -> AI triage -> comment/notify.",
    ["github", "issue", "pull request", "pr", "triage", "repository"],
    "GitHub Issue Triage",
    [
      tplNode("trigger", "github.trigger", "GitHub Event"),
      tplNode("filter", "condition.filter", "Issue Events", { field: "action", operator: "exists", value: "" }),
      tplNode("agent", "agent.run", "Repo Triage Agent", { tools: ["github.action", "repo.inspect"], intelligence: "high" }),
      tplNode("github", "github.action", "Comment / Label", { operation: "comment", resource: "issue", body: "{{content}}" }),
      tplNode("notify", "notify.send", "Triage Summary", { channel: "chat", message: "{{content}}" })
    ],
    [tplLink("trigger", "filter"), tplLink("filter", "agent"), tplLink("agent", "github"), tplLink("github", "notify")]
  ),
  template(
    "local_security_watch",
    "Local Security Watch",
    "Schedule -> shell read command -> agent analysis -> approval -> notify.",
    ["security", "cyber", "watch", "log", "audit", "defender", "windows", "event"],
    "Local Security Watch",
    [
      tplNode("schedule", "schedule.trigger", "Watch Schedule", { cron: "*/15 * * * *", timezone: "local" }),
      tplNode("shell", "shell.action", "Collect Signals", { command: "whoami && hostname", cwd: ".", requiresApproval: false, target: "whoami && hostname" }),
      tplNode("agent", "agent.run", "Security Analyst", { tools: ["shell.run", "file.read"], intelligence: "high" }),
      tplNode("approval", "approval.request", "Approve Response", { message: "Approve response or mitigation?" }),
      tplNode("notify", "notify.send", "Security Report", { channel: "chat", message: "{{content}}" })
    ],
    [tplLink("schedule", "shell"), tplLink("shell", "agent"), tplLink("agent", "approval"), tplLink("approval", "notify")]
  )
];

export function buildCanvasSystemPrompt(workflow: Workflow | undefined, selectedNodeId?: string | null): string {
  const selectedNode = workflow?.nodes.find((node) => node.id === selectedNodeId);
  return [
    "You can inspect and edit the current Canvas by calling canvas_* tools. Think like a workflow architect.",
    "Planning rules:",
    "- Infer user's real automation goal, then choose closest template and adapt it.",
    "- If details are missing but workflow can be scaffolded, create useful placeholder nodes and leave missing credentials/targets blank.",
    "- Ask a question only when missing detail would make the canvas misleading or dangerous.",
    "- If user asks to create, add, edit, connect, delete, rename, arrange, select, or run Canvas/workflow nodes, call canvas tools.",
    "- Do not claim Canvas changed unless you used tools.",
    "- Use exact node types from Available node types.",
    "- For new AI Agent profile assets, connect Soul -> AI Agent targetHandle soul, Skill Asset -> AI Agent targetHandle skill, Personality -> AI Agent targetHandle personality.",
    "- For normal workflow flow, connect sourceHandle workflow-output to targetHandle workflow-input.",
    "Template library:",
    workflowTemplates.map((item) => `${item.id}: ${item.description}`).join("\n"),
    `Selected node: ${selectedNode ? `${selectedNode.name} (${selectedNode.type}, ${selectedNode.id})` : "none"}`,
    "Current Canvas:",
    workflow ? JSON.stringify(summarizeWorkflow(workflow), null, 2) : "No active workflow.",
    "Available node types:",
    nodeCatalog.map((item) => `${item.type} = ${item.name}`).join(", ")
  ].join("\n");
}

export function canvasActionsFromToolCalls(toolCalls: ToolCall[]): CanvasAction[] {
  return toolCalls
    .filter((call) => isCanvasActionName(call.name))
    .map((call) => ({ name: call.name as CanvasActionName, input: call.input, source: "model" }));
}

export function parseCanvasActionsFromText(content: string): CanvasAction[] {
  const candidates = [
    ...Array.from(content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)).map((match) => match[1] ?? ""),
    content
  ];

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate.trim()) ?? tryParseJson(extractJsonBlock(candidate));
    const actions = normalizeParsedActions(parsed);
    if (actions.length > 0) {
      return actions;
    }
  }
  return [];
}

export function inferCanvasActionsFromMessage(message: string, workflow: Workflow | undefined, selectedNodeId?: string | null): CanvasAction[] {
  if (!workflow) {
    return [];
  }

  const lower = message.toLowerCase();
  if (!hasCanvasIntent(lower)) {
    return [];
  }

  const actions: CanvasAction[] = [];

  const renameWorkflowMatch = lower.match(/rename\s+(?:canvas|workflow|flow)\s+(?:to\s+)?["']([^"']+)["']/i);
  if (renameWorkflowMatch?.[1]) {
    actions.push(action("canvas_set_workflow_name", { name: renameWorkflowMatch[1] }));
  }

  if (/\b(arrange|layout|align|clean up)\b/.test(lower)) {
    actions.push(action("canvas_auto_layout", { direction: lower.includes("vertical") ? "vertical" : "horizontal" }));
  }

  if (/\b(run|execute)\b/.test(lower) && /\b(canvas|workflow|flow)\b/.test(lower)) {
    actions.push(action("canvas_run_workflow", {}));
  }

  if (/\b(delete|remove)\b/.test(lower)) {
    const nodeRef = lower.includes("selected") || lower.includes("this node") ? "selected" : firstMentionedExistingNode(lower, workflow);
    if (nodeRef) {
      actions.push(action("canvas_delete_node", { node: nodeRef }));
    }
  }

  const configPatch = inferConfigPatch(message);
  if (Object.keys(configPatch.config).length > 0 || configPatch.name) {
    const nodeRef = targetNodeForConfigEdit(lower, workflow, selectedNodeId);
    if (nodeRef) {
      actions.push(action("canvas_update_node", { node: nodeRef, name: configPatch.name, config: configPatch.config }));
    }
  }

  if (/\b(create|add|build|make)\b/.test(lower) || (actions.length === 0 && Boolean(matchWorkflowTemplate(lower)))) {
    actions.push(...inferCreateActions(lower));
  }

  return dedupeActions(actions);
}

export function applyCanvasActions(workflow: Workflow, actions: CanvasAction[], selectedNodeId?: string | null): ApplyCanvasActionsResult {
  let next = cloneWorkflow(workflow);
  let changed = false;
  let nextSelectedNodeId: string | null | undefined = selectedNodeId;
  let runRequested = false;
  const results: CanvasActionResult[] = [];
  const createdKeys = new Map<string, string>();

  for (const current of actions) {
    switch (current.name) {
      case "canvas_add_node": {
        const nodeType = normalizeNodeType(stringValue(current.input.nodeType ?? current.input.type ?? current.input.name));
        const catalogEntry = nodeType ? getCatalogEntry(nodeType) : undefined;
        if (!catalogEntry) {
          results.push(fail(current.name, `Unknown node type: ${stringValue(current.input.nodeType) || "missing"}`));
          break;
        }

        const id = crypto.randomUUID();
        const position = asPosition(current.input.position) ?? nextNodePosition(next);
        const node: WorkflowNode = {
          id,
          type: catalogEntry.type,
          kind: catalogEntry.kind,
          name: stringValue(current.input.name) || catalogEntry.name,
          position,
          config: {
            ...createNodeConfig(catalogEntry.type, id),
            ...asObject(current.input.config)
          }
        };
        next = { ...next, nodes: [...next.nodes, node] };
        changed = true;
        nextSelectedNodeId = id;
        const key = stringValue(current.input.key);
        if (key) {
          createdKeys.set(key, id);
        }
        results.push(ok(current.name, `Added ${node.name}`, { nodeId: id, selectedNodeId: id }));
        break;
      }
      case "canvas_update_node": {
        const node = resolveNode(next, stringValue(current.input.node), selectedNodeId, createdKeys);
        if (!node) {
          results.push(fail(current.name, `Node not found: ${stringValue(current.input.node) || "missing"}`));
          break;
        }

        const configPatch = {
          ...asObject(current.input.config),
          ...modelConfigPatch(current.input),
          ...intelligenceConfigPatch(current.input.intelligence)
        };
        const nextName = stringValue(current.input.name);
        next = {
          ...next,
          nodes: next.nodes.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  name: nextName || item.name,
                  config: { ...item.config, ...configPatch }
                }
              : item
          )
        };
        changed = true;
        nextSelectedNodeId = node.id;
        results.push(ok(current.name, `Updated ${nextName || node.name}`, { nodeId: node.id, selectedNodeId: node.id }));
        break;
      }
      case "canvas_delete_node": {
        const node = resolveNode(next, stringValue(current.input.node), selectedNodeId, createdKeys);
        if (!node) {
          results.push(fail(current.name, `Node not found: ${stringValue(current.input.node) || "missing"}`));
          break;
        }
        const deleteIds = new Set([node.id, ...next.nodes.filter((item) => item.parentId === node.id).map((item) => item.id)]);
        next = {
          ...next,
          nodes: next.nodes.filter((item) => !deleteIds.has(item.id)),
          edges: next.edges.filter((edge) => !deleteIds.has(edge.source) && !deleteIds.has(edge.target))
        };
        changed = true;
        if (nextSelectedNodeId && deleteIds.has(nextSelectedNodeId)) {
          nextSelectedNodeId = null;
        }
        results.push(ok(current.name, `Deleted ${node.name}`, { nodeId: node.id, selectedNodeId: nextSelectedNodeId ?? null }));
        break;
      }
      case "canvas_connect_nodes": {
        const source = resolveNode(next, stringValue(current.input.source), selectedNodeId, createdKeys);
        const target = resolveNode(next, stringValue(current.input.target), selectedNodeId, createdKeys);
        if (!source || !target) {
          results.push(fail(current.name, `Connection node not found: ${stringValue(current.input.source)} -> ${stringValue(current.input.target)}`));
          break;
        }
        const sourceHandle = stringValue(current.input.sourceHandle) || "workflow-output";
        const targetHandle = stringValue(current.input.targetHandle) || defaultTargetHandle(source, target);
        const exists = next.edges.some(
          (edge) => edge.source === source.id && edge.target === target.id && edge.sourceHandle === sourceHandle && edge.targetHandle === targetHandle
        );
        if (exists) {
          results.push(ok(current.name, `${source.name} already connected to ${target.name}`));
          break;
        }
        const edge = { id: crypto.randomUUID(), source: source.id, target: target.id, sourceHandle, targetHandle };
        next = { ...next, edges: [...next.edges, edge] };
        changed = true;
        results.push(ok(current.name, `Connected ${source.name} to ${target.name}`, { edgeId: edge.id }));
        break;
      }
      case "canvas_select_node": {
        const node = resolveNode(next, stringValue(current.input.node), selectedNodeId, createdKeys);
        if (!node) {
          results.push(fail(current.name, `Node not found: ${stringValue(current.input.node) || "missing"}`));
          break;
        }
        nextSelectedNodeId = node.id;
        results.push(ok(current.name, `Selected ${node.name}`, { nodeId: node.id, selectedNodeId: node.id }));
        break;
      }
      case "canvas_auto_layout": {
        const direction = stringValue(current.input.direction) === "vertical" ? "vertical" : "horizontal";
        next = autoLayout(next, direction);
        changed = true;
        results.push(ok(current.name, `Arranged canvas ${direction}`));
        break;
      }
      case "canvas_set_workflow_name": {
        const name = stringValue(current.input.name).trim();
        if (!name) {
          results.push(fail(current.name, "Workflow name missing"));
          break;
        }
        next = { ...next, name };
        changed = true;
        results.push(ok(current.name, `Renamed workflow to ${name}`));
        break;
      }
      case "canvas_run_workflow": {
        runRequested = true;
        results.push(ok(current.name, "Run requested"));
        break;
      }
    }
  }

  if (changed) {
    next = { ...next, updatedAt: new Date().toISOString() };
  }

  return { workflow: next, changed, selectedNodeId: nextSelectedNodeId, runRequested, results };
}

export function summarizeCanvasResults(results: CanvasActionResult[], runStatus?: string): string {
  const okResults = results.filter((result) => result.ok);
  const failedResults = results.filter((result) => !result.ok);
  const lines = okResults.map((result) => result.message);
  if (runStatus) {
    lines.push(`Workflow run ${runStatus}`);
  }
  if (failedResults.length > 0) {
    lines.push(`Needs attention: ${failedResults.map((result) => result.message).join("; ")}`);
  }
  return lines.length > 0 ? lines.join("\n") : "No canvas changes made.";
}

export function summarizeWorkflowForUser(workflow: Workflow): string {
  const nodes = workflow.nodes.map((node) => `${node.name} (${node.type})`).join(", ");
  const edges = workflow.edges.length;
  return `${workflow.name}: ${workflow.nodes.length} nodes, ${edges} connections${nodes ? `\n${nodes}` : ""}`;
}

function entry(type: string, kind: WorkflowNode["kind"], name: string, aliases: string[]): NodeCatalogEntry {
  return { type, kind, name, aliases: [type, name.toLowerCase(), ...aliases] };
}

function template(
  id: string,
  name: string,
  description: string,
  keywords: string[],
  workflowName: string,
  nodes: WorkflowTemplate["nodes"],
  links: WorkflowTemplate["links"]
): WorkflowTemplate {
  return { id, name, description, keywords: [id, name.toLowerCase(), ...keywords], workflowName, nodes, links };
}

function tplNode(key: string, type: string, name?: string, config?: Record<string, unknown>): WorkflowTemplate["nodes"][number] {
  return { key, type, ...(name ? { name } : {}), ...(config ? { config } : {}) };
}

function tplLink(source: string, target: string, sourceHandle = "workflow-output", targetHandle?: string): WorkflowTemplate["links"][number] {
  return { source, target, sourceHandle, ...(targetHandle ? { targetHandle } : {}) };
}

function action(name: CanvasActionName, input: Record<string, unknown>): CanvasAction {
  return { name, input, source: "fallback" };
}

function hasCanvasIntent(lower: string): boolean {
  return (
    /\b(canvas|workflow|flow|node|agent|trigger|connect|layout|arrange)\b/.test(lower) ||
    workflowTemplates.some((item) => item.keywords.some((keyword) => phraseIndex(lower, keyword) >= 0)) ||
    (/\b(create|add|build|make|delete|remove|rename|run|execute|select|update|change)\b/.test(lower) && collectMentionedTypes(lower).length > 0)
  );
}

function inferCreateActions(lower: string): CanvasAction[] {
  const matchedTemplate = matchWorkflowTemplate(lower);
  if (matchedTemplate) {
    return actionsFromWorkflowTemplate(matchedTemplate);
  }

  const mentioned = collectMentionedTypes(lower).filter((type) => type !== "agent.soul" && type !== "agent.skill" && type !== "agent.personality");
  if (mentioned.length === 0) {
    return [];
  }

  if (mentioned.length === 1) {
    const catalogEntry = getCatalogEntry(mentioned[0]);
    return catalogEntry ? [action("canvas_add_node", { nodeType: catalogEntry.type, name: catalogEntry.name, key: "new-node" })] : [];
  }

  const actions: CanvasAction[] = [];
  const triggerTypes = mentioned.filter((type) => getCatalogEntry(type)?.kind === "trigger");
  const agentType = mentioned.find((type) => type === "agent.run");
  const replyType = mentioned.find((type) => ["notify.send", "telegram.send", "whatsapp.send", "slack.send", "discord.send", "email.send"].includes(type));

  if (triggerTypes.length > 1 && agentType) {
    triggerTypes.forEach((type, index) => actions.push(addAction(type, `trigger-${index}`)));
    actions.push(addAction(agentType, "agent"));
    if (replyType) {
      actions.push(addAction(replyType, "reply"));
    }
    triggerTypes.forEach((_, index) => actions.push(action("canvas_connect_nodes", { source: `trigger-${index}`, target: "agent" })));
    if (replyType) {
      actions.push(action("canvas_connect_nodes", { source: "agent", target: "reply" }));
    }
    actions.push(action("canvas_auto_layout", { direction: "horizontal" }));
    return actions;
  }

  mentioned.forEach((type, index) => actions.push(addAction(type, `node-${index}`)));
  for (let index = 0; index < mentioned.length - 1; index += 1) {
    actions.push(action("canvas_connect_nodes", { source: `node-${index}`, target: `node-${index + 1}` }));
  }
  actions.push(action("canvas_auto_layout", { direction: "horizontal" }));
  return actions;
}

function matchWorkflowTemplate(lower: string): WorkflowTemplate | undefined {
  const scored = workflowTemplates
    .map((item) => ({
      item,
      score:
        item.keywords.reduce((total, keyword) => total + (phraseIndex(lower, keyword) >= 0 ? keywordScore(keyword) : 0), 0) +
        item.nodes.reduce((total, node) => total + (phraseIndex(lower, getCatalogEntry(node.type)?.name.toLowerCase() ?? node.type) >= 0 ? 2 : 0), 0)
    }))
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (best && best.score > 0) {
    return best.item;
  }

  if (/\b(simple|basic|anything|surprise)\b/.test(lower) && /\b(flow|workflow|canvas)\b/.test(lower)) {
    return workflowTemplates.find((item) => item.id === "repo_ops_agent");
  }

  return undefined;
}

function actionsFromWorkflowTemplate(workflowTemplate: WorkflowTemplate): CanvasAction[] {
  return [
    action("canvas_set_workflow_name", { name: workflowTemplate.workflowName }),
    ...workflowTemplate.nodes.map((node) =>
      action("canvas_add_node", {
        nodeType: node.type,
        key: node.key,
        ...(node.name ? { name: node.name } : {}),
        ...(node.config ? { config: node.config } : {})
      })
    ),
    ...workflowTemplate.links.map((link) =>
      action("canvas_connect_nodes", {
        source: link.source,
        target: link.target,
        sourceHandle: link.sourceHandle ?? "workflow-output",
        targetHandle: link.targetHandle
      })
    ),
    action("canvas_auto_layout", { direction: "horizontal" })
  ];
}

function keywordScore(keyword: string): number {
  return keyword.includes(" ") || keyword.includes("_") ? 4 : 2;
}

function addAction(type: string, key: string): CanvasAction {
  const catalogEntry = getCatalogEntry(type);
  return action("canvas_add_node", { nodeType: type, name: catalogEntry?.name ?? type, key });
}

function inferConfigPatch(message: string): { name?: string; config: Record<string, unknown> } {
  const lower = message.toLowerCase();
  const config: Record<string, unknown> = {};
  const quotedName = message.match(/(?:rename|name)\s+(?:selected\s+)?(?:node\s+)?(?:to\s+)?["']([^"']+)["']/i)?.[1];
  const url = message.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  const command = message.match(/command\s+(?:to\s+)?["'`](.+?)["'`]/i)?.[1];
  const intelligence = lower.match(/\b(off|low|medium|high)\b/)?.[1];
  const model = message.match(/\b(llama[\w.-]*|qwen[\w.-]*|deepseek[\w.-]*|gpt-[\w.-]*|o\d[\w.-]*|claude[\w.-]*)\b/i)?.[1];
  const provider = lower.includes("openai") || lower.includes("chatgpt") ? "openai" : lower.includes("claude") || lower.includes("anthropic") ? "anthropic" : lower.includes("ollama") ? "ollama" : "";

  if (url) {
    config.url = url;
    config.target = url;
  }
  if (command) {
    config.command = command;
    config.target = command;
  }
  if (isIntelligence(intelligence) && /\b(intelligence|reasoning|thinking)\b/.test(lower)) {
    config.intelligence = intelligence;
  }
  if (model || provider) {
    config.model = {
      provider: provider || inferProviderFromModel(model),
      model: model || defaultModelForProvider(provider)
    };
  }

  return { name: quotedName, config };
}

function targetNodeForConfigEdit(lower: string, workflow: Workflow, selectedNodeId?: string | null): string | undefined {
  if (selectedNodeId && /\b(selected|this|current|it|node)\b/.test(lower)) {
    return "selected";
  }
  if (selectedNodeId && !firstMentionedExistingNode(lower, workflow)) {
    return "selected";
  }
  return firstMentionedExistingNode(lower, workflow);
}

function firstMentionedExistingNode(lower: string, workflow: Workflow): string | undefined {
  const mentionedType = collectMentionedTypes(lower)[0];
  const node = mentionedType ? workflow.nodes.find((item) => item.type === mentionedType) : undefined;
  return node?.id;
}

function collectMentionedTypes(lower: string): string[] {
  return nodeCatalog
    .map((catalogEntry) => ({ type: catalogEntry.type, index: firstAliasIndex(lower, catalogEntry.aliases) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.type)
    .filter((type, index, all) => all.indexOf(type) === index);
}

function firstAliasIndex(lower: string, aliases: string[]): number {
  const indexes = aliases.map((alias) => phraseIndex(lower, alias)).filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function phraseIndex(lower: string, phrase: string): number {
  const normalized = phrase.toLowerCase();
  if (/^[a-z0-9 ]+$/.test(normalized)) {
    const match = lower.match(new RegExp(`\\b${escapeRegExp(normalized)}\\b`, "i"));
    return match?.index ?? -1;
  }
  return lower.indexOf(normalized);
}

function dedupeActions(actions: CanvasAction[]): CanvasAction[] {
  const seen = new Set<string>();
  return actions.filter((item) => {
    const key = JSON.stringify([item.name, item.input]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeParsedActions(parsed: unknown): CanvasAction[] {
  const rawActions = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { actions?: unknown }).actions)
      ? (parsed as { actions: unknown[] }).actions
      : [];

  const actions: CanvasAction[] = [];
  rawActions
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    .forEach((item) => {
      const rawName = stringValue(item.name ?? item.action ?? item.tool);
      if (!isCanvasActionName(rawName)) {
        return;
      }
      const nestedInput = asObject(item.input);
      const input =
        Object.keys(nestedInput).length > 0
          ? nestedInput
          : Object.fromEntries(Object.entries(item).filter(([key]) => !["name", "action", "tool", "source"].includes(key)));
      actions.push({ name: rawName as CanvasActionName, input, source: "text" });
    });
  return actions;
}

function normalizeNodeType(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const lower = value.toLowerCase().trim();
  if (nodeTypes.has(lower)) {
    return lower;
  }
  const exact = nodeCatalog.find((item) => item.name.toLowerCase() === lower || item.aliases.some((alias) => alias.toLowerCase() === lower));
  if (exact) {
    return exact.type;
  }
  const fuzzy = nodeCatalog.find((item) => lower.includes(item.name.toLowerCase()) || item.aliases.some((alias) => lower.includes(alias.toLowerCase())));
  return fuzzy?.type;
}

function getCatalogEntry(type: string | undefined): NodeCatalogEntry | undefined {
  return type ? nodeCatalog.find((item) => item.type === type) : undefined;
}

function resolveNode(workflow: Workflow, ref: string, selectedNodeId: string | null | undefined, createdKeys: Map<string, string>): WorkflowNode | undefined {
  const normalizedRef = ref.trim();
  const keyed = createdKeys.get(normalizedRef) ?? createdKeys.get(normalizedRef.replace(/^\$/, ""));
  if (keyed) {
    return workflow.nodes.find((node) => node.id === keyed);
  }
  if (normalizedRef === "selected" && selectedNodeId) {
    return workflow.nodes.find((node) => node.id === selectedNodeId);
  }
  const lower = normalizedRef.toLowerCase();
  return (
    workflow.nodes.find((node) => node.id === normalizedRef) ??
    workflow.nodes.find((node) => node.name.toLowerCase() === lower) ??
    workflow.nodes.find((node) => node.type === lower) ??
    workflow.nodes.find((node) => node.name.toLowerCase().includes(lower))
  );
}

function nextNodePosition(workflow: Workflow): { x: number; y: number } {
  if (workflow.nodes.length === 0) {
    return { x: 180, y: 220 };
  }
  const nonGroupNodes = workflow.nodes.filter((node) => node.type !== "group.box");
  const maxX = Math.max(...nonGroupNodes.map((node) => node.position.x), 120);
  const y = nonGroupNodes.length > 0 ? nonGroupNodes[nonGroupNodes.length - 1]?.position.y ?? 220 : 220;
  return { x: maxX + 260, y };
}

function autoLayout(workflow: Workflow, direction: "horizontal" | "vertical"): Workflow {
  const groups = workflow.nodes.filter((node) => node.type === "group.box");
  const nodes = workflow.nodes.filter((node) => node.type !== "group.box");
  const arranged = nodes.map((node, index) => ({
    ...node,
    position: direction === "vertical" ? { x: 220, y: 130 + index * 150 } : { x: 120 + index * 290, y: 260 }
  }));
  return { ...workflow, nodes: [...groups, ...arranged] };
}

function defaultTargetHandle(source: WorkflowNode, target: WorkflowNode): string {
  if (target.type === "agent.run") {
    if (source.type === "agent.soul") return "soul";
    if (source.type === "agent.skill") return "skill";
    if (source.type === "agent.personality") return "personality";
  }
  return "workflow-input";
}

function createNodeConfig(type: string, id: string): Record<string, unknown> {
  switch (type) {
    case "agent.run":
      return {
        agentId: id,
        name: "Canvas Agent",
        model: { provider: "ollama", model: "llama3.1" },
        intelligence: "off",
        soul: "You are a focused automation agent.",
        personality: "Direct, careful, and concise.",
        tools: ["repo.inspect", "file.read"]
      };
    case "agent.soul":
      return { soul: "You are a focused cybersecurity automation agent for CTF, coding, and IT workflows." };
    case "agent.skill":
      return { name: "CTF Skill", instructions: "Analyze artifacts carefully, explain findings, and keep exploit steps safe.", toolMode: true, toolNames: ["file.read", "repo.inspect"] };
    case "agent.personality":
      return { personality: "Direct, curious, methodical, and security-minded." };
    case "schedule.trigger":
      return { cron: "0 * * * *", timezone: "local" };
    case "form.trigger":
      return { path: "forms/intake", fieldsText: "name=text\nemail=email\nmessage=textarea", fields: { name: "text", email: "email", message: "textarea" }, authType: "none" };
    case "error.trigger":
      return { scope: "all", includeStack: true };
    case "webhook.trigger":
    case "github.trigger":
    case "jira.trigger":
    case "slack.trigger":
    case "email.trigger":
    case "telegram.trigger":
    case "whatsapp.trigger":
      return { path: type, method: "POST", authType: "none", secret: "" };
    case "http.request":
      return { method: "GET", url: "https://example.com", authType: "none", headersText: "", queryText: "", bodyType: "none", bodyText: "", timeoutSeconds: 30 };
    case "webhook.response":
      return { status: 200, contentType: "application/json", bodyText: "{\"ok\":true}" };
    case "condition.filter":
      return { field: "status", operator: "exists", value: "" };
    case "switch.route":
      return { field: "status", rulesText: "open=branch_1\nclosed=branch_2", rules: { open: "branch_1", closed: "branch_2" }, fallback: "none" };
    case "item.limit":
      return { limit: 10 };
    case "item.split":
      return { field: "items" };
    case "item.merge":
      return { outputField: "items" };
    case "item.sort":
      return { field: "createdAt", direction: "asc" };
    case "item.aggregate":
      return { groupBy: "type", operation: "count", valueField: "" };
    case "item.dedupe":
      return { keyField: "id", keep: "first" };
    case "compare.datasets":
      return { matchField: "id", output: "differences" };
    case "edit.fields":
      return { mode: "set", fieldsText: "", fields: {} };
    case "json.transform":
      return { assignText: "", assign: {} };
    case "csv.parse":
      return { sourceField: "csv", delimiter: ",", hasHeader: true };
    case "xml.parse":
      return { operation: "parse", field: "xml" };
    case "html.extract":
      return { htmlField: "html", selector: "title", returnValue: "text", attribute: "href" };
    case "rss.read":
      return { url: "", limit: 20 };
    case "date.time":
      return { operation: "format", field: "date", value: "YYYY-MM-DD" };
    case "crypto.hash":
      return { operation: "hash", algorithm: "sha256", field: "value", secret: "" };
    case "code.javascript":
    case "code.typescript":
    case "code.python":
    case "code.bash":
    case "code.powershell":
    case "code.go":
    case "code.rust":
    case "code.java":
    case "code.csharp":
    case "code.php":
    case "code.ruby":
    case "code.lua":
    case "code.perl":
    case "code.r":
    case "code.c":
    case "code.cpp":
    case "code.sql":
    case "code.regex":
    case "code.jq":
      return {
        tool: type.includes("bash") || type.includes("powershell") ? "shell.run" : type.includes("sql") ? "db.query" : "code.run",
        language: type.replace("code.", ""),
        runtime: runtimeForCodeNode(type),
        mode: "runOnceForAllItems",
        code: defaultCodeForNode(type),
        envText: "",
        dependenciesText: "",
        timeoutSeconds: 60,
        requiresApproval: true
      };
    case "cache.store":
      return { tool: "cache.store", key: "", value: "{{json}}", ttlSeconds: 3600, target: "" };
    case "queue.publish":
      return { tool: "queue.publish", topic: "", payload: "{{json}}", deliveryMode: "persistent", target: "" };
    case "text.template":
      return { field: "message", template: "Result: {{json}}" };
    case "approval.request":
      return { message: "Approve action?" };
    case "stop.error":
      return { message: "Workflow stopped by Stop And Error node", code: "STOP_AND_ERROR" };
    case "wait.delay":
      return { resumeMode: "delay", delaySeconds: 60, resumeAt: "" };
    case "workflow.execute":
      return { workflowRef: "", inputMode: "allItems", inputJson: "{}" };
    case "notify.send":
      return { channel: "chat", message: "Return result to chat/channel" };
    case "telegram.send":
      return { tool: "telegram.send", credentialId: "", chatId: "", message: "{{message}}", parseMode: "none" };
    case "whatsapp.send":
      return { tool: "whatsapp.send", credentialId: "", phoneNumberId: "", wabaId: "", to: "", messageType: "text", message: "{{message}}", templateName: "", languageCode: "en_US" };
    case "discord.send":
    case "slack.send":
      return { tool: type, credentialId: "", operation: "send", channel: "", message: "{{message}}", threadId: "", attachmentField: "" };
    case "email.send":
      return {
        tool: "email.send",
        credentialId: "",
        smtpHost: "",
        smtpPort: 587,
        encryption: "STARTTLS",
        authMethod: "password",
        username: "",
        password: "",
        oauthToken: "",
        from: "",
        replyTo: "",
        to: "",
        cc: "",
        bcc: "",
        subject: "",
        emailType: "text",
        body: "{{message}}",
        attachmentField: ""
      };
    case "gmail.action":
      return { tool: type, credentialId: "", operation: "send", to: "", ccBcc: "", subject: "", emailType: "text", body: "{{message}}", attachmentField: "" };
    case "google.sheets":
      return { tool: type, credentialId: "", operation: "append", spreadsheetId: "", sheetName: "", keyColumn: "", fieldsText: "", fields: {}, limit: 100 };
    case "google.drive":
      return { tool: type, credentialId: "", operation: "upload", container: "", path: "", fileName: "", binaryField: "data", content: "" };
    case "notion.action":
      return { tool: type, credentialId: "", resource: "page", operation: "create", target: "", title: "", fieldsText: "", fields: {}, payload: "" };
    case "airtable.action":
      return { tool: type, credentialId: "", operation: "create", baseId: "", table: "", recordId: "", fieldsText: "", fields: {} };
    case "hubspot.action":
    case "trello.action":
    case "linear.action":
    case "jira.action":
    case "github.action":
      return { tool: type, credentialId: "", resource: defaultResourceForNode(type), operation: "create", project: "", target: "", title: "", body: "", fieldsText: "", fields: {} };
    case "s3.action":
      return {
        tool: "s3.action",
        credentialId: "",
        operation: "upload",
        authMode: "accessKey",
        region: "",
        endpoint: "",
        accessKeyId: "",
        secretAccessKey: "",
        sessionToken: "",
        forcePathStyle: false,
        container: "",
        path: "",
        fileName: "",
        binaryField: "data",
        content: ""
      };
    case "ftp.action":
      return {
        tool: "ftp.action",
        credentialId: "",
        operation: "upload",
        protocol: "sftp",
        host: "",
        port: 22,
        username: "",
        password: "",
        privateKey: "",
        passphrase: "",
        ignoreSslIssues: false,
        path: "",
        fileName: "",
        binaryField: "data"
      };
    case "redis.action":
      return { tool: type, credentialId: "", host: "", port: 6379, username: "", password: "", dbIndex: 0, tls: false, operation: "get", key: "", value: "", ttlSeconds: 0 };
    case "mongodb.action":
      return {
        tool: type,
        credentialId: "",
        configType: "connectionString",
        connectionString: "",
        host: "",
        port: 27017,
        username: "",
        password: "",
        authDb: "",
        tls: true,
        operation: "find",
        database: "",
        collection: "",
        query: "{}",
        document: "{}",
        limit: 100
      };
    case "elasticsearch.action":
      return {
        tool: type,
        credentialId: "",
        authMode: "basic",
        baseUrl: "",
        username: "",
        password: "",
        apiKey: "",
        ignoreSslIssues: false,
        operation: "find",
        database: "",
        collection: "",
        query: "{}",
        document: "{}",
        limit: 100
      };
    case "git.action":
      return { tool: "git.status", operation: "status", repoPath: ".", target: ".", branch: "", remote: "origin", message: "", userName: "", userEmail: "" };
    case "file.action":
      return { tool: "file.read", operation: "read", path: "", target: "", destinationPath: "", content: "", encoding: "utf8" };
    case "test.run":
      return { tool: "shell.run", target: "npm test", command: "npm test", cwd: ".", timeoutSeconds: 120 };
    case "database.query":
      return { tool: "db.query", target: "read", dbType: "postgres", credentialId: "", host: "", port: 5432, database: "", username: "", password: "", query: "select 1", paramsText: "" };
    case "docker.action":
      return { tool: "docker.inspect", operation: "ps", target: "", command: "", composeFile: "docker-compose.yml", tail: 200 };
    case "shell.action":
      return { tool: "shell.run", target: "", command: "", cwd: ".", envText: "", timeoutSeconds: 60, requiresApproval: true };
    case "ssh.action":
      return { tool: "ssh.inspect", target: "", host: "", port: 22, username: "", authType: "privateKey", password: "", privateKey: "", passphrase: "", cwd: "~", command: "", hostKeyFingerprint: "", timeoutSeconds: 60 };
    default:
      return {};
  }
}

function modelConfigPatch(input: Record<string, unknown>): Record<string, unknown> {
  const provider = stringValue(input.provider);
  const model = stringValue(input.model);
  if (!provider && !model) {
    return {};
  }
  return {
    model: {
      provider: provider || inferProviderFromModel(model),
      model: model || defaultModelForProvider(provider)
    }
  };
}

function intelligenceConfigPatch(value: unknown): Record<string, unknown> {
  return isIntelligence(value) ? { intelligence: value } : {};
}

function inferProviderFromModel(model: string | undefined): string {
  const lower = model?.toLowerCase() ?? "";
  if (lower.startsWith("gpt") || /^o\d/.test(lower)) return "openai";
  if (lower.startsWith("claude")) return "anthropic";
  return "ollama";
}

function defaultModelForProvider(provider: string | undefined): string {
  if (provider === "openai") return "gpt-4.1";
  if (provider === "anthropic") return "claude-3-7-sonnet-latest";
  return "llama3.1";
}

function runtimeForCodeNode(type: string): string {
  switch (type) {
    case "code.python":
      return "python:3.12";
    case "code.typescript":
      return "node:22 + tsx";
    case "code.bash":
      return "bash";
    case "code.powershell":
      return "pwsh";
    case "code.go":
      return "golang:1.23";
    case "code.rust":
      return "rust:1.83";
    case "code.java":
      return "eclipse-temurin:21";
    case "code.csharp":
      return "mcr.microsoft.com/dotnet/sdk:9.0";
    case "code.php":
      return "php:8.3-cli";
    case "code.ruby":
      return "ruby:3.3";
    case "code.lua":
      return "lua:5.4";
    case "code.perl":
      return "perl:5";
    case "code.r":
      return "r-base:4.4";
    case "code.c":
    case "code.cpp":
      return "gcc:14";
    case "code.sql":
      return "db-adapter";
    case "code.regex":
      return "node:22";
    case "code.jq":
      return "jq";
    default:
      return "node:22";
  }
}

function defaultCodeForNode(type: string): string {
  switch (type) {
    case "code.python":
      return "return [{\"json\": item[\"json\"]} for item in items]";
    case "code.bash":
      return "echo \"$BARYON_INPUT\"";
    case "code.powershell":
      return "Write-Output $env:BARYON_INPUT";
    case "code.sql":
      return "select * from input_items;";
    case "code.regex":
      return "/pattern/g";
    case "code.jq":
      return ".";
    default:
      return "return items.map((item) => ({ json: item.json }));";
  }
}

function defaultResourceForNode(type: string): string {
  const resources: Record<string, string> = {
    "discord.send": "message",
    "slack.send": "message",
    "email.send": "email",
    "gmail.action": "message",
    "google.sheets": "row",
    "google.drive": "file",
    "notion.action": "page",
    "airtable.action": "record",
    "hubspot.action": "contact",
    "trello.action": "card",
    "linear.action": "issue",
    "jira.action": "issue",
    "github.action": "issue",
    "s3.action": "object",
    "ftp.action": "file",
    "redis.action": "key",
    "mongodb.action": "document",
    "elasticsearch.action": "document"
  };
  return resources[type] ?? "item";
}

function summarizeWorkflow(workflow: Workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      kind: node.kind,
      position: node.position,
      config: redactConfig(node.config)
    })),
    edges: workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle
    }))
  };
}

function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, /password|secret|token|key/i.test(key) ? "[redacted]" : value])
  );
}

function ok(actionName: CanvasActionName, message: string, extras: Partial<CanvasActionResult> = {}): CanvasActionResult {
  return { action: actionName, ok: true, message, ...extras };
}

function fail(actionName: CanvasActionName, message: string): CanvasActionResult {
  return { action: actionName, ok: false, message };
}

function isCanvasActionName(value: string): boolean {
  return canvasTools.some((tool) => tool.name === value);
}

function isIntelligence(value: unknown): value is Intelligence {
  return value === "off" || value === "low" || value === "medium" || value === "high";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asPosition(value: unknown): { x: number; y: number } | undefined {
  const object = asObject(value);
  const x = Number(object.x);
  const y = Number(object.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

function cloneWorkflow(workflow: Workflow): Workflow {
  return JSON.parse(JSON.stringify(workflow)) as Workflow;
}

function tryParseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function extractJsonBlock(text: string): string {
  const firstArray = text.indexOf("[");
  const lastArray = text.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) {
    return text.slice(firstArray, lastArray + 1);
  }
  const firstObject = text.indexOf("{");
  const lastObject = text.lastIndexOf("}");
  return firstObject >= 0 && lastObject > firstObject ? text.slice(firstObject, lastObject + 1) : "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
