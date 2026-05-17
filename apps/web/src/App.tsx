import {
  Background,
  Controls,
  Handle,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps
} from "@xyflow/react";
import {
  Bot,
  Braces,
  Check,
  Combine,
  Copy,
  Database,
  Filter,
  GitBranch,
  Github,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageSquare,
  Network,
  PackageCheck,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Split,
  Terminal,
  Trash2,
  UserRound,
  Users,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { api } from "./api";
import type { AppState, ApprovalRecord, AuthStatus, ChatSession, CredentialView, ModelProviderId, SavedSkillAsset, StoredMessage, TerminalRunResult, Workflow, WorkflowNode, WorkflowRunRecord } from "./types";

const providerModels: Record<ModelProviderId, string[]> = {
  ollama: ["llama3.1", "qwen2.5-coder", "deepseek-r1"],
  openai: ["gpt-4.1", "o4-mini", "gpt-4.1-mini"],
  anthropic: ["claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"]
};

type NodeTemplate = {
  type: string;
  kind: WorkflowNode["kind"];
  name: string;
  category: "Triggers" | "AI" | "Core" | "Logic" | "Data" | "IT Ops" | "Channels" | "Programming" | "Apps" | "Storage";
  description: string;
  icon: typeof Bot;
};

type DashboardTab = "overview" | "canvases" | "runs" | "agents" | "skills" | "credentials" | "approvals" | "settings" | "admin";

type DashboardSkillAsset = SavedSkillAsset & { source: string; canvasName: string };

const dashboardTabs: Array<{ id: DashboardTab; label: string; adminOnly?: boolean }> = [
  { id: "overview", label: "Overview" },
  { id: "canvases", label: "Canvases" },
  { id: "runs", label: "Runs" },
  { id: "agents", label: "Agents" },
  { id: "skills", label: "AI Agent Assets" },
  { id: "credentials", label: "Credentials" },
  { id: "approvals", label: "Approvals" },
  { id: "settings", label: "Settings" },
  { id: "admin", label: "Admin", adminOnly: true }
];

const nodeTemplates: NodeTemplate[] = [
  { type: "manual.trigger", kind: "trigger", name: "Manual Trigger", category: "Triggers", description: "Start workflow from Run button", icon: Play },
  { type: "schedule.trigger", kind: "trigger", name: "Schedule Trigger", category: "Triggers", description: "Start workflow on time interval", icon: RefreshCw },
  { type: "webhook.trigger", kind: "trigger", name: "Webhook Trigger", category: "Triggers", description: "Start from HTTP webhook", icon: GitBranch },
  { type: "github.trigger", kind: "trigger", name: "GitHub Trigger", category: "Triggers", description: "Start from repository webhook events", icon: Github },
  { type: "jira.trigger", kind: "trigger", name: "Jira Trigger", category: "Triggers", description: "Start from Jira webhook issue events", icon: Github },
  { type: "slack.trigger", kind: "trigger", name: "Slack Trigger", category: "Triggers", description: "Start from Slack event subscription", icon: MessageSquare },
  { type: "email.trigger", kind: "trigger", name: "Email Trigger", category: "Triggers", description: "Start from inbound email adapter", icon: Mail },
  { type: "form.trigger", kind: "trigger", name: "Form Trigger", category: "Triggers", description: "Start workflow from submitted form fields", icon: Braces },
  { type: "error.trigger", kind: "trigger", name: "Error Trigger", category: "Triggers", description: "Start from failed workflow/error event", icon: ShieldAlert },
  { type: "telegram.trigger", kind: "trigger", name: "Telegram Trigger", category: "Channels", description: "Start from Telegram Bot API webhook", icon: MessageSquare },
  { type: "whatsapp.trigger", kind: "trigger", name: "WhatsApp Trigger", category: "Channels", description: "Start from Meta WhatsApp Cloud webhook", icon: MessageSquare },
  { type: "agent.run", kind: "agent", name: "AI Agent", category: "AI", description: "Persistent canvas agent with own model, skills, and tools", icon: Bot },
  { type: "agent.soul", kind: "action", name: "Soul", category: "AI", description: "Reusable core identity prompt linked into an AI Agent", icon: Braces },
  { type: "agent.skill", kind: "action", name: "Skill Asset", category: "AI", description: "Reusable instruction/tool bundle; link many into an AI Agent", icon: PackageCheck },
  { type: "agent.personality", kind: "action", name: "Personality", category: "AI", description: "Reusable tone and behavior profile linked into an AI Agent", icon: MessageSquare },
  { type: "approval.request", kind: "action", name: "Approval", category: "Core", description: "Pause run until user approves", icon: ShieldAlert },
  { type: "stop.error", kind: "action", name: "Stop And Error", category: "Core", description: "Fail workflow and trigger error workflow", icon: ShieldAlert },
  { type: "wait.delay", kind: "action", name: "Wait", category: "Core", description: "Pause workflow until time/date/webhook resume", icon: RefreshCw },
  { type: "workflow.execute", kind: "action", name: "Execute Workflow", category: "Core", description: "Call another reusable workflow", icon: Network },
  { type: "notify.send", kind: "action", name: "Notify", category: "Core", description: "Send result back to chat or channel", icon: MessageSquare },
  { type: "http.request", kind: "action", name: "HTTP Request", category: "Core", description: "Call external API endpoint", icon: GitBranch },
  { type: "webhook.response", kind: "action", name: "Webhook Response", category: "Core", description: "Return status/body to webhook caller", icon: Network },
  { type: "condition.filter", kind: "action", name: "IF / Filter", category: "Logic", description: "Keep items matching a field condition", icon: Filter },
  { type: "switch.route", kind: "action", name: "Switch", category: "Logic", description: "Route items into multiple branches", icon: Split },
  { type: "item.limit", kind: "action", name: "Limit Items", category: "Logic", description: "Keep first N workflow items", icon: SlidersHorizontal },
  { type: "item.split", kind: "action", name: "Split Out", category: "Data", description: "Split an array field into separate items", icon: Split },
  { type: "item.merge", kind: "action", name: "Merge Items", category: "Data", description: "Combine all incoming items into one array", icon: Combine },
  { type: "item.sort", kind: "action", name: "Sort Items", category: "Data", description: "Sort items by field and direction", icon: SlidersHorizontal },
  { type: "item.aggregate", kind: "action", name: "Aggregate Items", category: "Data", description: "Group and aggregate item values", icon: Combine },
  { type: "item.dedupe", kind: "action", name: "Remove Duplicates", category: "Data", description: "Drop duplicate items by key field", icon: Filter },
  { type: "compare.datasets", kind: "action", name: "Compare Datasets", category: "Data", description: "Compare two inputs and output differences", icon: Combine },
  { type: "edit.fields", kind: "action", name: "Edit Fields", category: "Data", description: "Set, rename, or keep selected fields", icon: SlidersHorizontal },
  { type: "json.transform", kind: "action", name: "JSON Transform", category: "Data", description: "Merge or reshape item JSON", icon: SlidersHorizontal },
  { type: "text.template", kind: "action", name: "Text Template", category: "Data", description: "Create text from item fields", icon: Braces },
  { type: "csv.parse", kind: "action", name: "CSV Parse", category: "Data", description: "Parse CSV text into structured items", icon: Braces },
  { type: "xml.parse", kind: "action", name: "XML", category: "Data", description: "Parse or build XML payloads", icon: Braces },
  { type: "html.extract", kind: "action", name: "HTML Extract", category: "Data", description: "Extract text/attributes from HTML selector", icon: Braces },
  { type: "rss.read", kind: "action", name: "RSS Read", category: "Data", description: "Read RSS/Atom feed items", icon: Network },
  { type: "date.time", kind: "action", name: "Date & Time", category: "Data", description: "Format, parse, or offset date values", icon: RefreshCw },
  { type: "crypto.hash", kind: "action", name: "Crypto", category: "Data", description: "Hash/sign/encrypt workflow values", icon: ShieldAlert },
  { type: "code.javascript", kind: "action", name: "JavaScript", category: "Programming", description: "Run JavaScript against workflow items", icon: Braces },
  { type: "code.typescript", kind: "action", name: "TypeScript", category: "Programming", description: "Run TypeScript after transpile step", icon: Braces },
  { type: "code.python", kind: "action", name: "Python", category: "Programming", description: "Run Python in sandbox/task runner", icon: Braces },
  { type: "code.bash", kind: "action", name: "Bash Script", category: "Programming", description: "Run approved Bash script in sandbox", icon: Terminal },
  { type: "code.powershell", kind: "action", name: "PowerShell", category: "Programming", description: "Run approved PowerShell script", icon: Terminal },
  { type: "code.go", kind: "action", name: "Go", category: "Programming", description: "Compile or run Go snippet/package", icon: Braces },
  { type: "code.rust", kind: "action", name: "Rust", category: "Programming", description: "Compile or run Rust snippet/package", icon: Braces },
  { type: "code.java", kind: "action", name: "Java", category: "Programming", description: "Compile or run Java class/JAR task", icon: Braces },
  { type: "code.csharp", kind: "action", name: "C#", category: "Programming", description: "Run .NET/C# script or project task", icon: Braces },
  { type: "code.php", kind: "action", name: "PHP", category: "Programming", description: "Run PHP script against workflow data", icon: Braces },
  { type: "code.ruby", kind: "action", name: "Ruby", category: "Programming", description: "Run Ruby script against workflow data", icon: Braces },
  { type: "code.lua", kind: "action", name: "Lua", category: "Programming", description: "Run Lua script for lightweight transforms", icon: Braces },
  { type: "code.perl", kind: "action", name: "Perl", category: "Programming", description: "Run Perl text/data transform", icon: Braces },
  { type: "code.r", kind: "action", name: "R", category: "Programming", description: "Run R script for stats/data tasks", icon: Braces },
  { type: "code.c", kind: "action", name: "C", category: "Programming", description: "Compile/run C snippet in sandbox", icon: Braces },
  { type: "code.cpp", kind: "action", name: "C++", category: "Programming", description: "Compile/run C++ snippet in sandbox", icon: Braces },
  { type: "code.sql", kind: "action", name: "SQL Script", category: "Programming", description: "Run parameterized SQL script through DB adapter", icon: Database },
  { type: "code.regex", kind: "action", name: "Regex", category: "Programming", description: "Extract, replace, or validate text with regex", icon: Braces },
  { type: "code.jq", kind: "action", name: "jq", category: "Programming", description: "Transform JSON with jq expression", icon: Braces },
  { type: "cache.store", kind: "action", name: "Cache Store", category: "Core", description: "Store key/value for short-lived workflow state", icon: Database },
  { type: "queue.publish", kind: "action", name: "Queue Publish", category: "Core", description: "Publish payload to queue/topic adapter", icon: Send },
  { type: "telegram.send", kind: "action", name: "Telegram Send", category: "Channels", description: "Send message through Telegram Bot API", icon: Send },
  { type: "whatsapp.send", kind: "action", name: "WhatsApp Send", category: "Channels", description: "Send message through WhatsApp Cloud API", icon: Send },
  { type: "discord.send", kind: "action", name: "Discord", category: "Channels", description: "Send Discord message or webhook payload", icon: MessageSquare },
  { type: "slack.send", kind: "action", name: "Slack", category: "Channels", description: "Send Slack channel message", icon: MessageSquare },
  { type: "email.send", kind: "action", name: "Email Send", category: "Channels", description: "Send SMTP email message", icon: Mail },
  { type: "gmail.action", kind: "action", name: "Gmail", category: "Apps", description: "Send/search/manage Gmail messages", icon: Mail },
  { type: "google.sheets", kind: "action", name: "Google Sheets", category: "Apps", description: "Read, append, update spreadsheet rows", icon: Database },
  { type: "google.drive", kind: "action", name: "Google Drive", category: "Apps", description: "Upload, download, search Drive files", icon: GitBranch },
  { type: "notion.action", kind: "action", name: "Notion", category: "Apps", description: "Create/query/update Notion pages/databases", icon: Database },
  { type: "airtable.action", kind: "action", name: "Airtable", category: "Apps", description: "Create/search/update Airtable records", icon: Database },
  { type: "hubspot.action", kind: "action", name: "HubSpot", category: "Apps", description: "Create/search/update CRM objects", icon: Database },
  { type: "trello.action", kind: "action", name: "Trello", category: "Apps", description: "Create/update cards, lists, boards", icon: SlidersHorizontal },
  { type: "linear.action", kind: "action", name: "Linear", category: "Apps", description: "Create/update issues and projects", icon: Github },
  { type: "jira.action", kind: "action", name: "Jira", category: "Apps", description: "Create/update/search Jira issues", icon: Github },
  { type: "github.action", kind: "action", name: "GitHub", category: "Apps", description: "Issues, PRs, repos, releases", icon: Github },
  { type: "s3.action", kind: "action", name: "S3", category: "Storage", description: "Upload, download, list object storage files", icon: Database },
  { type: "ftp.action", kind: "action", name: "FTP/SFTP", category: "Storage", description: "Transfer files over FTP/SFTP", icon: Server },
  { type: "redis.action", kind: "action", name: "Redis", category: "Storage", description: "Read/write Redis keys and streams", icon: Database },
  { type: "mongodb.action", kind: "action", name: "MongoDB", category: "Storage", description: "Find, insert, update Mongo documents", icon: Database },
  { type: "elasticsearch.action", kind: "action", name: "Elasticsearch", category: "Storage", description: "Search/index documents", icon: Search },
  { type: "file.action", kind: "action", name: "File", category: "IT Ops", description: "Read/write files through policy boundary", icon: GitBranch },
  { type: "git.action", kind: "action", name: "Git", category: "IT Ops", description: "Inspect or operate on repository state", icon: GitBranch },
  { type: "test.run", kind: "action", name: "Run Tests", category: "IT Ops", description: "Run approved test command in sandbox", icon: PackageCheck },
  { type: "database.query", kind: "action", name: "Database Query", category: "IT Ops", description: "Run read query through DB adapter policy", icon: Database },
  { type: "docker.action", kind: "action", name: "Docker", category: "IT Ops", description: "Inspect containers or approved Docker commands", icon: PackageCheck },
  { type: "shell.action", kind: "action", name: "Shell", category: "IT Ops", description: "Run sandboxed shell command with approval policy", icon: Terminal },
  { type: "ssh.action", kind: "action", name: "SSH", category: "IT Ops", description: "Run server diagnostics or approved runbooks", icon: Server }
];

const appName = "Frostbyte Control Plane";
const flowNodeWidth = 220;
const flowNodeHeight = 82;
const groupPaddingX = 28;
const groupPaddingTop = 42;
const groupPaddingBottom = 30;
const flowNodeTypes = { baryonNode: BaryonNode };

export function App() {
  return (
    <ReactFlowProvider>
      <BaryonApp />
    </ReactFlowProvider>
  );
}

function BaryonApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [runs, setRuns] = useState<WorkflowRunRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("default-session");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [view, setView] = useState<"dashboard" | "workspace">("dashboard");
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>("overview");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("Loading");
  const [apiOnline, setApiOnline] = useState(false);
  const [canvasOnline, setCanvasOnline] = useState(true);
  const [browserOnline, setBrowserOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [sending, setSending] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");
  const [showAllNodes, setShowAllNodes] = useState(false);
  const [assetTypeFilter, setAssetTypeFilter] = useState<"all" | "soul" | "skill" | "personality">("all");
  const [dragPreview, setDragPreview] = useState<{ template: NodeTemplate; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [groupDeleteRequest, setGroupDeleteRequest] = useState<{ nodeId: string; groupId: string } | null>(null);
  const [runningTerminalNodeId, setRunningTerminalNodeId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "user">("user");
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});
  const [credentialDraft, setCredentialDraft] = useState({
    name: "",
    service: "github",
    authType: "token" as CredentialView["authType"],
    dataText: "token=",
    sharedWithUsernames: ""
  });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const pointerDragRef = useRef<{ template: NodeTemplate; startX: number; startY: number; moved: boolean } | null>(null);
  const overCanvasRef = useRef(false);
  const dropHandledAtRef = useRef(0);
  const ignoreSelectionChangeUntilRef = useRef(0);
  const savedWorkflowSignaturesRef = useRef<Map<string, string>>(new Map());
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveSequenceRef = useRef(0);
  const workflowUndoStackRef = useRef<Map<string, Workflow[]>>(new Map());
  const workflowRedoStackRef = useRef<Map<string, Workflow[]>>(new Map());
  const nodeDragHistoryStartedRef = useRef(false);
  const { fitView, getViewport } = useReactFlow();

  const workflow = state?.workflows.find((item) => item.id === selectedWorkflowId) ?? null;
  const canvasSessions = state && workflow ? state.sessions.filter((item) => item.workflowId === workflow.id) : [];
  const session = canvasSessions.find((item) => item.id === selectedSessionId) ?? canvasSessions[0];
  const selectedNode = workflow?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedNodeRun = workflow && selectedNode ? runs.find((run) => run.workflowId === workflow.id && run.nodeOutputs?.[selectedNode.id]) : undefined;
  const needsAdminBootstrap = authStatus?.adminExists === false;
  const activeDashboardTab: DashboardTab = state?.user.role === "admin" || dashboardTab !== "admin" ? dashboardTab : "overview";
  const dashboardStats = useMemo(() => (state ? buildDashboardStats(state, runs, apiOnline, browserOnline) : null), [apiOnline, browserOnline, runs, state]);
  const dashboardSkills = useMemo(() => (state ? collectDashboardSkills(state) : []), [state]);
  const filteredAgentAssets = useMemo(
    () => dashboardSkills.filter((asset) => assetTypeFilter === "all" || asset.type === assetTypeFilter),
    [assetTypeFilter, dashboardSkills]
  );
  const dashboardCredentials = useMemo(() => (state ? collectDashboardCredentials(state) : []), [state]);
  const dashboardProviders = useMemo(() => (state ? collectDashboardProviders(state) : []), [state]);

  const refresh = useCallback(async () => {
    const nextState = await api.state();
    savedWorkflowSignaturesRef.current = new Map(nextState.workflows.map((item) => [item.id, workflowSaveSignature(item)]));
    setState(nextState);
    setApiOnline(true);
    setSelectedSessionId((current) => nextState.sessions.find((item) => item.id === current)?.id ?? "");
    setSelectedWorkflowId((current) => nextState.workflows.find((item) => item.id === current)?.id ?? "");
    setRuns(await api.runs());
    setStatus("Ready");
  }, []);

  useEffect(() => {
    api
      .authStatus()
      .then((nextAuthStatus) => {
        setAuthStatus(nextAuthStatus);
        const token = localStorage.getItem("baryon.auth.token");
        if (!token) {
          setStatus(nextAuthStatus.adminExists ? "Login required" : "Create admin account");
          return;
        }
        refresh().catch((error) => {
          if (error instanceof Error && error.message.startsWith("401:")) {
            localStorage.removeItem("baryon.auth.token");
            setState(null);
            setStatus(nextAuthStatus.adminExists ? "Login required" : "Create admin account");
            return;
          }
          setApiOnline(false);
          setStatus(error instanceof Error ? error.message : String(error));
        });
      })
      .catch((error) => {
        setApiOnline(false);
        setStatus(error instanceof Error ? error.message : String(error));
      });
  }, [refresh]);

  const submitAuth = useCallback(async () => {
    if (!authUsername.trim() || !authPassword) {
      setAuthError("Username and password required");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const result = needsAdminBootstrap ? await api.bootstrapAdmin(authUsername.trim(), authPassword) : await api.login(authUsername.trim(), authPassword);
      localStorage.setItem("baryon.auth.token", result.token);
      setAuthStatus(await api.authStatus());
      await refresh();
      setAuthPassword("");
      setView("dashboard");
      setStatus(needsAdminBootstrap ? "Admin created" : `Logged in as ${result.user.username}`);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  }, [authPassword, authUsername, needsAdminBootstrap, refresh]);

  useEffect(() => {
    if (!workflow) {
      return;
    }
    const signature = workflowSaveSignature(workflow);
    if (savedWorkflowSignaturesRef.current.get(workflow.id) === signature) {
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    const sequence = autosaveSequenceRef.current + 1;
    autosaveSequenceRef.current = sequence;
    setStatus("Autosaving canvas");
    autosaveTimerRef.current = window.setTimeout(() => {
      api
        .saveWorkflow(workflow)
        .then((saved) => {
          const savedSignature = workflowSaveSignature(saved);
          savedWorkflowSignaturesRef.current.set(saved.id, savedSignature);
          setState((current) => {
            if (!current) {
              return current;
            }
            const currentWorkflow = current.workflows.find((item) => item.id === saved.id);
            if (!currentWorkflow || workflowSaveSignature(currentWorkflow) !== signature) {
              return current;
            }
            return {
              ...current,
              workflows: current.workflows.map((item) => (item.id === saved.id ? saved : item))
            };
          });
          if (autosaveSequenceRef.current === sequence) {
            setStatus("Canvas autosaved");
          }
        })
        .catch((error) => {
          setApiOnline(false);
          setStatus(error instanceof Error ? `Autosave failed: ${error.message}` : "Autosave failed");
        });
    }, 650);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [workflow]);

  useEffect(() => {
    if (!session) {
      return;
    }
    api.messages(session.id).then(setMessages).catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, [session?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, session?.id]);

  useEffect(() => {
    function onOnline() {
      setBrowserOnline(true);
    }
    function onOffline() {
      setBrowserOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    function closeOnDrag(event: PointerEvent) {
      if (event.buttons !== 0) {
        setContextMenu(null);
      }
    }
    window.addEventListener("pointermove", closeOnDrag);
    return () => window.removeEventListener("pointermove", closeOnDrag);
  }, [contextMenu]);

  useEffect(() => {
    if (!workflow || workflow.nodes.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      fitView({ padding: 0.25, duration: 220 });
    }, 60);
    return () => {
      window.clearTimeout(timer);
    };
  }, [fitView, workflow?.id]);

  useEffect(() => {
    function closeContextMenu() {
      setContextMenu(null);
    }

    function closeContextMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    }

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("keydown", closeContextMenuOnEscape);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("keydown", closeContextMenuOnEscape);
    };
  }, []);

  const updateWorkflow = useCallback((nextWorkflow: Workflow, options: { recordHistory?: boolean } = {}) => {
    setState((current) => {
      if (!current) {
        return current;
      }
      const previousWorkflow = current.workflows.find((item) => item.id === nextWorkflow.id);
      const shouldRecord = options.recordHistory !== false && previousWorkflow && workflowSaveSignature(previousWorkflow) !== workflowSaveSignature(nextWorkflow);
      if (shouldRecord) {
        const stack = workflowUndoStackRef.current.get(nextWorkflow.id) ?? [];
        stack.push(structuredClone(previousWorkflow));
        workflowUndoStackRef.current.set(nextWorkflow.id, stack.slice(-80));
        workflowRedoStackRef.current.set(nextWorkflow.id, []);
      }
      return {
        ...current,
        workflows: current.workflows.map((item) => (item.id === nextWorkflow.id ? nextWorkflow : item))
      };
    });
  }, []);

  useEffect(() => {
    if (!workflow) {
      return;
    }
    const clamped = clampWorkflowChildrenToGroups(workflow);
    if (clamped !== workflow) {
      updateWorkflow(clamped, { recordHistory: false });
    }
  }, [updateWorkflow, workflow]);

  const flowNodes = useMemo<Node[]>(
    () =>
      orderNodesForFlow(workflow?.nodes ?? []).map((node) => {
        const isGroup = node.type === "group.box";
        const nodeWidth = isGroup ? Number(node.config.width ?? 420) : flowNodeWidth;
        const nodeHeight = isGroup ? Number(node.config.height ?? 280) : flowNodeHeight;
        const groupMinimum = isGroup && workflow ? getGroupMinimumSize(node.id, workflow.nodes) : null;
        return {
          id: node.id,
          type: isGroup ? "groupNode" : "baryonNode",
          position: node.position,
          parentId: node.parentId,
          extent: node.extent,
          zIndex: isGroup ? 0 : node.parentId ? 2 : 1,
          width: nodeWidth,
          height: nodeHeight,
          initialWidth: nodeWidth,
          initialHeight: nodeHeight,
          measured: { width: nodeWidth, height: nodeHeight },
          style: isGroup
            ? {
                width: nodeWidth,
                height: nodeHeight,
                minHeight: nodeHeight,
                background: "rgb(103 167 255 / 8%)",
                border: "1px dashed rgb(103 167 255 / 55%)",
                borderRadius: 8
              }
            : { width: flowNodeWidth, minHeight: flowNodeHeight },
          selectable: true,
          draggable: true,
          data: {
            workflowNode: node,
            selected: selectedNodeIds.includes(node.id) || node.id === selectedNode?.id,
            minWidth: groupMinimum?.width,
            minHeight: groupMinimum?.height
          }
        };
      }),
    [selectedNode?.id, selectedNodeIds, workflow]
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      workflow?.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        selected: edge.id === selectedEdgeId,
        animated: true,
        className: "flow-edge"
      })) ?? [],
    [selectedEdgeId, workflow]
  );

  const visibleNodeTemplates = useMemo(() => {
    const query = nodeSearch.trim().toLowerCase();
    if (!query) {
      return nodeTemplates;
    }
    return nodeTemplates.filter((template) =>
      [template.name, template.type, template.category, template.description].some((value) => value.toLowerCase().includes(query))
    );
  }, [nodeSearch]);

  const primaryNodeTemplates = useMemo(
    () =>
      ["agent.run", "agent.soul", "agent.skill", "agent.personality", "http.request"]
        .map((type) => nodeTemplates.find((template) => template.type === type))
        .filter((template): template is NodeTemplate => Boolean(template)),
    []
  );

  const compactNodeTemplates = nodeSearch.trim() ? visibleNodeTemplates.slice(0, 5) : primaryNodeTemplates;
  const moreNodeTemplates = visibleNodeTemplates.filter((template) => !compactNodeTemplates.some((primary) => primary.type === template.type));
  const moreNodeGroups = useMemo(
    () => [
      { label: "Actions", templates: moreNodeTemplates.filter((template) => template.kind === "action" && !["Programming", "Apps", "Storage"].includes(template.category)) },
      { label: "Triggers", templates: moreNodeTemplates.filter((template) => template.kind === "trigger") },
      { label: "Programming", templates: moreNodeTemplates.filter((template) => template.category === "Programming") },
      { label: "Apps", templates: moreNodeTemplates.filter((template) => template.category === "Apps") },
      { label: "Storage", templates: moreNodeTemplates.filter((template) => template.category === "Storage") },
      { label: "AI", templates: moreNodeTemplates.filter((template) => template.kind === "agent") }
    ],
    [moreNodeTemplates]
  );

  function applyHistory(direction: "undo" | "redo") {
    if (!workflow) {
      return;
    }
    const fromStackMap = direction === "undo" ? workflowUndoStackRef.current : workflowRedoStackRef.current;
    const toStackMap = direction === "undo" ? workflowRedoStackRef.current : workflowUndoStackRef.current;
    const fromStack = fromStackMap.get(workflow.id) ?? [];
    const targetWorkflow = fromStack.pop();
    if (!targetWorkflow) {
      setStatus(direction === "undo" ? "Nothing to undo" : "Nothing to redo");
      return;
    }
    const toStack = toStackMap.get(workflow.id) ?? [];
    toStack.push(structuredClone(workflow));
    toStackMap.set(workflow.id, toStack.slice(-80));
    fromStackMap.set(workflow.id, fromStack);
    updateWorkflow({ ...targetWorkflow, updatedAt: new Date().toISOString() }, { recordHistory: false });
    setSelectedNodeIds((current) => current.filter((id) => targetWorkflow.nodes.some((node) => node.id === id)));
    setSelectedNodeId((current) => (current && targetWorkflow.nodes.some((node) => node.id === current) ? current : null));
    setSelectedEdgeId((current) => (current && targetWorkflow.edges.some((edge) => edge.id === current) ? current : null));
    setStatus(direction === "undo" ? "Undo canvas change" : "Redo canvas change");
  }

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!workflow) {
        return;
      }
      const changed = applyNodeChanges(changes, flowNodes);
      const recordHistory = shouldRecordNodeChangeHistory(changes, nodeDragHistoryStartedRef);
      updateWorkflow({
        ...workflow,
        nodes: workflow.nodes.map((node) => {
          const changedNode = changed.find((item) => item.id === node.id);
          if (!changedNode) {
            return node;
          }
          if (node.type === "group.box") {
            return {
              ...node,
              position: changedNode.position,
              config: {
                ...node.config,
                width: changedNode.width ?? node.config.width,
                height: changedNode.height ?? node.config.height
              }
            };
          }
          return { ...node, position: clampNodePositionInParent(node, changedNode.position, workflow.nodes) };
        }),
        updatedAt: new Date().toISOString()
      }, { recordHistory });
    },
    [flowNodes, updateWorkflow, workflow]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!workflow) {
        return;
      }
      const changed = applyEdgeChanges(changes, flowEdges);
      updateWorkflow({
        ...workflow,
        edges: changed.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle
        })),
        updatedAt: new Date().toISOString()
      });
    },
    [flowEdges, updateWorkflow, workflow]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!workflow) {
        return;
      }
      const normalizedConnection = normalizeConnection(connection, workflow);
      if (!normalizedConnection) {
        setStatus("Invalid profile link");
        return;
      }
      const changed = addEdge({ ...normalizedConnection, id: crypto.randomUUID(), animated: true }, flowEdges);
      updateWorkflow({
        ...workflow,
        edges: changed.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle
        })),
        updatedAt: new Date().toISOString()
      });
    },
    [flowEdges, updateWorkflow, workflow]
  );

  const updateSelection = useCallback((ids: string[]) => {
    setSelectedNodeIds((current) => (arraysEqual(current, ids) ? current : ids));
    setSelectedNodeId((current) => {
      const next = ids.at(-1) ?? null;
      return current === next ? current : next;
    });
  }, []);

  useEffect(() => {
    function onDeleteKey(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        applyHistory(event.shiftKey ? "redo" : "undo");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        applyHistory("redo");
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      event.preventDefault();
      if (selectedEdgeId) {
        deleteEdge(selectedEdgeId);
        return;
      }
      if (selectedNodeIds.length > 0) {
        deleteNodes(selectedNodeIds);
      }
    }
    window.addEventListener("keydown", onDeleteKey);
    return () => window.removeEventListener("keydown", onDeleteKey);
  }, [selectedEdgeId, selectedNodeIds, workflow]);

  async function sendMessage() {
    if (!session || !workflow || !draft.trim() || sending) {
      return;
    }
    try {
      setSending(true);
      setStatus("Calling chat model");
      const result = await api.sendMessage(session.id, draft.trim(), {
        workflow,
        workflowId: workflow.id,
        selectedNodeId
      });
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
      if (result.approval) {
        const approval = result.approval;
        setState((current) =>
          current
            ? {
                ...current,
                approvals: [approval, ...current.approvals.filter((item) => item.id !== approval.id)]
              }
            : current
        );
      }
      if (result.canvas?.workflow) {
        const canvasWorkflow = result.canvas.workflow;
        savedWorkflowSignaturesRef.current.set(canvasWorkflow.id, workflowSaveSignature(canvasWorkflow));
        setState((current) =>
          current
            ? {
                ...current,
                workflows: current.workflows.some((item) => item.id === canvasWorkflow.id)
                  ? current.workflows.map((item) => (item.id === canvasWorkflow.id ? canvasWorkflow : item))
                  : [canvasWorkflow, ...current.workflows]
              }
            : current
        );
        setSelectedWorkflowId(canvasWorkflow.id);
        if (result.canvas.selectedNodeId !== undefined) {
          setSelectedNodeId(result.canvas.selectedNodeId);
          setSelectedNodeIds(result.canvas.selectedNodeId ? [result.canvas.selectedNodeId] : []);
          setSelectedEdgeId(null);
        }
        if (result.canvas.run) {
          setRuns((current) => [result.canvas!.run!, ...current.filter((run) => run.id !== result.canvas!.run!.id)]);
        }
        if (result.canvas.approval) {
          const approval = result.canvas.approval;
          setState((current) =>
            current
              ? {
                  ...current,
                  approvals: [approval, ...current.approvals.filter((item) => item.id !== approval.id)]
                }
              : current
          );
        }
      }
      setDraft("");
      setStatus(result.canvas?.actions.length ? "Canvas updated from chat" : "Ready");
    } finally {
      setSending(false);
    }
  }

  async function decideChatApproval(approvalId: string, decision: "approved" | "rejected") {
    setStatus(decision === "approved" ? "Approving request" : "Denying request");
    const result = await api.decideApproval(approvalId, decision);
    setState((current) =>
      current
        ? {
            ...current,
            approvals: [result.approval, ...current.approvals.filter((item) => item.id !== result.approval.id)]
          }
        : current
    );
    if (result.message && result.message.sessionId === session?.id) {
      setMessages((current) => [...current, result.message!]);
    }
    setStatus(decision === "approved" ? "Approval accepted" : "Approval denied");
  }

  async function createChat() {
    if (!state || !workflow) {
      return;
    }
    const baseModel = session?.model ?? { provider: "ollama" as const, model: "llama3.1" };
    const newSession = await api.createSession(
      `Chat ${canvasSessions.length + 1}`,
      baseModel,
      baseModel.provider === "ollama" ? "off" : "medium",
      workflow.id
    );
    setState({
      ...state,
      sessions: [newSession, ...state.sessions]
    });
    setSelectedSessionId(newSession.id);
    setMessages([]);
  }

  async function openCanvas(canvas: Workflow) {
    if (!state) {
      return;
    }
    setStatus(`Opening ${canvas.name}`);
    const matchingSessions = state.sessions.filter((item) => item.workflowId === canvas.id);
    let nextSession = matchingSessions[0];
    if (!nextSession) {
      const baseModel = { provider: "ollama" as const, model: "llama3.1" };
      const createdSession = await api.createSession("Chat 1", baseModel, "off", canvas.id);
      nextSession = createdSession;
      setState((current) => (current ? { ...current, sessions: [createdSession, ...current.sessions] } : current));
    }
    setSelectedWorkflowId(canvas.id);
    setSelectedSessionId(nextSession.id);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    setMessages([]);
    setView("workspace");
    setStatus("Ready");
  }

  async function createCanvas() {
    if (!state) {
      return;
    }
    setStatus("Creating canvas");
    const time = new Date().toISOString();
    const workflowName = `Canvas ${state.workflows.length + 1}`;
    const created = await api.saveWorkflow({
      id: crypto.randomUUID(),
      name: workflowName,
      version: 1,
      createdAt: time,
      updatedAt: time,
      nodes: [],
      edges: []
    });
    savedWorkflowSignaturesRef.current.set(created.id, workflowSaveSignature(created));
    const baseModel = { provider: "ollama" as const, model: "llama3.1" };
    const newSession = await api.createSession("Chat 1", baseModel, "off", created.id);
    setState({
      ...state,
      workflows: [created, ...state.workflows],
      sessions: [newSession, ...state.sessions]
    });
    setSelectedWorkflowId(created.id);
    setSelectedSessionId(newSession.id);
    setMessages([]);
    setView("workspace");
    setStatus("Canvas created");
  }

  async function shareCanvas(workflowId: string) {
    const username = shareInputs[workflowId]?.trim();
    if (!state || !username) {
      return;
    }
    try {
      setStatus(`Sharing canvas with ${username}`);
      const shared = await api.shareWorkflow(workflowId, username);
      setState({
        ...state,
        workflows: state.workflows.map((item) => (item.id === shared.id ? shared : item))
      });
      setShareInputs((current) => ({ ...current, [workflowId]: "" }));
      setStatus(`Canvas shared with ${username}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveSkillAssetFromNode(node: WorkflowNode) {
    if (!state || !isSkillAssetNode(node)) {
      return;
    }
    const input = skillSaveInputFromNode(node);
    try {
      setStatus(`Saving ${input.name}`);
      const saved = await api.saveSkill(input);
      setState({
        ...state,
        skills: [saved, ...(state.skills ?? []).filter((item) => item.id !== saved.id)]
      });
      setStatus(`Saved ${saved.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteSavedSkill(id: string) {
    if (!state) return;
    try {
      await api.deleteSkill(id);
      setState({
        ...state,
        skills: (state.skills ?? []).filter((skill) => skill.id !== id)
      });
      setStatus("Skill deleted");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveCredentialDraft() {
    if (!state || !credentialDraft.name.trim() || !credentialDraft.service.trim()) {
      return;
    }
    try {
      setStatus(`Saving credential ${credentialDraft.name}`);
      const saved = await api.saveCredential({
        name: credentialDraft.name.trim(),
        service: credentialDraft.service.trim(),
        authType: credentialDraft.authType,
        data: keyValueTextToObject(credentialDraft.dataText),
        sharedWithUsernames: csvToList(credentialDraft.sharedWithUsernames)
      });
      setState({
        ...state,
        credentials: [saved, ...(state.credentials ?? []).filter((credential) => credential.id !== saved.id)]
      });
      setCredentialDraft({ name: "", service: credentialDraft.service, authType: credentialDraft.authType, dataText: "", sharedWithUsernames: "" });
      setStatus(`Saved credential ${saved.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteCredential(id: string) {
    if (!state) {
      return;
    }
    try {
      await api.deleteCredential(id);
      setState({
        ...state,
        credentials: (state.credentials ?? []).filter((credential) => credential.id !== id)
      });
      setStatus("Credential deleted");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function retryRun(run: WorkflowRunRecord) {
    const targetWorkflow = state?.workflows.find((item) => item.id === run.workflowId);
    if (!targetWorkflow) {
      setStatus("Workflow not found for retry");
      return;
    }
    try {
      setStatus(`Retrying ${targetWorkflow.name}`);
      const retried = await api.runWorkflow(targetWorkflow.id, run.items[0]?.json ?? {});
      setRuns((current) => [retried, ...current.filter((item) => item.id !== retried.id)]);
      setStatus(`Run ${retried.status}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function logout() {
    localStorage.removeItem("baryon.auth.token");
    setState(null);
    setSelectedWorkflowId("");
    setSelectedSessionId("");
    setView("dashboard");
    setStatus("Logged out");
  }

  async function saveWorkflow() {
    if (!workflow) {
      return;
    }
    setStatus("Saving workflow");
    const saved = await api.saveWorkflow(workflow);
    savedWorkflowSignaturesRef.current.set(saved.id, workflowSaveSignature(saved));
    updateWorkflow(saved);
    setStatus("Saved");
  }

  async function updateSessionModel(patch: Partial<ChatSession>) {
    if (!session) {
      return;
    }
    const updated = await api.updateSession(session.id, patch);
    if (!state) {
      return;
    }
    setState({
      ...state,
      sessions: state.sessions.map((item) => (item.id === updated.id ? updated : item))
    });
  }

  function addNode(template: NodeTemplate, position?: { x: number; y: number }) {
    if (!workflow) {
      return;
    }
    const id = crypto.randomUUID();
    const node: WorkflowNode = {
      id,
      type: template.type,
      kind: template.kind,
      name: template.name,
      position: position ?? { x: 260 + workflow.nodes.length * 36, y: 260 + workflow.nodes.length * 18 },
      config: createNodeConfig(template, id)
    };
    updateWorkflow({
      ...workflow,
      nodes: [...workflow.nodes, node],
      updatedAt: new Date().toISOString()
    });
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
    setStatus(`Added ${template.name}`);
  }

  function addSkillAssetToCanvas(skill: DashboardSkillAsset) {
    if (!workflow) {
      return;
    }
    const nodeType = skill.type === "soul" ? "agent.soul" : skill.type === "personality" ? "agent.personality" : "agent.skill";
    const template = nodeTemplates.find((item) => item.type === nodeType);
    if (!template) {
      return;
    }
    const id = crypto.randomUUID();
    const node: WorkflowNode = {
      id,
      type: template.type,
      kind: template.kind,
      name: skill.name,
      position: { x: 180 + workflow.nodes.length * 28, y: 140 + workflow.nodes.length * 20 },
      config: createSkillAssetNodeConfig(skill)
    };
    updateWorkflow({
      ...workflow,
      nodes: [...workflow.nodes, node],
      updatedAt: new Date().toISOString()
    });
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
    setStatus(`Placed ${skill.name}`);
  }

  function addNodeAtScreenPoint(template: NodeTemplate, x: number, y: number) {
    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    if (!canvasBounds) {
      addNode(template);
      return;
    }

    const insideCanvas = x >= canvasBounds.left && x <= canvasBounds.right && y >= canvasBounds.top && y <= canvasBounds.bottom;
    const fallbackX = Math.max(canvasBounds.left + 120, Math.min(x, canvasBounds.right - 120));
    const fallbackY = Math.max(canvasBounds.top + 60, Math.min(y, canvasBounds.bottom - 60));
    const dropX = insideCanvas ? x : fallbackX;
    const dropY = insideCanvas ? y : fallbackY;
    const viewport = getViewport();
    addNode(template, {
      x: (dropX - canvasBounds.left - viewport.x) / viewport.zoom,
      y: (dropY - canvasBounds.top - viewport.y) / viewport.zoom
    });
  }

  function onNodePointerDown(event: ReactPointerEvent<HTMLElement>, template: NodeTemplate) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    pointerDragRef.current = {
      template,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
  }

  function onCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (Date.now() - dropHandledAtRef.current < 350) {
      return;
    }
    const templateType = event.dataTransfer.getData("application/baryon-node") || event.dataTransfer.getData("text/plain");
    const template = nodeTemplates.find((item) => item.type === templateType);
    if (!template) {
      return;
    }
    addNodeAtScreenPoint(template, event.clientX, event.clientY);
  }

  function onCanvasDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function updateNodeConfig(patch: Record<string, unknown>) {
    if (!workflow || !selectedNode) {
      return;
    }
    updateWorkflow({
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === selectedNode.id ? { ...node, config: { ...node.config, ...patch } } : node
      ),
      updatedAt: new Date().toISOString()
    });
  }

  function updateNode(patch: { name?: string; config?: Record<string, unknown> }) {
    if (!workflow || !selectedNode) {
      return;
    }
    updateWorkflow({
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              name: patch.name ?? node.name,
              config: patch.config ? { ...node.config, ...patch.config } : node.config
            }
          : node
      ),
      updatedAt: new Date().toISOString()
    });
  }

  async function runSelectedNodeTerminal(command: string) {
    if (!workflow || !selectedNode || !isTerminalNode(selectedNode) || runningTerminalNodeId) {
      return;
    }
    const trimmed = command.trim();
    if (!trimmed) {
      setStatus("Terminal command required");
      return;
    }
    setRunningTerminalNodeId(selectedNode.id);
    setStatus(`Running terminal for ${selectedNode.name}`);
    try {
      const result = await api.runTerminal({
        workflowId: workflow.id,
        nodeId: selectedNode.id,
        nodeType: selectedNode.type,
        command: trimmed,
        timeoutSeconds: Number(selectedNode.config.timeoutSeconds ?? 60)
      });
      appendTerminalResult(workflow, selectedNode.id, result);
      setStatus(result.timedOut ? "Terminal command timed out" : `Terminal exited ${result.exitCode ?? "unknown"}`);
    } catch (error) {
      const result: TerminalRunResult = {
        id: crypto.randomUUID(),
        nodeId: selectedNode.id,
        nodeType: selectedNode.type,
        command: trimmed,
        cwd: "",
        exitCode: null,
        timedOut: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString()
      };
      appendTerminalResult(workflow, selectedNode.id, result);
      setStatus("Terminal command failed");
    } finally {
      setRunningTerminalNodeId(null);
    }
  }

  function appendTerminalResult(targetWorkflow: Workflow, nodeId: string, result: TerminalRunResult) {
    updateWorkflow(
      {
        ...targetWorkflow,
        nodes: targetWorkflow.nodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          const history = terminalHistoryFromNode(node);
          return {
            ...node,
            config: {
              ...node.config,
              terminalHistory: [result, ...history].slice(0, 25)
            }
          };
        }),
        updatedAt: new Date().toISOString()
      },
      { recordHistory: false }
    );
  }

  function deleteNodes(ids: string[]) {
    if (!workflow || ids.length === 0) {
      return;
    }
    if (ids.length === 1) {
      const node = workflow.nodes.find((item) => item.id === ids[0]);
      if (node?.parentId) {
        setGroupDeleteRequest({ nodeId: node.id, groupId: node.parentId });
        return;
      }
    }
    performDelete(ids);
  }

  function performDelete(ids: string[]) {
    if (!workflow || ids.length === 0) {
      return;
    }
    const idSet = new Set(ids);
    updateWorkflow({
      ...workflow,
      nodes: workflow.nodes.filter((node) => !idSet.has(node.id)),
      edges: workflow.edges.filter((edge) => !idSet.has(edge.source) && !idSet.has(edge.target)),
      updatedAt: new Date().toISOString()
    });
    setSelectedNodeIds((current) => current.filter((id) => !idSet.has(id)));
    setSelectedNodeId((current) => (current && !idSet.has(current) ? current : null));
    setSelectedEdgeId((current) => (current && idSet.has(current) ? null : current));
    setStatus(ids.length === 1 ? "Deleted node" : `Deleted ${ids.length} nodes`);
  }

  function resolveGroupDelete(mode: "node" | "group") {
    if (!workflow || !groupDeleteRequest) {
      return;
    }
    if (mode === "node") {
      performDelete([groupDeleteRequest.nodeId]);
      setGroupDeleteRequest(null);
      return;
    }
    const ids = [groupDeleteRequest.groupId, ...workflow.nodes.filter((node) => node.parentId === groupDeleteRequest.groupId).map((node) => node.id)];
    performDelete(ids);
    setGroupDeleteRequest(null);
  }

  function deleteEdge(edgeId: string) {
    if (!workflow) {
      return;
    }
    updateWorkflow({
      ...workflow,
      edges: workflow.edges.filter((edge) => edge.id !== edgeId),
      updatedAt: new Date().toISOString()
    });
    setSelectedEdgeId(null);
    setStatus("Deleted connection");
  }

  function duplicateNode(id: string) {
    if (!workflow) {
      return;
    }
    const source = workflow.nodes.find((node) => node.id === id);
    if (!source) {
      return;
    }
    const duplicateId = crypto.randomUUID();
    const duplicate: WorkflowNode = {
      ...source,
      id: duplicateId,
      name: `${source.name} Copy`,
      position: { x: source.position.x + 36, y: source.position.y + 36 },
      config: structuredClone(source.config)
    };
    updateWorkflow({
      ...workflow,
      nodes: [...workflow.nodes, duplicate],
      updatedAt: new Date().toISOString()
    });
    setSelectedNodeId(duplicateId);
    setSelectedNodeIds([duplicateId]);
    setStatus(`Duplicated ${source.name}`);
  }

  function selectAllNodes() {
    if (!workflow) {
      return;
    }
    const ids = workflow.nodes.map((node) => node.id);
    ignoreSelectionChangeUntilRef.current = Date.now() + 350;
    setSelectedNodeIds(ids);
    setSelectedNodeId(ids[0] ?? null);
    setStatus(`Selected ${ids.length} nodes`);
  }

  function clearNodeSelection() {
    setSelectedNodeIds([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setStatus("Selection cleared");
  }

  function createGroupFromSelected() {
    if (!workflow) {
      return;
    }
    const nodes = workflow.nodes.filter((node) => selectedNodeIds.includes(node.id) && node.type !== "group.box");
    if (nodes.length < 2) {
      setStatus("Select at least 2 nodes to group");
      return;
    }
    const positionLookup = new Map(workflow.nodes.map((node) => [node.id, node]));
    const absoluteLookup = new Map(
      nodes.map((node) => [node.id, resolveAbsolutePosition(node, positionLookup)] as const)
    );
    const minX = Math.min(...nodes.map((node) => (absoluteLookup.get(node.id)?.x ?? 0)));
    const minY = Math.min(...nodes.map((node) => (absoluteLookup.get(node.id)?.y ?? 0)));
    const maxX = Math.max(...nodes.map((node) => (absoluteLookup.get(node.id)?.x ?? 0) + flowNodeWidth));
    const maxY = Math.max(...nodes.map((node) => (absoluteLookup.get(node.id)?.y ?? 0) + flowNodeHeight));
    const groupId = crypto.randomUUID();
    const groupPosition = { x: minX - groupPaddingX, y: minY - groupPaddingTop };
    const groupWidth = maxX - minX + groupPaddingX * 2;
    const groupHeight = maxY - minY + groupPaddingTop + groupPaddingBottom;
    const groupedNodes = workflow.nodes.map((node) =>
      selectedNodeIds.includes(node.id) && node.type !== "group.box"
        ? {
            ...node,
            parentId: groupId,
            extent: "parent" as const,
            position: (() => {
              const absolute = absoluteLookup.get(node.id) ?? { x: node.position.x, y: node.position.y };
              const relativeX = absolute.x - groupPosition.x;
              const relativeY = absolute.y - groupPosition.y;
              const maxRelativeX = Math.max(groupPaddingX, groupWidth - flowNodeWidth - groupPaddingX);
              const maxRelativeY = Math.max(groupPaddingTop, groupHeight - flowNodeHeight - groupPaddingBottom);
              return {
                x: clamp(relativeX, groupPaddingX, maxRelativeX),
                y: clamp(relativeY, groupPaddingTop, maxRelativeY)
              };
            })()
          }
        : node
    );
    const groupNode: WorkflowNode = {
      id: groupId,
      type: "group.box",
      kind: "action",
      name: `Group ${workflow.nodes.filter((node) => node.type === "group.box").length + 1}`,
      position: groupPosition,
      config: { width: groupWidth, height: groupHeight }
    };
    updateWorkflow({
      ...workflow,
      nodes: [...groupedNodes, groupNode],
      updatedAt: new Date().toISOString()
    });
    setSelectedNodeId(groupId);
    setSelectedNodeIds([groupId]);
    setStatus(`Created group with ${nodes.length} nodes`);
  }

  function ungroupSelected() {
    if (!workflow) {
      return;
    }
    const groupIdsFromSelectedNodes = workflow.nodes
      .filter((node) => selectedNodeIds.includes(node.id) && node.parentId)
      .map((node) => node.parentId as string);
    const explicitGroupIds = workflow.nodes.filter((node) => selectedNodeIds.includes(node.id) && node.type === "group.box").map((node) => node.id);
    const groupIdSet = new Set([...groupIdsFromSelectedNodes, ...explicitGroupIds]);
    const groupNodes = workflow.nodes.filter((node) => groupIdSet.has(node.id) && node.type === "group.box");
    if (groupNodes.length === 0) {
      setStatus("Select a group node to ungroup");
      return;
    }
    const groupIds = new Set(groupNodes.map((node) => node.id));
    const allNodeLookup = new Map(workflow.nodes.map((node) => [node.id, node]));
    const groupLookup = new Map(groupNodes.map((node) => [node.id, node]));
    const updatedNodes = workflow.nodes
      .filter((node) => !groupIds.has(node.id))
      .map((node) => {
        if (!node.parentId || !groupIds.has(node.parentId)) {
          return node;
        }
        const group = groupLookup.get(node.parentId);
        const groupAbsolute = group ? resolveAbsolutePosition(group, allNodeLookup) : { x: 0, y: 0 };
        return {
          ...node,
          parentId: undefined,
          extent: null,
          position: { x: node.position.x + groupAbsolute.x, y: node.position.y + groupAbsolute.y }
        };
      });
    updateWorkflow({
      ...workflow,
      nodes: updatedNodes,
      edges: workflow.edges.filter((edge) => !groupIds.has(edge.source) && !groupIds.has(edge.target)),
      updatedAt: new Date().toISOString()
    });
    setSelectedNodeIds([]);
    setSelectedNodeId(null);
    setStatus(`Ungrouped ${groupNodes.length} group(s)`);
  }

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const active = pointerDragRef.current;
      if (!active) {
        return;
      }
      const moved = Math.abs(event.clientX - active.startX) > 4 || Math.abs(event.clientY - active.startY) > 4;
      active.moved = active.moved || moved;
      setDragPreview({ template: active.template, x: event.clientX, y: event.clientY });
    }

    function onPointerUp(event: PointerEvent) {
      const active = pointerDragRef.current;
      if (!active) {
        return;
      }
      pointerDragRef.current = null;
      setDragPreview(null);
      if (!active.moved) {
        return;
      }
      lastPaletteDragAt = Date.now();
      const bounds = canvasRef.current?.getBoundingClientRect();
      const overCanvas =
        overCanvasRef.current ||
        (bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom);
      if (overCanvas || bounds) {
        dropHandledAtRef.current = Date.now();
        addNodeAtScreenPoint(active.template, event.clientX, event.clientY);
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  });

  if (!state) {
    return (
      <div className="auth-shell">
        <section className="auth-card" aria-label={needsAdminBootstrap ? "Create admin account" : "Login"}>
          <div className="auth-brand">
            <div className="auth-mark">
              <ShieldCheck size={26} />
            </div>
            <div>
              <h1>{appName}</h1>
              <span>{needsAdminBootstrap ? "First-run setup" : "Secure workspace"}</span>
            </div>
          </div>

          <div className="auth-state">
            <span className={needsAdminBootstrap ? "setup" : "ready"}>
              {needsAdminBootstrap ? "Admin required" : "Admin exists"}
            </span>
            <strong>{needsAdminBootstrap ? "Create admin account" : "Sign in"}</strong>
            <p>{needsAdminBootstrap ? "No admin user found. Create owner account to unlock dashboard." : "Use account created by admin."}</p>
          </div>

          <div className="auth-form">
            <label className="auth-field">
              Username
              <span>
                <UserRound size={16} />
                <input value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} placeholder="admin" autoComplete="username" />
              </span>
            </label>
            <label className="auth-field">
              Password
              <span>
                <LockKeyhole size={16} />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="minimum 6 characters"
                  autoComplete={needsAdminBootstrap ? "new-password" : "current-password"}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void submitAuth();
                    }
                  }}
                />
              </span>
            </label>
            {authError ? <div className="auth-error">{authError}</div> : null}
            <button className="primary auth-submit" onClick={() => void submitAuth()} disabled={authBusy || !authStatus}>
              <KeyRound size={16} />
              {authBusy ? "Please wait" : needsAdminBootstrap ? "Create Admin" : "Login"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (view === "dashboard" || !workflow || !session) {
    return (
      <div className="dashboard-shell">
        <header className="dashboard-topbar">
          <div className="dashboard-brand">
            <div className="auth-mark">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1>{appName}</h1>
              <span>{state.user.username} ({state.user.role})</span>
            </div>
          </div>
          <div className="dashboard-actions">
            <button onClick={() => void refresh()} title="Refresh dashboard">
              <RefreshCw size={16} />
            </button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>

        <main className="dashboard-main">
          <section className="dashboard-hero">
            <div>
              <span>{state.user.role === "admin" ? "Admin control plane" : "Workspace"}</span>
              <h2>{state.user.role === "admin" ? "Operations dashboard" : "Your canvases"}</h2>
              <p>{state.user.role === "admin" ? "Manage users, canvases, runs, reusable agent assets, credentials, and policy settings." : "Open one secured canvas workspace. Each canvas has its own chat sessions."}</p>
            </div>
            <button className="primary" onClick={() => void createCanvas()}>
              <Plus size={16} />
              New Canvas
            </button>
          </section>

          <section className="dashboard-layout">
            <aside className="dashboard-sidebar">
              <div className="dashboard-health">
                <strong>{apiOnline && browserOnline ? "Online" : "Degraded"}</strong>
                <small>API {apiOnline ? "online" : "offline"} / Client {browserOnline ? "online" : "offline"}</small>
              </div>
              <nav className="dashboard-tabs" aria-label="Dashboard sections">
                {dashboardTabs
                  .filter((tab) => !tab.adminOnly || state.user.role === "admin")
                  .map((tab) => (
                    <button className={activeDashboardTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setDashboardTab(tab.id)}>
                      {tab.label}
                    </button>
                  ))}
              </nav>
            </aside>

            <section className="dashboard-content">
              {activeDashboardTab === "overview" && dashboardStats ? (
                <>
                  <div className="metric-grid">
                    {dashboardStats.metrics.map((metric) => (
                      <div className="metric-card" key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                        <small>{metric.hint}</small>
                      </div>
                    ))}
                  </div>
                  <div className="dashboard-grid two">
                    <DashboardList title="Recent Runs" subtitle={`${runs.length} total`} icon={<RefreshCw size={18} />}>
                      {runs.slice(0, 6).map((run) => (
                        <div className="data-row" key={run.id}>
                          <span>
                            <strong>{workflowNameById(state, run.workflowId)}</strong>
                            <small>{run.audit.at(-1)?.message ?? run.id}</small>
                          </span>
                          <button className="compact" onClick={() => void retryRun(run)}>
                            <RefreshCw size={14} />
                            Retry
                          </button>
                          <em className={run.status}>{run.status}</em>
                        </div>
                      ))}
                      {runs.length === 0 ? <div className="empty-state">No runs yet.</div> : null}
                    </DashboardList>
                    <DashboardList title="Pending Approvals" subtitle={`${dashboardStats.pendingApprovals} waiting`} icon={<ShieldAlert size={18} />}>
                      {state.approvals.filter((approval) => approval.status === "pending").slice(0, 6).map((approval) => (
                        <div className="data-row" key={approval.id}>
                          <span>
                            <strong>{approval.message}</strong>
                            <small>{String(approval.payload.workflowName ?? approval.payload.workflowId ?? "workflow")}</small>
                          </span>
                          <em className="pending">pending</em>
                        </div>
                      ))}
                      {dashboardStats.pendingApprovals === 0 ? <div className="empty-state">No pending approvals.</div> : null}
                    </DashboardList>
                  </div>
                </>
              ) : null}

              {activeDashboardTab === "canvases" ? (
                <DashboardList title={state.user.role === "admin" ? "All Canvases" : "My Canvases"} subtitle={`${state.workflows.length} available`} icon={<LayoutDashboard size={18} />}>
                  {state.workflows.map((canvas) => (
                    <div className="canvas-share-row" key={canvas.id}>
                      <button className="canvas-row" onClick={() => void openCanvas(canvas)}>
                        <span>
                          <strong>{canvas.name}</strong>
                          <small>
                            {canvas.nodes.length} nodes / {canvas.edges.length} edges / {sessionsForWorkflow(state, canvas.id).length} chats
                            {canvas.sharedWithUsernames?.length ? ` / shared: ${canvas.sharedWithUsernames.join(", ")}` : ""}
                          </small>
                        </span>
                        <em>{ownerName(state, canvas)}</em>
                      </button>
                      {canShareCanvas(state, canvas) ? (
                        <div className="share-form">
                          <input
                            placeholder="share with username"
                            value={shareInputs[canvas.id] ?? ""}
                            onChange={(event) => setShareInputs((current) => ({ ...current, [canvas.id]: event.target.value }))}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                void shareCanvas(canvas.id);
                              }
                            }}
                          />
                          <button onClick={() => void shareCanvas(canvas.id)} disabled={!shareInputs[canvas.id]?.trim()}>
                            Share
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {state.workflows.length === 0 ? <div className="empty-state">No canvas yet.</div> : null}
                </DashboardList>
              ) : null}

              {activeDashboardTab === "runs" ? (
                <DashboardList title="Runs" subtitle={`${runs.length} executions`} icon={<RefreshCw size={18} />}>
                  {runs.map((run) => (
                    <div className="data-row" key={run.id}>
                      <span>
                        <strong>{workflowNameById(state, run.workflowId)}</strong>
                        <small>{run.createdAt} / {run.error ?? run.audit.at(-1)?.message ?? run.id}</small>
                      </span>
                      <button className="compact" onClick={() => void retryRun(run)}>
                        <RefreshCw size={14} />
                        Retry
                      </button>
                      <em className={run.status}>{run.status}</em>
                    </div>
                  ))}
                  {runs.length === 0 ? <div className="empty-state">No runs yet.</div> : null}
                </DashboardList>
              ) : null}

              {activeDashboardTab === "agents" ? (
                <DashboardList title="Agents" subtitle={`${state.agents.length} profiles`} icon={<Bot size={18} />}>
                  {state.agents.map((agent) => (
                    <div className="data-row" key={agent.id}>
                      <span>
                        <strong>{agent.name}</strong>
                        <small>{agent.model.provider} / {agent.model.model} / {agent.intelligence} / {agent.toolNames.length} tools</small>
                      </span>
                      <em>{agent.memoryScope}</em>
                    </div>
                  ))}
                  {state.agents.length === 0 ? <div className="empty-state">No agent profiles yet.</div> : null}
                </DashboardList>
              ) : null}

              {activeDashboardTab === "skills" ? (
                <DashboardList title="AI Agent Assets" subtitle={`${dashboardSkills.length} assets`} icon={<PackageCheck size={18} />}>
                  {dashboardSkills.map((skill) => (
                    <div className="data-row" key={skill.id}>
                      <span>
                        <strong>{skill.name}</strong>
                        <small>{skill.source} / {skill.canvasName}</small>
                      </span>
                      <button className="compact" onClick={() => addSkillAssetToCanvas(skill)}>
                        <Plus size={14} />
                        Add
                      </button>
                      <button className="danger compact" onClick={() => void deleteSavedSkill(skill.id)}>
                        <Trash2 size={14} />
                      </button>
                      <em>{skill.type}</em>
                    </div>
                  ))}
                  {dashboardSkills.length === 0 ? <div className="empty-state">No saved skills, souls, or personalities yet.</div> : null}
                </DashboardList>
              ) : null}

              {activeDashboardTab === "credentials" ? (
                <div className="dashboard-grid two">
                  <DashboardList title="Credential Vault" subtitle={`${state.credentials.length} encrypted`} icon={<KeyRound size={18} />}>
                    <div className="credential-form">
                      <input placeholder="Name" value={credentialDraft.name} onChange={(event) => setCredentialDraft((current) => ({ ...current, name: event.target.value }))} />
                      <input placeholder="Service" value={credentialDraft.service} onChange={(event) => setCredentialDraft((current) => ({ ...current, service: event.target.value }))} />
                      <select value={credentialDraft.authType} onChange={(event) => setCredentialDraft((current) => ({ ...current, authType: event.target.value as CredentialView["authType"] }))}>
                        {["apiKey", "token", "oauth2", "basic", "sshKey", "custom"].map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <textarea placeholder={"token=\nclientSecret="} value={credentialDraft.dataText} onChange={(event) => setCredentialDraft((current) => ({ ...current, dataText: event.target.value }))} />
                      <input placeholder="share usernames, comma-separated" value={credentialDraft.sharedWithUsernames} onChange={(event) => setCredentialDraft((current) => ({ ...current, sharedWithUsernames: event.target.value }))} />
                      <button className="primary" onClick={() => void saveCredentialDraft()} disabled={!credentialDraft.name.trim() || !credentialDraft.service.trim() || !credentialDraft.dataText.trim()}>
                        <Save size={15} />
                        Save Credential
                      </button>
                    </div>
                    {state.credentials.map((credential) => (
                      <div className="data-row" key={credential.id}>
                        <span>
                          <strong>{credential.name}</strong>
                          <small>{credential.service} / {credential.authType} / fields: {credential.fields.join(", ") || "none"}</small>
                        </span>
                        <button className="danger compact" onClick={() => void deleteCredential(credential.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {state.credentials.length === 0 ? <div className="empty-state">No saved credentials yet.</div> : null}
                  </DashboardList>
                  <DashboardList title="Credential References" subtitle={`${dashboardCredentials.length} node refs`} icon={<KeyRound size={18} />}>
                    {dashboardCredentials.map((credential) => (
                      <div className="data-row" key={credential.id}>
                        <span>
                          <strong>{credential.name}</strong>
                          <small>{credential.canvasName} / {credential.nodeName}</small>
                        </span>
                        <em className={credential.status}>{credential.status}</em>
                      </div>
                    ))}
                    {dashboardCredentials.length === 0 ? <div className="empty-state">No credential references yet.</div> : null}
                  </DashboardList>
                </div>
              ) : null}

              {activeDashboardTab === "approvals" ? (
                <DashboardList title="Approvals" subtitle={`${state.approvals.length} records`} icon={<ShieldAlert size={18} />}>
                  {state.approvals.map((approval) => (
                    <div className="data-row" key={approval.id}>
                      <span>
                        <strong>{approval.message}</strong>
                        <small>{String(approval.payload.workflowName ?? approval.payload.workflowId ?? approval.id)}</small>
                      </span>
                      <em className={approval.status}>{approval.status}</em>
                    </div>
                  ))}
                  {state.approvals.length === 0 ? <div className="empty-state">No approvals yet.</div> : null}
                </DashboardList>
              ) : null}

              {activeDashboardTab === "settings" ? (
                <div className="dashboard-grid two">
                  <DashboardList title="Model Providers" subtitle={`${dashboardProviders.length} configured by sessions`} icon={<Bot size={18} />}>
                    {dashboardProviders.map((provider) => (
                      <div className="data-row" key={provider.id}>
                        <span>
                          <strong>{provider.name}</strong>
                          <small>{provider.models.join(", ")}</small>
                        </span>
                        <em>{provider.sessions} sessions</em>
                      </div>
                    ))}
                  </DashboardList>
                  <DashboardList title="Policy Defaults" subtitle="Current v1 controls" icon={<ShieldCheck size={18} />}>
                    <div className="data-row"><span><strong>Canvas isolation</strong><small>Chat sessions are bound to one canvas.</small></span><em>on</em></div>
                    <div className="data-row"><span><strong>Approvals</strong><small>Risky runs pause into chat/dashboard approval.</small></span><em>on</em></div>
                    <div className="data-row"><span><strong>Credential scope</strong><small>References visible; secret vault editor pending.</small></span><em>planned</em></div>
                  </DashboardList>
                </div>
              ) : null}

              {activeDashboardTab === "admin" && state.user.role === "admin" ? (
                <div className="dashboard-grid two">
                  <DashboardList title="Users" subtitle={`${state.users.length} accounts`} icon={<Users size={18} />}>
                    {state.users.map((user) => (
                      <div className="user-row" key={user.id}>
                        <span>{user.username}</span>
                        <em>{user.role}</em>
                      </div>
                    ))}
                  </DashboardList>
                  <DashboardList title="Create User" subtitle="Admin-controlled accounts only" icon={<UserRound size={18} />}>
                    <div className="admin-user-form">
                      <input placeholder="username" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} />
                      <input type="password" placeholder="password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} />
                      <select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as "admin" | "user")}>
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                      <button
                        className="primary"
                        onClick={async () => {
                          try {
                            await api.createUser(newUserName.trim(), newUserPassword, newUserRole);
                            setNewUserName("");
                            setNewUserPassword("");
                            await refresh();
                            setStatus("User created");
                          } catch (error) {
                            setStatus(error instanceof Error ? error.message : String(error));
                          }
                        }}
                        disabled={!newUserName.trim() || !newUserPassword}
                      >
                        Create User
                      </button>
                    </div>
                  </DashboardList>
                </div>
              ) : null}
            </section>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button onClick={() => setView("dashboard")} title="Dashboard">
            <LayoutDashboard size={16} />
          </button>
        </div>
        <div className="topbar-title">
          <h1>{appName}</h1>
        </div>
        <div className="topbar-actions">
          <small style={{ marginRight: 8, opacity: 0.8 }}>{state.user.username} ({state.user.role})</small>
          <button onClick={refresh} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button onClick={saveWorkflow} title="Save workflow">
            <Save size={16} />
            Save
          </button>
          <select
            title="Error workflow"
            value={workflow?.settings?.errorWorkflowId ?? ""}
            onChange={(event) => {
              if (!workflow) return;
              updateWorkflow({
                ...workflow,
                settings: {
                  ...(workflow.settings ?? {}),
                  errorWorkflowId: event.target.value || undefined
                },
                updatedAt: new Date().toISOString()
              });
            }}
          >
            <option value="">No error workflow</option>
            {state.workflows.filter((item) => item.id !== workflow?.id).map((item) => (
              <option value={item.id} key={item.id}>{item.name}</option>
            ))}
          </select>
          <label className="topbar-check" title="Hide run input/output data in saved executions">
            <input
              type="checkbox"
              checked={workflow?.settings?.redactExecutionData === true}
              onChange={(event) => {
                if (!workflow) return;
                updateWorkflow({
                  ...workflow,
                  settings: {
                    ...(workflow.settings ?? {}),
                    redactExecutionData: event.target.checked
                  },
                  updatedAt: new Date().toISOString()
                });
              }}
            />
            Redact
          </label>
        </div>
      </header>

      <main className="workspace">
        <section className="chat-panel">
          <div className="chat-session-bar">
            <label className="session-select">
              Chat Session
              <select value={session.id} onChange={(event) => setSelectedSessionId(event.target.value)}>
                {canvasSessions.map((item, index) => (
                  <option key={item.id} value={item.id}>
                    {displaySessionName(item.name, index)}
                  </option>
                ))}
              </select>
            </label>
            <button className="create-chat-button" onClick={createChat} title="Create chat">
              <Plus size={16} />
              Create Chat
            </button>
          </div>

          <div className="model-grid">
            <label>
              Provider
              <select
                value={session.model.provider}
                onChange={(event) => {
                  const provider = event.target.value as ModelProviderId;
                  updateSessionModel({
                    model: { provider, model: firstModel(provider) },
                    intelligence: provider === "ollama" ? "off" : session.intelligence
                  });
                }}
              >
                {Object.keys(providerModels).map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model
              <select
                value={session.model.model}
                onChange={(event) => updateSessionModel({ model: { ...session.model, model: event.target.value } })}
              >
                {providerModels[session.model.provider].map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="messages">
            {messages.map((message) => (
              <div className={`message ${message.role}`} key={message.id}>
                <span>{message.role}</span>
                <p>{message.content}</p>
                <ChatApprovalControls
                  approval={approvalFromMessage(message, state.approvals)}
                  onDecision={(approvalId, decision) => void decideChatApproval(approvalId, decision)}
                />
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="composer">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Ask agent to build, run, debug, or approve workflow..."
            />
            <div className="composer-actions">
              <label className="intelligence-inline">
                Intelligence
                <select
                  value={session.intelligence}
                  onChange={(event) => updateSessionModel({ intelligence: event.target.value as ChatSession["intelligence"] })}
                >
                  <option value="off">off</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>
              <button className="primary" onClick={sendMessage} disabled={sending || !draft.trim()}>
                <MessageSquare size={16} />
                {sending ? "Sending" : "Send"}
              </button>
            </div>
          </div>
        </section>

        <section className="canvas-panel">
          <div className="canvas-toolbar">
            <div className="panel-head">
              <SlidersHorizontal size={18} />
              <strong>Canvas</strong>
            </div>
            <div className="canvas-toolbar-actions">
              <div className={`topbar-canvas-state ${canvasOnline && apiOnline && browserOnline ? "online" : "offline"}`}>
                {canvasOnline && apiOnline && browserOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                <strong>Canvas {canvasOnline && apiOnline && browserOnline ? "Online" : "Offline"}</strong>
              </div>
              <button
                className={canvasOnline ? "danger" : "primary"}
                onClick={() => {
                  setCanvasOnline((current) => {
                    const next = !current;
                    setStatus(next ? "Canvas online" : "Canvas offline");
                    return next;
                  });
                }}
                title="Toggle canvas online state"
              >
                <Play size={16} />
                {canvasOnline ? "Set Offline" : "Set Online"}
              </button>
            </div>
          </div>

          <div className="canvas" ref={canvasRef} onDrop={onCanvasDrop} onDragOver={onCanvasDragOver}>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={{ ...flowNodeTypes, groupNode: GroupNode }}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={({ nodes, edges }) => {
                if (Date.now() < ignoreSelectionChangeUntilRef.current) {
                  return;
                }
                if (nodes.length === 0 && edges.length === 0) {
                  return;
                }
                updateSelection(nodes.map((node) => node.id));
                setSelectedEdgeId(edges.at(-1)?.id ?? null);
              }}
              onNodeClick={(_, node) => {
                setSelectedNodeId(node.id);
                setSelectedNodeIds([node.id]);
                setSelectedEdgeId(null);
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeIds([]);
                setSelectedNodeId(null);
              }}
              onNodeContextMenu={(event, node) => {
                event.preventDefault();
                setSelectedNodeId(node.id);
                setSelectedNodeIds((current) => (current.includes(node.id) ? current : [node.id]));
                setSelectedEdgeId(null);
                setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
              }}
              onPaneContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY });
              }}
              onPaneMouseMove={() => {
                if (contextMenu) {
                  setContextMenu(null);
                }
              }}
              onPaneClick={() => {
                clearNodeSelection();
                setContextMenu(null);
              }}
              onDrop={onCanvasDrop}
              onDragOver={onCanvasDragOver}
              onPaneMouseEnter={() => {
                overCanvasRef.current = true;
              }}
              onPaneMouseLeave={() => {
                overCanvasRef.current = false;
              }}
              nodesDraggable
              nodesConnectable
              elementsSelectable
              selectionOnDrag
              panOnDrag={[1]}
              panOnScroll
              nodeDragThreshold={1}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <MiniMap
                pannable
                zoomable
                nodeStrokeWidth={3}
                nodeColor={(node) => {
                  const workflowNode = node.data?.workflowNode as WorkflowNode | undefined;
                  if (workflowNode?.kind === "agent") return "#1f8b78";
                  if (workflowNode?.kind === "trigger") return "#84692d";
                  return "#3f4b59";
                }}
              />
              <Controls />
            </ReactFlow>
            {selectedNode ? (
              <div
                className={`canvas-inspector ${isTerminalNode(selectedNode) ? "terminal-inspector" : ""}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="canvas-inspector-head">
                  <div className="panel-head">
                    <Bot size={16} />
                    <strong>Inspector</strong>
                  </div>
                  <button title="Close inspector" onClick={() => clearNodeSelection()}>
                    <X size={14} />
                  </button>
                </div>
                {isTerminalNode(selectedNode) ? (
                  <NodeTerminal
                    node={selectedNode}
                    selectedCount={selectedNodeIds.length}
                    running={runningTerminalNodeId === selectedNode.id}
                    updateNode={updateNode}
                    updateNodeConfig={updateNodeConfig}
                    onRun={(command) => void runSelectedNodeTerminal(command)}
                    onDelete={() => deleteNodes([selectedNode.id])}
                  />
                ) : (
                  <NodeInspector
                    node={selectedNode}
                    selectedCount={selectedNodeIds.length}
                    run={selectedNodeRun}
                    updateNode={updateNode}
                    updateNodeConfig={updateNodeConfig}
                    onSaveSkillAsset={() => void saveSkillAssetFromNode(selectedNode)}
                    onDelete={() => deleteNodes([selectedNode.id])}
                  />
                )}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="node-side-panel">
          <section className="skill-assets-panel">
            <div className="panel-head">
              <PackageCheck size={18} />
              <strong>AI Agent Assets</strong>
            </div>
            <div className="asset-filter-row">
              <button className={assetTypeFilter === "all" ? "active" : ""} onClick={() => setAssetTypeFilter("all")}>All</button>
              <button className={assetTypeFilter === "soul" ? "active" : ""} onClick={() => setAssetTypeFilter("soul")}>Soul</button>
              <button className={assetTypeFilter === "skill" ? "active" : ""} onClick={() => setAssetTypeFilter("skill")}>Skills</button>
              <button className={assetTypeFilter === "personality" ? "active" : ""} onClick={() => setAssetTypeFilter("personality")}>Personality</button>
            </div>
            <div className="skill-assets-list">
              {filteredAgentAssets.length === 0 ? (
                <div className="skill-empty">No saved AI agent assets.</div>
              ) : (
                filteredAgentAssets.map((skill) => (
                  <button className="skill-asset-card" key={skill.id} onClick={() => addSkillAssetToCanvas(skill)} title={`Place ${skill.name}`}>
                    <span>
                      <strong>{skill.name}</strong>
                      <small>{skill.canvasName} / {skill.source}</small>
                    </span>
                    <em>{skill.type}</em>
                  </button>
                ))
              )}
            </div>
          </section>

          <div className="panel-head">
            <PackageCheck size={18} />
            <strong>Nodes</strong>
          </div>
          <label className="node-search">
            <Search size={15} />
            <input value={nodeSearch} onChange={(event) => setNodeSearch(event.target.value)} placeholder="Search nodes" />
          </label>
          <div className="node-library">
            <div className="node-quick-list">
              {compactNodeTemplates.map((template) => (
                <NodeCard key={template.type} template={template} addNode={addNode} onNodePointerDown={onNodePointerDown} />
              ))}
              {moreNodeTemplates.length > 0 ? (
                <button className="node-more-card" onClick={() => setShowAllNodes((value) => !value)} title="Show more nodes">
                  <Plus size={16} />
                  More
                  <em>{moreNodeTemplates.length} nodes</em>
                </button>
              ) : null}
            </div>
            {showAllNodes && moreNodeTemplates.length > 0 ? (
              <div className="node-more-panel">
                {moreNodeGroups.map((group) => {
                  if (group.templates.length === 0) {
                    return null;
                  }
                  return (
                    <section className="node-group" key={group.label}>
                      <h2>
                        {group.label}
                        <span>{group.templates.length}</span>
                      </h2>
                      <div className="node-cards">
                        {group.templates.map((template) => (
                          <NodeCard key={template.type} template={template} addNode={addNode} onNodePointerDown={onNodePointerDown} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="runs">
            <h2>Runs</h2>
            {runs.slice(0, 5).map((run) => (
              <div className="run" key={run.id}>
                <span className={run.status}>{run.status}</span>
                <small>{run.audit.at(-1)?.message ?? run.id}</small>
              </div>
            ))}
          </div>

        </aside>
      </main>
      {dragPreview ? (
        <div className="drag-preview" style={{ left: dragPreview.x + 12, top: dragPreview.y + 12 }}>
          {dragPreview.template.name}
        </div>
      ) : null}
      {contextMenu ? (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          selectedCount={selectedNodeIds.length}
          hasGroupSelection={Boolean(workflow?.nodes.some((node) => selectedNodeIds.includes(node.id) && node.type === "group.box"))}
          selectedEdgeId={selectedEdgeId}
          onClose={() => setContextMenu(null)}
          onDeleteNode={() => {
            if (contextMenu.nodeId) {
              deleteNodes([contextMenu.nodeId]);
            }
          }}
          onDuplicateNode={() => {
            if (contextMenu.nodeId) {
              duplicateNode(contextMenu.nodeId);
            }
          }}
          onDeleteSelected={() => deleteNodes(selectedNodeIds)}
          onDeleteSelectedEdge={() => {
            if (selectedEdgeId) {
              deleteEdge(selectedEdgeId);
            }
          }}
          onSelectAll={selectAllNodes}
          onCreateGroup={createGroupFromSelected}
          onUngroup={ungroupSelected}
          onClearSelection={clearNodeSelection}
        />
      ) : null}
      {groupDeleteRequest ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-dialog">
            <h3>Delete Grouped Node</h3>
            <p>This node belongs to a group. Delete only this node or the whole group?</p>
            <div className="confirm-actions">
              <button onClick={() => resolveGroupDelete("node")}>Delete Node Only</button>
              <button className="danger" onClick={() => resolveGroupDelete("group")}>Delete Whole Group</button>
              <button onClick={() => setGroupDeleteRequest(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DashboardList({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="dashboard-panel">
      <div className="dashboard-panel-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {icon}
      </div>
      <div className="dashboard-list">{children}</div>
    </div>
  );
}

function BaryonNode({ data }: NodeProps<Node<{ workflowNode: WorkflowNode; selected: boolean }>>) {
  const node = data.workflowNode;
  const Icon = iconForWorkflowNode(node);
  const hasOnlyEntryExitConnectors = node.kind !== "agent";
  return (
    <div className={`flow-node ${node.kind} ${hasOnlyEntryExitConnectors ? "round-node" : ""} ${data.selected ? "selected" : ""}`}>
      {node.kind === "agent" ? (
        <div className="agent-link-handles">
          <Handle id="soul" type="target" position={Position.Bottom} className="agent-link-handle soul-link" style={{ left: "18%" }} />
          <Handle id="skill" type="target" position={Position.Bottom} className="agent-link-handle skill-link" style={{ left: "50%" }} />
          <Handle id="personality" type="target" position={Position.Bottom} className="agent-link-handle personality-link" style={{ left: "82%" }} />
        </div>
      ) : null}
      <Handle id="workflow-input" type="target" position={Position.Left} className="workflow-input-handle" />
      <div className="flow-node-title">
        <span className="flow-node-icon" aria-hidden="true">
          <Icon size={14} />
        </span>
        <strong>{node.name}</strong>
      </div>
      {node.kind === "agent" ? (
        <div className="agent-profile-inline">
          <span>Soul</span>
          <span>Skills</span>
          <span>Personality</span>
        </div>
      ) : null}
      <Handle id="workflow-output" type="source" position={Position.Right} className="workflow-output-handle" />
    </div>
  );
}

function GroupNode({ data }: NodeProps<Node<{ workflowNode: WorkflowNode; selected: boolean; minWidth?: number; minHeight?: number }>>) {
  const node = data.workflowNode;
  return (
    <div className={`group-node ${data.selected ? "selected" : ""}`}>
      <NodeResizer
        isVisible={data.selected}
        minWidth={data.minWidth ?? 260}
        minHeight={data.minHeight ?? 140}
        color="#67a7ff"
        handleClassName="group-resize-handle"
        lineClassName="group-resize-line"
      />
      <div className="group-node-title">{node.name}</div>
    </div>
  );
}

function iconForWorkflowNode(node: WorkflowNode) {
  if (node.kind === "agent") return Bot;
  if (node.type === "agent.soul") return Braces;
  if (node.type === "agent.skill") return PackageCheck;
  if (node.type === "agent.personality") return MessageSquare;
  if (node.type.includes("condition")) return Filter;
  if (node.type.includes("split")) return Split;
  if (node.type.includes("merge")) return Combine;
  if (node.type.includes("template")) return Braces;
  if (node.type.includes("database")) return Database;
  if (node.type.includes("docker") || node.type.includes("test")) return PackageCheck;
  if (node.type.includes("ssh")) return Server;
  if (node.type.includes("shell")) return Terminal;
  if (node.type.includes("telegram") || node.type.includes("whatsapp") || node.type.includes("notify")) return MessageSquare;
  if (node.type.includes("email")) return Mail;
  if (node.type.includes("github")) return Github;
  if (node.type.includes("webhook")) return Network;
  return GitBranch;
}

function CanvasContextMenu({
  x,
  y,
  nodeId,
  selectedCount,
  hasGroupSelection,
  selectedEdgeId,
  onClose,
  onDeleteNode,
  onDuplicateNode,
  onDeleteSelected,
  onDeleteSelectedEdge,
  onSelectAll,
  onCreateGroup,
  onUngroup,
  onClearSelection
}: {
  x: number;
  y: number;
  nodeId?: string;
  selectedCount: number;
  hasGroupSelection: boolean;
  selectedEdgeId: null | string;
  onClose: () => void;
  onDeleteNode: () => void;
  onDuplicateNode: () => void;
  onDeleteSelected: () => void;
  onDeleteSelectedEdge: () => void;
  onSelectAll: () => void;
  onCreateGroup: () => void;
  onUngroup: () => void;
  onClearSelection: () => void;
}) {
  function run(action: () => void) {
    action();
    onClose();
  }

  return (
    <div className="canvas-context-menu" style={{ left: x, top: y }} onClick={(event) => event.stopPropagation()}>
      {nodeId ? (
        <>
          <button onClick={() => run(onDuplicateNode)}>
            <Copy size={14} />
            Duplicate Node
          </button>
          <button className="danger" onClick={() => run(onDeleteNode)}>
            <Trash2 size={14} />
            Delete Node
          </button>
          <span />
        </>
      ) : null}
      <button onClick={() => run(onSelectAll)}>Select All Nodes</button>
      <button disabled={selectedCount < 2} onClick={() => run(onCreateGroup)}>Create Group From Selected</button>
      <button disabled={!hasGroupSelection} onClick={() => run(onUngroup)}>Ungroup Selected Group</button>
      <button disabled={!selectedEdgeId} className="danger" onClick={() => run(onDeleteSelectedEdge)}>
        <Trash2 size={14} />
        Delete Selected Edge
      </button>
      <button disabled={selectedCount === 0} className="danger" onClick={() => run(onDeleteSelected)}>
        <Trash2 size={14} />
        Delete Selected{selectedCount > 1 ? ` (${selectedCount})` : ""}
      </button>
      <button disabled={selectedCount === 0} onClick={() => run(onClearSelection)}>
        <X size={14} />
        Clear Selection
      </button>
    </div>
  );
}

function NodeCard({
  template,
  addNode,
  onNodePointerDown
}: {
  template: NodeTemplate;
  addNode: (template: NodeTemplate) => void;
  onNodePointerDown?: (event: ReactPointerEvent<HTMLElement>, template: NodeTemplate) => void;
}) {
  const Icon = template.icon;
  return (
    <div
      className={`node-card ${template.kind}`}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (Date.now() - lastPaletteDragAt < 350) {
          return;
        }
        addNode(template);
      }}
      onPointerDown={(event) => onNodePointerDown?.(event, template)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          addNode(template);
        }
      }}
      title={`Drag ${template.name} onto canvas`}
    >
      <span className="node-card-icon" aria-hidden="true">
        <Icon size={14} />
      </span>
      <span className="node-card-copy">
        <strong>{template.name}</strong>
        <small>{template.description}</small>
      </span>
      <em>{template.kind}</em>
    </div>
  );
}

let lastPaletteDragAt = 0;

function ChatApprovalControls({
  approval,
  onDecision
}: {
  approval: ApprovalRecord | null;
  onDecision: (approvalId: string, decision: "approved" | "rejected") => void;
}) {
  if (!approval) {
    return null;
  }

  const pending = approval.status === "pending";
  return (
    <div className="chat-approval">
      <div>
        <strong>{approval.status}</strong>
        <small>{approval.message}</small>
      </div>
      <div className="chat-approval-actions">
        <button className="primary" disabled={!pending} onClick={() => onDecision(approval.id, "approved")}>
          <Check size={14} />
          Approve
        </button>
        <button className="danger" disabled={!pending} onClick={() => onDecision(approval.id, "rejected")}>
          <X size={14} />
          Deny
        </button>
      </div>
    </div>
  );
}

function approvalFromMessage(message: StoredMessage, approvals: ApprovalRecord[]): ApprovalRecord | null {
  const raw = message.metadata.approval;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const maybeApproval = raw as Partial<ApprovalRecord>;
  if (typeof maybeApproval.id !== "string") {
    return null;
  }
  const current = approvals.find((approval) => approval.id === maybeApproval.id);
  return current ?? (maybeApproval as ApprovalRecord);
}

function NodeTerminal({
  node,
  selectedCount,
  running,
  updateNode,
  updateNodeConfig,
  onRun,
  onDelete
}: {
  node: WorkflowNode;
  selectedCount: number;
  running: boolean;
  updateNode: (patch: { name?: string; config?: Record<string, unknown> }) => void;
  updateNodeConfig: (patch: Record<string, unknown>) => void;
  onRun: (command: string) => void;
  onDelete: () => void;
}) {
  const command = String(node.config.terminalCommand ?? defaultTerminalCommandForNode(node));
  const history = terminalHistoryFromNode(node);

  return (
    <div className="node-terminal">
      <div className="inspector-card terminal-node-card">
        <label>
          Terminal node
          <input value={node.name} onChange={(event) => updateNode({ name: event.target.value })} />
        </label>
        <div className="inspector-meta">
          <span>{node.type}</span>
          <span>isolated cwd</span>
          {selectedCount > 1 ? <span>{selectedCount} selected</span> : null}
        </div>
        <small className="terminal-note">Each node runs in its own workspace under data/node-terminals.</small>
      </div>

      <div className="terminal-screen" aria-label={`${node.name} isolated terminal`}>
        <div className="terminal-bar">
          <span>{terminalPromptForNode(node)}</span>
          <button title="Clear terminal history" onClick={() => updateNodeConfig({ terminalHistory: [] })}>
            <Trash2 size={14} />
          </button>
        </div>
        <textarea
          className="terminal-command"
          value={command}
          onChange={(event) => updateNodeConfig(terminalCommandPatch(node, event.target.value))}
          spellCheck={false}
        />
        <div className="terminal-actions">
          <button className="primary" disabled={running || !command.trim()} onClick={() => onRun(command)}>
            <Terminal size={15} />
            {running ? "Running" : "Run"}
          </button>
          <button className="danger" onClick={onDelete} title="Delete terminal node">
            <Trash2 size={15} />
            Delete Node
          </button>
        </div>
        <div className="terminal-history">
          {history.length === 0 ? (
            <pre>No runs yet.</pre>
          ) : (
            history.map((run) => (
              <article className="terminal-run" key={run.id}>
                <div>
                  <strong>{run.timedOut ? "timed out" : `exit ${run.exitCode ?? "?"}`}</strong>
                  <small>{new Date(run.finishedAt).toLocaleString()}</small>
                </div>
                <pre>{`$ ${run.command}\n${run.stdout}${run.stderr ? `\n[stderr]\n${run.stderr}` : ""}`}</pre>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function NodeInspector({
  node,
  selectedCount,
  run,
  updateNode,
  updateNodeConfig,
  onSaveSkillAsset,
  onDelete
}: {
  node: WorkflowNode;
  selectedCount: number;
  run?: WorkflowRunRecord;
  updateNode: (patch: { name?: string; config?: Record<string, unknown> }) => void;
  updateNodeConfig: (patch: Record<string, unknown>) => void;
  onSaveSkillAsset?: () => void;
  onDelete: () => void;
}) {
  const model = (node.config.model as { provider?: ModelProviderId; model?: string } | undefined) ?? { provider: "ollama", model: "llama3.1" };
  const provider = model.provider ?? "ollama";
  const modelName = model.model ?? firstModel(provider);
  const canControlIntelligence = supportsIntelligenceControl(provider, modelName);
  const runOutput = run?.nodeOutputs?.[node.id] ?? [];

  if (node.kind !== "agent") {
    return (
      <div className="inspector-form">
        <NodeBaseFields node={node} selectedCount={selectedCount} updateNode={updateNode} onDelete={onDelete} />
        <CredentialRequirements nodeType={node.type} />
        <NodeConfigFields node={node} updateNodeConfig={updateNodeConfig} />
        <NodeRunInspector nodeId={node.id} run={run} items={runOutput} />
        {isSkillAssetNode(node) ? (
          <button className="primary" onClick={onSaveSkillAsset}>
            <Save size={15} />
            Save Skill Asset
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="inspector-form">
      <NodeBaseFields node={node} selectedCount={selectedCount} updateNode={updateNode} onDelete={onDelete} />
      <label>
        Agent name
        <input value={String(node.config.name ?? node.name)} onChange={(event) => updateNodeConfig({ name: event.target.value })} />
      </label>
      <label>
        Provider
        <select
          value={provider}
          onChange={(event) => {
            const nextProvider = event.target.value as ModelProviderId;
            updateNodeConfig({
              model: { provider: nextProvider, model: firstModel(nextProvider) },
              intelligence: nextProvider === "ollama" ? "off" : node.config.intelligence ?? "medium"
            });
          }}
        >
          {Object.keys(providerModels).map((item) => (
            <option value={item} key={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label>
        Model
        <select value={modelName} onChange={(event) => updateNodeConfig({ model: { ...model, model: event.target.value } })}>
          {providerModels[provider].map((item) => (
            <option value={item} key={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      {canControlIntelligence ? (
        <label>
          Intelligence
          <select value={String(node.config.intelligence ?? "off")} onChange={(event) => updateNodeConfig({ intelligence: event.target.value })}>
            <option value="off">off</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
      ) : null}
      <label>
        Tools
        <input
          value={Array.isArray(node.config.tools) ? node.config.tools.join(", ") : ""}
          onChange={(event) => updateNodeConfig({ tools: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}
        />
      </label>
      <div className="persist-note">
        <Check size={15} />
        Saved node config controls workflow runs, independent from chat session model.
      </div>
      <NodeRunInspector nodeId={node.id} run={run} items={runOutput} />
    </div>
  );
}

function NodeRunInspector({ nodeId, run, items }: { nodeId: string; run?: WorkflowRunRecord; items: Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }> }) {
  if (!run) {
    return (
      <div className="persist-note">
        <Search size={15} />
        No run output for this node yet.
      </div>
    );
  }
  const schema = inferItemsSchema(items);
  return (
    <div className="inspector-card run-inspector">
      <strong>Last run output</strong>
      <small>{run.status} / {new Date(run.createdAt).toLocaleString()} / {items.length} items</small>
      <details open>
        <summary>Schema</summary>
        <pre>{schema.length ? schema.join("\n") : "empty"}</pre>
      </details>
      <details>
        <summary>JSON</summary>
        <pre>{JSON.stringify(items.slice(0, 10), null, 2)}</pre>
      </details>
      <details>
        <summary>Logs</summary>
        <pre>{run.audit.filter((event) => event.data?.nodeId === nodeId || event.type.startsWith("workflow.run")).map((event) => `${event.createdAt} ${event.type}: ${event.message}`).join("\n")}</pre>
      </details>
    </div>
  );
}

function NodeBaseFields({
  node,
  selectedCount,
  updateNode,
  onDelete
}: {
  node: WorkflowNode;
  selectedCount: number;
  updateNode: (patch: { name?: string; config?: Record<string, unknown> }) => void;
  onDelete: () => void;
}) {
  return (
    <div className="inspector-card">
      <label>
        Node name
        <input value={node.name} onChange={(event) => updateNode({ name: event.target.value })} />
      </label>
      <div className="inspector-meta">
        <span>{node.type}</span>
        <span>{node.kind}</span>
        {selectedCount > 1 ? <span>{selectedCount} selected</span> : null}
      </div>
      <button className="danger" onClick={onDelete} title="Delete selected node">
        <Trash2 size={15} />
        Delete Node
      </button>
    </div>
  );
}

function NodeConfigFields({
  node,
  updateNodeConfig
}: {
  node: WorkflowNode;
  updateNodeConfig: (patch: Record<string, unknown>) => void;
}) {
  switch (node.type) {
    case "schedule.trigger":
      return (
        <div className="inspector-card">
          <TextInput label="Schedule" value={node.config.cron ?? "0 * * * *"} onChange={(cron) => updateNodeConfig({ cron })} />
          <TextInput label="Timezone" value={node.config.timezone ?? "local"} onChange={(timezone) => updateNodeConfig({ timezone })} />
        </div>
      );
    case "form.trigger":
      return (
        <div className="inspector-card">
          <TextInput label="Form path" value={node.config.path ?? "forms/intake"} onChange={(path) => updateNodeConfig({ path })} />
          <KeyValueInput label="Fields" value={node.config.fieldsText ?? "name=text\nemail=email\nmessage=textarea"} onChange={(fieldsText) => updateNodeConfig({ fieldsText, fields: keyValueTextToObject(fieldsText) })} />
          <SelectInput label="Authentication" value={node.config.authType ?? "none"} options={["none", "basic", "token"]} onChange={(authType) => updateNodeConfig({ authType })} />
        </div>
      );
    case "error.trigger":
      return (
        <div className="inspector-card">
          <TextInput label="Workflow scope" value={node.config.scope ?? "all"} onChange={(scope) => updateNodeConfig({ scope })} />
          <SelectInput label="Include stack trace" value={node.config.includeStack === false ? "false" : "true"} options={["true", "false"]} onChange={(includeStack) => updateNodeConfig({ includeStack: includeStack === "true" })} />
        </div>
      );
    case "webhook.trigger":
    case "github.trigger":
    case "jira.trigger":
    case "slack.trigger":
    case "email.trigger":
    case "telegram.trigger":
    case "whatsapp.trigger":
      return (
        <div className="inspector-card">
          <TextInput label="Webhook path" value={node.config.path ?? node.type} onChange={(path) => updateNodeConfig({ path })} />
          <SelectInput label="Method" value={node.config.method ?? "POST"} options={["POST", "GET"]} onChange={(method) => updateNodeConfig({ method })} />
          <SelectInput label="Authentication" value={node.config.authType ?? "none"} options={["none", "headerSecret", "querySecret"]} onChange={(authType) => updateNodeConfig({ authType })} />
          <SecretInput label="Secret / verify token" value={node.config.secret ?? ""} onChange={(secret) => updateNodeConfig({ secret })} />
        </div>
      );
    case "agent.soul":
      return (
        <div className="inspector-card">
          <TextAreaInput label="Soul prompt" value={node.config.soul ?? "You are a focused automation agent."} onChange={(soul) => updateNodeConfig({ soul })} />
        </div>
      );
    case "agent.skill":
      return (
        <div className="inspector-card">
          <TextInput label="Skill name" value={node.config.name ?? node.name} onChange={(name) => updateNodeConfig({ name })} />
          <TextAreaInput label="Instructions" value={node.config.instructions ?? ""} onChange={(instructions) => updateNodeConfig({ instructions })} />
          <SelectInput label="Tool mode" value={node.config.toolMode === false ? "false" : "true"} options={["true", "false"]} onChange={(toolMode) => updateNodeConfig({ toolMode: toolMode === "true" })} />
          <TextInput
            label="Tool names"
            value={Array.isArray(node.config.toolNames) ? node.config.toolNames.join(", ") : ""}
            onChange={(value) => updateNodeConfig({ toolNames: value.split(",").map((item) => item.trim()).filter(Boolean) })}
          />
        </div>
      );
    case "agent.personality":
      return (
        <div className="inspector-card">
          <TextAreaInput label="Personality" value={node.config.personality ?? "Direct, careful, and concise."} onChange={(personality) => updateNodeConfig({ personality })} />
        </div>
      );
    case "http.request":
      return (
        <div className="inspector-card">
          <SelectInput label="Method" value={node.config.method ?? "GET"} options={["GET", "POST", "PUT", "PATCH", "DELETE"]} onChange={(method) => updateNodeConfig({ method })} />
          <TextInput label="URL" value={node.config.url ?? ""} onChange={(url) => updateNodeConfig({ url })} />
          <SelectInput label="Authentication" value={node.config.authType ?? "none"} options={["none", "bearer", "basic", "apiKey"]} onChange={(authType) => updateNodeConfig({ authType })} />
          <SecretInput label="Token / API key" value={node.config.token ?? ""} onChange={(token) => updateNodeConfig({ token })} />
          <TextInput label="Username" value={node.config.username ?? ""} onChange={(username) => updateNodeConfig({ username })} />
          <SecretInput label="Password" value={node.config.password ?? ""} onChange={(password) => updateNodeConfig({ password })} />
          <KeyValueInput label="Headers" value={node.config.headersText ?? ""} onChange={(headersText) => updateNodeConfig({ headersText, headers: keyValueTextToObject(headersText) })} />
          <KeyValueInput label="Query parameters" value={node.config.queryText ?? ""} onChange={(queryText) => updateNodeConfig({ queryText, query: keyValueTextToObject(queryText) })} />
          <SelectInput label="Body type" value={node.config.bodyType ?? "none"} options={["none", "json", "form", "raw"]} onChange={(bodyType) => updateNodeConfig({ bodyType })} />
          <TextAreaInput label="Body" value={node.config.bodyText ?? ""} onChange={(bodyText) => updateNodeConfig({ bodyText })} />
          <NumberInput label="Timeout seconds" value={node.config.timeoutSeconds ?? 30} onChange={(timeoutSeconds) => updateNodeConfig({ timeoutSeconds })} />
        </div>
      );
    case "webhook.response":
      return (
        <div className="inspector-card">
          <NumberInput label="Status" value={node.config.status ?? 200} onChange={(status) => updateNodeConfig({ status })} />
          <SelectInput label="Content type" value={node.config.contentType ?? "application/json"} options={["application/json", "text/plain"]} onChange={(contentType) => updateNodeConfig({ contentType })} />
          <TextAreaInput label="Body" value={node.config.bodyText ?? "{\"ok\":true}"} onChange={(bodyText) => updateNodeConfig({ bodyText })} />
        </div>
      );
    case "condition.filter":
      return (
        <div className="inspector-card">
          <TextInput label="Field path" value={node.config.field ?? "status"} onChange={(field) => updateNodeConfig({ field })} />
          <SelectInput
            label="Operator"
            value={node.config.operator ?? "exists"}
            options={["exists", "notExists", "equals", "notEquals", "contains", "greaterThan", "lessThan"]}
            onChange={(operator) => updateNodeConfig({ operator })}
          />
          <TextInput label="Value" value={node.config.value ?? ""} onChange={(value) => updateNodeConfig({ value })} />
        </div>
      );
    case "switch.route":
      return (
        <div className="inspector-card">
          <TextInput label="Field path" value={node.config.field ?? "status"} onChange={(field) => updateNodeConfig({ field })} />
          <KeyValueInput label="Rules" value={node.config.rulesText ?? "open=branch_1\nclosed=branch_2"} onChange={(rulesText) => updateNodeConfig({ rulesText, rules: keyValueTextToObject(rulesText) })} />
          <SelectInput label="Fallback" value={node.config.fallback ?? "none"} options={["none", "defaultOutput"]} onChange={(fallback) => updateNodeConfig({ fallback })} />
        </div>
      );
    case "item.limit":
      return (
        <div className="inspector-card">
          <NumberInput label="Limit" value={node.config.limit ?? 10} onChange={(limit) => updateNodeConfig({ limit })} />
        </div>
      );
    case "item.split":
      return (
        <div className="inspector-card">
          <TextInput label="Array field" value={node.config.field ?? "items"} onChange={(field) => updateNodeConfig({ field })} />
        </div>
      );
    case "item.merge":
      return (
        <div className="inspector-card">
          <TextInput label="Output field" value={node.config.outputField ?? "items"} onChange={(outputField) => updateNodeConfig({ outputField })} />
        </div>
      );
    case "item.sort":
      return (
        <div className="inspector-card">
          <TextInput label="Sort field" value={node.config.field ?? "createdAt"} onChange={(field) => updateNodeConfig({ field })} />
          <SelectInput label="Direction" value={node.config.direction ?? "asc"} options={["asc", "desc"]} onChange={(direction) => updateNodeConfig({ direction })} />
        </div>
      );
    case "item.aggregate":
      return (
        <div className="inspector-card">
          <TextInput label="Group by field" value={node.config.groupBy ?? "type"} onChange={(groupBy) => updateNodeConfig({ groupBy })} />
          <SelectInput label="Operation" value={node.config.operation ?? "count"} options={["count", "sum", "avg", "min", "max", "collect"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Value field" value={node.config.valueField ?? ""} onChange={(valueField) => updateNodeConfig({ valueField })} />
        </div>
      );
    case "item.dedupe":
      return (
        <div className="inspector-card">
          <TextInput label="Key field" value={node.config.keyField ?? "id"} onChange={(keyField) => updateNodeConfig({ keyField })} />
          <SelectInput label="Keep" value={node.config.keep ?? "first"} options={["first", "last"]} onChange={(keep) => updateNodeConfig({ keep })} />
        </div>
      );
    case "compare.datasets":
      return (
        <div className="inspector-card">
          <TextInput label="Match field" value={node.config.matchField ?? "id"} onChange={(matchField) => updateNodeConfig({ matchField })} />
          <SelectInput label="Output" value={node.config.output ?? "differences"} options={["differences", "matches", "leftOnly", "rightOnly"]} onChange={(output) => updateNodeConfig({ output })} />
        </div>
      );
    case "edit.fields":
      return (
        <div className="inspector-card">
          <SelectInput label="Mode" value={node.config.mode ?? "set"} options={["set", "keepOnly", "rename", "remove"]} onChange={(mode) => updateNodeConfig({ mode })} />
          <KeyValueInput label="Fields" value={node.config.fieldsText ?? ""} onChange={(fieldsText) => updateNodeConfig({ fieldsText, fields: keyValueTextToObject(fieldsText) })} />
        </div>
      );
    case "json.transform":
      return (
        <div className="inspector-card">
          <KeyValueInput label="Set fields" value={node.config.assignText ?? ""} onChange={(assignText) => updateNodeConfig({ assignText, assign: keyValueTextToObject(assignText) })} />
        </div>
      );
    case "csv.parse":
      return (
        <div className="inspector-card">
          <TextInput label="Source field" value={node.config.sourceField ?? "csv"} onChange={(sourceField) => updateNodeConfig({ sourceField })} />
          <SelectInput label="Delimiter" value={node.config.delimiter ?? ","} options={[",", ";", "|", "\t"]} onChange={(delimiter) => updateNodeConfig({ delimiter })} />
          <SelectInput label="Has header" value={node.config.hasHeader === false ? "false" : "true"} options={["true", "false"]} onChange={(hasHeader) => updateNodeConfig({ hasHeader: hasHeader === "true" })} />
        </div>
      );
    case "xml.parse":
      return (
        <div className="inspector-card">
          <SelectInput label="Operation" value={node.config.operation ?? "parse"} options={["parse", "build"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Source / output field" value={node.config.field ?? "xml"} onChange={(field) => updateNodeConfig({ field })} />
        </div>
      );
    case "html.extract":
      return (
        <div className="inspector-card">
          <TextInput label="HTML field" value={node.config.htmlField ?? "html"} onChange={(htmlField) => updateNodeConfig({ htmlField })} />
          <TextInput label="CSS selector" value={node.config.selector ?? "title"} onChange={(selector) => updateNodeConfig({ selector })} />
          <SelectInput label="Return" value={node.config.returnValue ?? "text"} options={["text", "html", "attribute"]} onChange={(returnValue) => updateNodeConfig({ returnValue })} />
          <TextInput label="Attribute" value={node.config.attribute ?? "href"} onChange={(attribute) => updateNodeConfig({ attribute })} />
        </div>
      );
    case "rss.read":
      return (
        <div className="inspector-card">
          <TextInput label="Feed URL" value={node.config.url ?? ""} onChange={(url) => updateNodeConfig({ url, target: url })} />
          <NumberInput label="Limit" value={node.config.limit ?? 20} onChange={(limit) => updateNodeConfig({ limit })} />
        </div>
      );
    case "date.time":
      return (
        <div className="inspector-card">
          <SelectInput label="Operation" value={node.config.operation ?? "format"} options={["format", "parse", "add", "subtract"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Field" value={node.config.field ?? "date"} onChange={(field) => updateNodeConfig({ field })} />
          <TextInput label="Format / offset" value={node.config.value ?? "YYYY-MM-DD"} onChange={(value) => updateNodeConfig({ value })} />
        </div>
      );
    case "crypto.hash":
      return (
        <div className="inspector-card">
          <SelectInput label="Operation" value={node.config.operation ?? "hash"} options={["hash", "hmac", "encrypt", "decrypt"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <SelectInput label="Algorithm" value={node.config.algorithm ?? "sha256"} options={["sha256", "sha512", "md5", "aes-256-gcm"]} onChange={(algorithm) => updateNodeConfig({ algorithm })} />
          <TextInput label="Source field" value={node.config.field ?? "value"} onChange={(field) => updateNodeConfig({ field })} />
          <SecretInput label="Secret/key" value={node.config.secret ?? ""} onChange={(secret) => updateNodeConfig({ secret })} />
        </div>
      );
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
      return (
        <div className="inspector-card">
          <SelectInput
            label="Mode"
            value={node.config.mode ?? "runOnceForAllItems"}
            options={["runOnceForAllItems", "runOnceForEachItem"]}
            onChange={(mode) => updateNodeConfig({ mode })}
          />
          <TextInput label="Runtime / image" value={node.config.runtime ?? runtimeForCodeNode(node.type)} onChange={(runtime) => updateNodeConfig({ runtime })} />
          <TextAreaInput label="Code" value={node.config.code ?? defaultCodeForNode(node.type)} onChange={(code) => updateNodeConfig({ code, target: code })} />
          <KeyValueInput label="Environment variables" value={node.config.envText ?? ""} onChange={(envText) => updateNodeConfig({ envText, env: keyValueTextToObject(envText) })} />
          <TextInput label="Dependencies" value={node.config.dependenciesText ?? ""} onChange={(dependenciesText) => updateNodeConfig({ dependenciesText })} />
          <NumberInput label="Timeout seconds" value={node.config.timeoutSeconds ?? 60} onChange={(timeoutSeconds) => updateNodeConfig({ timeoutSeconds })} />
          <SelectInput label="Approval required" value={node.config.requiresApproval === false ? "false" : "true"} options={["true", "false"]} onChange={(requiresApproval) => updateNodeConfig({ requiresApproval: requiresApproval === "true" })} />
        </div>
      );
    case "cache.store":
      return (
        <div className="inspector-card">
          <TextInput label="Key" value={node.config.key ?? ""} onChange={(key) => updateNodeConfig({ key, target: key })} />
          <TextAreaInput label="Value template" value={node.config.value ?? "{{json}}"} onChange={(value) => updateNodeConfig({ value })} />
          <NumberInput label="TTL seconds" value={node.config.ttlSeconds ?? 3600} onChange={(ttlSeconds) => updateNodeConfig({ ttlSeconds })} />
        </div>
      );
    case "queue.publish":
      return (
        <div className="inspector-card">
          <TextInput label="Queue / topic" value={node.config.topic ?? ""} onChange={(topic) => updateNodeConfig({ topic, target: topic })} />
          <TextAreaInput label="Payload template" value={node.config.payload ?? "{{json}}"} onChange={(payload) => updateNodeConfig({ payload })} />
          <SelectInput label="Delivery mode" value={node.config.deliveryMode ?? "persistent"} options={["persistent", "transient"]} onChange={(deliveryMode) => updateNodeConfig({ deliveryMode })} />
        </div>
      );
    case "text.template":
      return (
        <div className="inspector-card">
          <TextInput label="Output field" value={node.config.field ?? "message"} onChange={(field) => updateNodeConfig({ field })} />
          <TextAreaInput label="Template" value={node.config.template ?? "Result: {{json}}"} onChange={(template) => updateNodeConfig({ template })} />
        </div>
      );
    case "approval.request":
      return (
        <div className="inspector-card">
          <TextAreaInput label="Approval message" value={node.config.message ?? "Approve action?"} onChange={(message) => updateNodeConfig({ message })} />
          <SelectInput label="Auto approve" value={node.config.autoApprove === true ? "true" : "false"} options={["false", "true"]} onChange={(autoApprove) => updateNodeConfig({ autoApprove: autoApprove === "true" })} />
        </div>
      );
    case "stop.error":
      return (
        <div className="inspector-card">
          <TextAreaInput label="Error message" value={node.config.message ?? "Workflow stopped by Stop And Error node"} onChange={(message) => updateNodeConfig({ message })} />
          <TextInput label="Error code" value={node.config.code ?? "STOP_AND_ERROR"} onChange={(code) => updateNodeConfig({ code })} />
        </div>
      );
    case "wait.delay":
      return (
        <div className="inspector-card">
          <SelectInput label="Resume mode" value={node.config.resumeMode ?? "delay"} options={["delay", "dateTime", "webhook"]} onChange={(resumeMode) => updateNodeConfig({ resumeMode })} />
          <NumberInput label="Delay seconds" value={node.config.delaySeconds ?? 60} onChange={(delaySeconds) => updateNodeConfig({ delaySeconds })} />
          <TextInput label="Resume at" value={node.config.resumeAt ?? ""} onChange={(resumeAt) => updateNodeConfig({ resumeAt })} />
        </div>
      );
    case "workflow.execute":
      return (
        <div className="inspector-card">
          <TextInput label="Workflow ID / name" value={node.config.workflowRef ?? ""} onChange={(workflowRef) => updateNodeConfig({ workflowRef, target: workflowRef })} />
          <SelectInput label="Input mode" value={node.config.inputMode ?? "allItems"} options={["allItems", "firstItem", "json"]} onChange={(inputMode) => updateNodeConfig({ inputMode })} />
          <TextAreaInput label="Input JSON" value={node.config.inputJson ?? "{}"} onChange={(inputJson) => updateNodeConfig({ inputJson })} />
        </div>
      );
    case "notify.send":
      return (
        <div className="inspector-card">
          <SelectInput label="Channel" value={node.config.channel ?? "chat"} options={["chat", "telegram", "whatsapp", "email"]} onChange={(channel) => updateNodeConfig({ channel })} />
          <TextAreaInput label="Message" value={node.config.message ?? "{{json}}"} onChange={(message) => updateNodeConfig({ message })} />
        </div>
      );
    case "telegram.send":
      return (
        <div className="inspector-card">
          <TextInput label="Bot credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <TextInput label="Chat ID" value={node.config.chatId ?? ""} onChange={(chatId) => updateNodeConfig({ chatId })} />
          <TextAreaInput label="Message" value={node.config.message ?? "{{message}}"} onChange={(message) => updateNodeConfig({ message })} />
          <SelectInput label="Parse mode" value={node.config.parseMode ?? "none"} options={["none", "MarkdownV2", "HTML"]} onChange={(parseMode) => updateNodeConfig({ parseMode })} />
        </div>
      );
    case "whatsapp.send":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <TextInput label="Phone number ID" value={node.config.phoneNumberId ?? ""} onChange={(phoneNumberId) => updateNodeConfig({ phoneNumberId })} />
          <TextInput label="WABA ID" value={node.config.wabaId ?? ""} onChange={(wabaId) => updateNodeConfig({ wabaId })} />
          <TextInput label="Recipient phone" value={node.config.to ?? ""} onChange={(to) => updateNodeConfig({ to })} />
          <SelectInput label="Message type" value={node.config.messageType ?? "text"} options={["text", "template"]} onChange={(messageType) => updateNodeConfig({ messageType })} />
          <TextAreaInput label="Message" value={node.config.message ?? "{{message}}"} onChange={(message) => updateNodeConfig({ message })} />
          <TextInput label="Template name" value={node.config.templateName ?? ""} onChange={(templateName) => updateNodeConfig({ templateName })} />
          <TextInput label="Language code" value={node.config.languageCode ?? "en_US"} onChange={(languageCode) => updateNodeConfig({ languageCode })} />
        </div>
      );
    case "discord.send":
    case "slack.send":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID / webhook URL" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <SelectInput label="Operation" value={node.config.operation ?? "send"} options={["send", "update", "delete", "search"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Channel ID / name" value={node.config.channel ?? ""} onChange={(channel) => updateNodeConfig({ channel, target: channel })} />
          <TextAreaInput label="Message" value={node.config.message ?? "{{message}}"} onChange={(message) => updateNodeConfig({ message, payload: message })} />
          <TextInput label="Thread / timestamp" value={node.config.threadId ?? ""} onChange={(threadId) => updateNodeConfig({ threadId })} />
          <TextInput label="File / attachment field" value={node.config.attachmentField ?? ""} onChange={(attachmentField) => updateNodeConfig({ attachmentField })} />
        </div>
      );
    case "email.send":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <TextInput label="SMTP server" value={node.config.smtpHost ?? ""} onChange={(smtpHost) => updateNodeConfig({ smtpHost, target: smtpHost })} />
          <NumberInput label="Port" value={node.config.smtpPort ?? 587} onChange={(smtpPort) => updateNodeConfig({ smtpPort })} />
          <SelectInput label="Encryption" value={node.config.encryption ?? "STARTTLS"} options={["STARTTLS", "SSL/TLS", "none"]} onChange={(encryption) => updateNodeConfig({ encryption })} />
          <SelectInput label="Auth method" value={node.config.authMethod ?? "password"} options={["password", "oauth", "none"]} onChange={(authMethod) => updateNodeConfig({ authMethod })} />
          <TextInput label="Username" value={node.config.username ?? ""} onChange={(username) => updateNodeConfig({ username })} />
          <SecretInput label="Password / app password" value={node.config.password ?? ""} onChange={(password) => updateNodeConfig({ password })} />
          <SecretInput label="OAuth token" value={node.config.oauthToken ?? ""} onChange={(oauthToken) => updateNodeConfig({ oauthToken })} />
          <TextInput label="From" value={node.config.from ?? ""} onChange={(from) => updateNodeConfig({ from })} />
          <TextInput label="Reply-To" value={node.config.replyTo ?? ""} onChange={(replyTo) => updateNodeConfig({ replyTo })} />
          <TextInput label="To" value={node.config.to ?? ""} onChange={(to) => updateNodeConfig({ to })} />
          <TextInput label="CC" value={node.config.cc ?? ""} onChange={(cc) => updateNodeConfig({ cc })} />
          <TextInput label="BCC" value={node.config.bcc ?? ""} onChange={(bcc) => updateNodeConfig({ bcc })} />
          <TextInput label="Subject" value={node.config.subject ?? ""} onChange={(subject) => updateNodeConfig({ subject })} />
          <SelectInput label="Email type" value={node.config.emailType ?? "text"} options={["text", "html"]} onChange={(emailType) => updateNodeConfig({ emailType })} />
          <TextAreaInput label="Body" value={node.config.body ?? "{{message}}"} onChange={(body) => updateNodeConfig({ body, payload: body })} />
          <TextInput label="Attachment field" value={node.config.attachmentField ?? ""} onChange={(attachmentField) => updateNodeConfig({ attachmentField })} />
        </div>
      );
    case "gmail.action":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <SelectInput label="Operation" value={node.config.operation ?? "send"} options={["send", "search", "get", "reply", "label"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="To" value={node.config.to ?? ""} onChange={(to) => updateNodeConfig({ to, target: to })} />
          <TextInput label="CC / BCC" value={node.config.ccBcc ?? ""} onChange={(ccBcc) => updateNodeConfig({ ccBcc })} />
          <TextInput label="Subject" value={node.config.subject ?? ""} onChange={(subject) => updateNodeConfig({ subject })} />
          <SelectInput label="Email type" value={node.config.emailType ?? "text"} options={["text", "html"]} onChange={(emailType) => updateNodeConfig({ emailType })} />
          <TextAreaInput label="Body / search query" value={node.config.body ?? "{{message}}"} onChange={(body) => updateNodeConfig({ body, payload: body })} />
          <TextInput label="Attachment field" value={node.config.attachmentField ?? ""} onChange={(attachmentField) => updateNodeConfig({ attachmentField })} />
        </div>
      );
    case "google.sheets":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <SelectInput label="Operation" value={node.config.operation ?? "append"} options={["append", "read", "update", "delete", "clear", "createDocument"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Spreadsheet ID / URL" value={node.config.spreadsheetId ?? ""} onChange={(spreadsheetId) => updateNodeConfig({ spreadsheetId, target: spreadsheetId })} />
          <TextInput label="Sheet name / range" value={node.config.sheetName ?? ""} onChange={(sheetName) => updateNodeConfig({ sheetName })} />
          <TextInput label="Key column" value={node.config.keyColumn ?? ""} onChange={(keyColumn) => updateNodeConfig({ keyColumn })} />
          <KeyValueInput label="Row fields" value={node.config.fieldsText ?? ""} onChange={(fieldsText) => updateNodeConfig({ fieldsText, fields: keyValueTextToObject(fieldsText) })} />
          <NumberInput label="Limit" value={node.config.limit ?? 100} onChange={(limit) => updateNodeConfig({ limit })} />
        </div>
      );
    case "google.drive":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <SelectInput label="Operation" value={node.config.operation ?? "upload"} options={["upload", "download", "list", "delete", "move", "copy", "search"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Drive/bucket/server" value={node.config.container ?? ""} onChange={(container) => updateNodeConfig({ container })} />
          <TextInput label="Path / object key" value={node.config.path ?? ""} onChange={(path) => updateNodeConfig({ path, target: path })} />
          <TextInput label="File name" value={node.config.fileName ?? ""} onChange={(fileName) => updateNodeConfig({ fileName })} />
          <TextInput label="Binary field" value={node.config.binaryField ?? "data"} onChange={(binaryField) => updateNodeConfig({ binaryField })} />
          <TextAreaInput label="Text content / query" value={node.config.content ?? ""} onChange={(content) => updateNodeConfig({ content, payload: content })} />
        </div>
      );
    case "s3.action":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <SelectInput label="Operation" value={node.config.operation ?? "upload"} options={["upload", "download", "list", "delete", "move", "copy", "search"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <SelectInput label="Auth mode" value={node.config.authMode ?? "accessKey"} options={["accessKey", "iamRole"]} onChange={(authMode) => updateNodeConfig({ authMode })} />
          <TextInput label="Region" value={node.config.region ?? ""} onChange={(region) => updateNodeConfig({ region })} />
          <TextInput label="S3 endpoint" value={node.config.endpoint ?? ""} onChange={(endpoint) => updateNodeConfig({ endpoint })} />
          <TextInput label="Access key ID" value={node.config.accessKeyId ?? ""} onChange={(accessKeyId) => updateNodeConfig({ accessKeyId })} />
          <SecretInput label="Secret access key" value={node.config.secretAccessKey ?? ""} onChange={(secretAccessKey) => updateNodeConfig({ secretAccessKey })} />
          <SecretInput label="Session token" value={node.config.sessionToken ?? ""} onChange={(sessionToken) => updateNodeConfig({ sessionToken })} />
          <SelectInput label="Force path style" value={node.config.forcePathStyle ? "true" : "false"} options={["false", "true"]} onChange={(value) => updateNodeConfig({ forcePathStyle: value === "true" })} />
          <TextInput label="Bucket" value={node.config.container ?? ""} onChange={(container) => updateNodeConfig({ container })} />
          <TextInput label="Object key / path" value={node.config.path ?? ""} onChange={(path) => updateNodeConfig({ path, target: path })} />
          <TextInput label="File name" value={node.config.fileName ?? ""} onChange={(fileName) => updateNodeConfig({ fileName })} />
          <TextInput label="Binary field" value={node.config.binaryField ?? "data"} onChange={(binaryField) => updateNodeConfig({ binaryField })} />
          <TextAreaInput label="Text content / query" value={node.config.content ?? ""} onChange={(content) => updateNodeConfig({ content, payload: content })} />
        </div>
      );
    case "ftp.action":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <SelectInput label="Operation" value={node.config.operation ?? "upload"} options={["upload", "download", "list", "delete", "move", "copy", "search"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <SelectInput label="Protocol" value={node.config.protocol ?? "sftp"} options={["sftp", "ftp", "ftps"]} onChange={(protocol) => updateNodeConfig({ protocol })} />
          <TextInput label="Host" value={node.config.host ?? ""} onChange={(host) => updateNodeConfig({ host })} />
          <NumberInput label="Port" value={node.config.port ?? 22} onChange={(port) => updateNodeConfig({ port })} />
          <TextInput label="Username" value={node.config.username ?? ""} onChange={(username) => updateNodeConfig({ username })} />
          <SecretInput label="Password" value={node.config.password ?? ""} onChange={(password) => updateNodeConfig({ password })} />
          <TextAreaInput label="Private key" value={node.config.privateKey ?? ""} onChange={(privateKey) => updateNodeConfig({ privateKey })} />
          <SecretInput label="Passphrase" value={node.config.passphrase ?? ""} onChange={(passphrase) => updateNodeConfig({ passphrase })} />
          <SelectInput label="Ignore SSL issues" value={node.config.ignoreSslIssues ? "true" : "false"} options={["false", "true"]} onChange={(value) => updateNodeConfig({ ignoreSslIssues: value === "true" })} />
          <TextInput label="Remote path" value={node.config.path ?? ""} onChange={(path) => updateNodeConfig({ path, target: path })} />
          <TextInput label="File name" value={node.config.fileName ?? ""} onChange={(fileName) => updateNodeConfig({ fileName })} />
          <TextInput label="Binary field" value={node.config.binaryField ?? "data"} onChange={(binaryField) => updateNodeConfig({ binaryField })} />
        </div>
      );
    case "notion.action":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <SelectInput label="Resource" value={node.config.resource ?? "page"} options={["page", "database", "databasePage", "block", "user"]} onChange={(resource) => updateNodeConfig({ resource })} />
          <SelectInput label="Operation" value={node.config.operation ?? "create"} options={["create", "get", "getMany", "update", "archive", "search", "append"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Database / page / block ID" value={node.config.target ?? ""} onChange={(target) => updateNodeConfig({ target })} />
          <TextInput label="Title" value={node.config.title ?? ""} onChange={(title) => updateNodeConfig({ title })} />
          <KeyValueInput label="Properties" value={node.config.fieldsText ?? ""} onChange={(fieldsText) => updateNodeConfig({ fieldsText, fields: keyValueTextToObject(fieldsText) })} />
          <TextAreaInput label="Content / query" value={node.config.payload ?? ""} onChange={(payload) => updateNodeConfig({ payload })} />
        </div>
      );
    case "airtable.action":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <SelectInput label="Operation" value={node.config.operation ?? "create"} options={["create", "read", "update", "delete", "search", "upsert"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Base ID" value={node.config.baseId ?? ""} onChange={(baseId) => updateNodeConfig({ baseId })} />
          <TextInput label="Table ID / name" value={node.config.table ?? ""} onChange={(table) => updateNodeConfig({ table, target: table })} />
          <TextInput label="Record ID / filter formula" value={node.config.recordId ?? ""} onChange={(recordId) => updateNodeConfig({ recordId })} />
          <KeyValueInput label="Fields" value={node.config.fieldsText ?? ""} onChange={(fieldsText) => updateNodeConfig({ fieldsText, fields: keyValueTextToObject(fieldsText) })} />
        </div>
      );
    case "hubspot.action":
    case "trello.action":
    case "linear.action":
    case "jira.action":
    case "github.action":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <SelectInput label="Resource" value={node.config.resource ?? defaultResourceForNode(node.type)} options={["issue", "ticket", "card", "contact", "company", "deal", "repo", "pullRequest", "release"]} onChange={(resource) => updateNodeConfig({ resource })} />
          <SelectInput label="Operation" value={node.config.operation ?? "create"} options={["create", "read", "update", "delete", "search", "comment", "assign"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Project / repo / board" value={node.config.project ?? ""} onChange={(project) => updateNodeConfig({ project })} />
          <TextInput label="Target / ID" value={node.config.target ?? ""} onChange={(target) => updateNodeConfig({ target })} />
          <TextInput label="Title / name" value={node.config.title ?? ""} onChange={(title) => updateNodeConfig({ title })} />
          <TextAreaInput label="Body / description" value={node.config.body ?? ""} onChange={(body) => updateNodeConfig({ body, payload: body })} />
          <KeyValueInput label="Fields / labels" value={node.config.fieldsText ?? ""} onChange={(fieldsText) => updateNodeConfig({ fieldsText, fields: keyValueTextToObject(fieldsText) })} />
        </div>
      );
    case "redis.action":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <TextInput label="Host" value={node.config.host ?? ""} onChange={(host) => updateNodeConfig({ host })} />
          <NumberInput label="Port" value={node.config.port ?? 6379} onChange={(port) => updateNodeConfig({ port })} />
          <TextInput label="Username" value={node.config.username ?? ""} onChange={(username) => updateNodeConfig({ username })} />
          <SecretInput label="Password" value={node.config.password ?? ""} onChange={(password) => updateNodeConfig({ password })} />
          <NumberInput label="DB index" value={node.config.dbIndex ?? 0} onChange={(dbIndex) => updateNodeConfig({ dbIndex })} />
          <SelectInput label="Use TLS" value={node.config.tls ? "true" : "false"} options={["false", "true"]} onChange={(value) => updateNodeConfig({ tls: value === "true" })} />
          <SelectInput label="Operation" value={node.config.operation ?? "get"} options={["get", "set", "delete", "increment", "publish", "streamAdd"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Key / channel" value={node.config.key ?? ""} onChange={(key) => updateNodeConfig({ key, target: key })} />
          <TextAreaInput label="Value / message" value={node.config.value ?? ""} onChange={(value) => updateNodeConfig({ value, payload: value })} />
          <NumberInput label="TTL seconds" value={node.config.ttlSeconds ?? 0} onChange={(ttlSeconds) => updateNodeConfig({ ttlSeconds })} />
        </div>
      );
    case "mongodb.action":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <SelectInput label="Config type" value={node.config.configType ?? "connectionString"} options={["connectionString", "values"]} onChange={(configType) => updateNodeConfig({ configType })} />
          <TextInput label="Connection string" value={node.config.connectionString ?? ""} onChange={(connectionString) => updateNodeConfig({ connectionString })} />
          <TextInput label="Host" value={node.config.host ?? ""} onChange={(host) => updateNodeConfig({ host })} />
          <NumberInput label="Port" value={node.config.port ?? 27017} onChange={(port) => updateNodeConfig({ port })} />
          <TextInput label="Username" value={node.config.username ?? ""} onChange={(username) => updateNodeConfig({ username })} />
          <SecretInput label="Password" value={node.config.password ?? ""} onChange={(password) => updateNodeConfig({ password })} />
          <TextInput label="Auth DB" value={node.config.authDb ?? ""} onChange={(authDb) => updateNodeConfig({ authDb })} />
          <SelectInput label="Use TLS" value={node.config.tls ? "true" : "false"} options={["false", "true"]} onChange={(value) => updateNodeConfig({ tls: value === "true" })} />
          <SelectInput label="Operation" value={node.config.operation ?? "find"} options={["find", "insert", "update", "delete", "aggregate", "index", "search"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Database / index" value={node.config.database ?? ""} onChange={(database) => updateNodeConfig({ database })} />
          <TextInput label="Collection" value={node.config.collection ?? ""} onChange={(collection) => updateNodeConfig({ collection, target: collection })} />
          <TextAreaInput label="Query JSON" value={node.config.query ?? "{}"} onChange={(query) => updateNodeConfig({ query })} />
          <TextAreaInput label="Document JSON" value={node.config.document ?? "{}"} onChange={(document) => updateNodeConfig({ document, payload: document })} />
          <NumberInput label="Limit" value={node.config.limit ?? 100} onChange={(limit) => updateNodeConfig({ limit })} />
        </div>
      );
    case "elasticsearch.action":
      return (
        <div className="inspector-card">
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <SelectInput label="Auth mode" value={node.config.authMode ?? "basic"} options={["basic", "apiKey"]} onChange={(authMode) => updateNodeConfig({ authMode })} />
          <TextInput label="Base URL" value={node.config.baseUrl ?? ""} onChange={(baseUrl) => updateNodeConfig({ baseUrl })} />
          <TextInput label="Username" value={node.config.username ?? ""} onChange={(username) => updateNodeConfig({ username })} />
          <SecretInput label="Password" value={node.config.password ?? ""} onChange={(password) => updateNodeConfig({ password })} />
          <SecretInput label="API key" value={node.config.apiKey ?? ""} onChange={(apiKey) => updateNodeConfig({ apiKey })} />
          <SelectInput label="Ignore SSL issues" value={node.config.ignoreSslIssues ? "true" : "false"} options={["false", "true"]} onChange={(value) => updateNodeConfig({ ignoreSslIssues: value === "true" })} />
          <SelectInput label="Operation" value={node.config.operation ?? "find"} options={["find", "insert", "update", "delete", "aggregate", "index", "search"]} onChange={(operation) => updateNodeConfig({ operation })} />
          <TextInput label="Index" value={node.config.database ?? ""} onChange={(database) => updateNodeConfig({ database })} />
          <TextInput label="Document type / collection" value={node.config.collection ?? ""} onChange={(collection) => updateNodeConfig({ collection, target: collection })} />
          <TextAreaInput label="Query JSON" value={node.config.query ?? "{}"} onChange={(query) => updateNodeConfig({ query })} />
          <TextAreaInput label="Document JSON" value={node.config.document ?? "{}"} onChange={(document) => updateNodeConfig({ document, payload: document })} />
          <NumberInput label="Limit" value={node.config.limit ?? 100} onChange={(limit) => updateNodeConfig({ limit })} />
        </div>
      );
    case "git.action":
      return (
        <div className="inspector-card">
          <SelectInput label="Operation" value={node.config.operation ?? "status"} options={["status", "log", "diff", "pull", "checkout", "commit", "push"]} onChange={(operation) => updateNodeConfig({ operation, tool: operation === "push" ? "git.push" : "git.status" })} />
          <TextInput label="Repository path" value={node.config.repoPath ?? "."} onChange={(repoPath) => updateNodeConfig({ repoPath, target: repoPath })} />
          <TextInput label="Branch" value={node.config.branch ?? ""} onChange={(branch) => updateNodeConfig({ branch })} />
          <TextInput label="Remote" value={node.config.remote ?? "origin"} onChange={(remote) => updateNodeConfig({ remote })} />
          <TextAreaInput label="Commit message" value={node.config.message ?? ""} onChange={(message) => updateNodeConfig({ message })} />
          <TextInput label="User name" value={node.config.userName ?? ""} onChange={(userName) => updateNodeConfig({ userName })} />
          <TextInput label="User email" value={node.config.userEmail ?? ""} onChange={(userEmail) => updateNodeConfig({ userEmail })} />
          <TextInput label="Repo owner user ID" value={node.config.repoOwnerId ?? ""} onChange={(repoOwnerId) => updateNodeConfig({ repoOwnerId })} />
          <TextInput
            label="Repo shared usernames"
            value={Array.isArray(node.config.repoSharedWithUsernames) ? node.config.repoSharedWithUsernames.join(", ") : ""}
            onChange={(value) => updateNodeConfig({ repoSharedWithUsernames: csvToList(value) })}
          />
        </div>
      );
    case "file.action":
      return (
        <div className="inspector-card">
          <SelectInput label="Operation" value={node.config.operation ?? "read"} options={["read", "write", "append", "list", "copy", "move", "delete"]} onChange={(operation) => updateNodeConfig({ operation, tool: operation === "read" || operation === "list" ? "file.read" : "file.write" })} />
          <TextInput label="Path" value={node.config.path ?? ""} onChange={(path) => updateNodeConfig({ path, target: path })} />
          <TextInput label="Destination path" value={node.config.destinationPath ?? ""} onChange={(destinationPath) => updateNodeConfig({ destinationPath })} />
          <TextAreaInput label="Content" value={node.config.content ?? ""} onChange={(content) => updateNodeConfig({ content })} />
          <SelectInput label="Encoding" value={node.config.encoding ?? "utf8"} options={["utf8", "base64"]} onChange={(encoding) => updateNodeConfig({ encoding })} />
        </div>
      );
    case "shell.action":
      return (
        <div className="inspector-card">
          <TextAreaInput label="Command" value={node.config.command ?? ""} onChange={(command) => updateNodeConfig({ command, target: command })} />
          <TextInput label="Working directory" value={node.config.cwd ?? "."} onChange={(cwd) => updateNodeConfig({ cwd })} />
          <KeyValueInput label="Environment variables" value={node.config.envText ?? ""} onChange={(envText) => updateNodeConfig({ envText, env: keyValueTextToObject(envText) })} />
          <NumberInput label="Timeout seconds" value={node.config.timeoutSeconds ?? 60} onChange={(timeoutSeconds) => updateNodeConfig({ timeoutSeconds })} />
          <SelectInput label="Approval required" value={node.config.requiresApproval === false ? "false" : "true"} options={["true", "false"]} onChange={(requiresApproval) => updateNodeConfig({ requiresApproval: requiresApproval === "true" })} />
        </div>
      );
    case "ssh.action":
      return (
        <div className="inspector-card">
          <TextInput label="Host / IP" value={node.config.host ?? ""} onChange={(host) => updateNodeConfig({ host, target: host })} />
          <NumberInput label="Port" value={node.config.port ?? 22} onChange={(port) => updateNodeConfig({ port })} />
          <TextInput label="Username" value={node.config.username ?? ""} onChange={(username) => updateNodeConfig({ username })} />
          <SelectInput label="Authentication" value={node.config.authType ?? "privateKey"} options={["privateKey", "password"]} onChange={(authType) => updateNodeConfig({ authType })} />
          <SecretInput label="Password" value={node.config.password ?? ""} onChange={(password) => updateNodeConfig({ password })} />
          <TextAreaInput label="Private key" value={node.config.privateKey ?? ""} onChange={(privateKey) => updateNodeConfig({ privateKey })} />
          <SecretInput label="Key passphrase" value={node.config.passphrase ?? ""} onChange={(passphrase) => updateNodeConfig({ passphrase })} />
          <TextInput label="Working directory" value={node.config.cwd ?? "~"} onChange={(cwd) => updateNodeConfig({ cwd })} />
          <TextAreaInput label="Command" value={node.config.command ?? ""} onChange={(command) => updateNodeConfig({ command })} />
          <TextInput label="Host key fingerprint" value={node.config.hostKeyFingerprint ?? ""} onChange={(hostKeyFingerprint) => updateNodeConfig({ hostKeyFingerprint })} />
          <NumberInput label="Timeout seconds" value={node.config.timeoutSeconds ?? 60} onChange={(timeoutSeconds) => updateNodeConfig({ timeoutSeconds })} />
        </div>
      );
    case "test.run":
      return (
        <div className="inspector-card">
          <TextAreaInput label="Test command" value={node.config.command ?? "npm test"} onChange={(command) => updateNodeConfig({ command, target: command })} />
          <TextInput label="Working directory" value={node.config.cwd ?? "."} onChange={(cwd) => updateNodeConfig({ cwd })} />
          <NumberInput label="Timeout seconds" value={node.config.timeoutSeconds ?? 120} onChange={(timeoutSeconds) => updateNodeConfig({ timeoutSeconds })} />
        </div>
      );
    case "database.query":
      return (
        <div className="inspector-card">
          <SelectInput label="Database type" value={node.config.dbType ?? "postgres"} options={["postgres", "mysql", "sqlite"]} onChange={(dbType) => updateNodeConfig({ dbType })} />
          <TextInput label="Credential ID" value={node.config.credentialId ?? ""} onChange={(credentialId) => updateNodeConfig({ credentialId })} />
          <TextInput label="Host" value={node.config.host ?? ""} onChange={(host) => updateNodeConfig({ host })} />
          <NumberInput label="Port" value={node.config.port ?? 5432} onChange={(port) => updateNodeConfig({ port })} />
          <TextInput label="Database" value={node.config.database ?? ""} onChange={(database) => updateNodeConfig({ database })} />
          <TextInput label="Username" value={node.config.username ?? ""} onChange={(username) => updateNodeConfig({ username })} />
          <SecretInput label="Password" value={node.config.password ?? ""} onChange={(password) => updateNodeConfig({ password })} />
          <TextAreaInput label="Query" value={node.config.query ?? "select 1"} onChange={(query) => updateNodeConfig({ query, target: "read" })} />
          <KeyValueInput label="Parameters" value={node.config.paramsText ?? ""} onChange={(paramsText) => updateNodeConfig({ paramsText, params: keyValueTextToObject(paramsText) })} />
        </div>
      );
    case "docker.action":
      return (
        <div className="inspector-card">
          <SelectInput
            label="Operation"
            value={node.config.operation ?? "ps"}
            options={["ps", "logs", "inspect", "exec", "composeUp", "composeDown", "restart"]}
            onChange={(operation) => updateNodeConfig({ operation, tool: ["ps", "logs", "inspect"].includes(operation) ? "docker.inspect" : "docker.run" })}
          />
          <TextInput label="Container / service" value={node.config.target ?? ""} onChange={(target) => updateNodeConfig({ target })} />
          <TextAreaInput label="Command" value={node.config.command ?? ""} onChange={(command) => updateNodeConfig({ command })} />
          <TextInput label="Compose file" value={node.config.composeFile ?? "docker-compose.yml"} onChange={(composeFile) => updateNodeConfig({ composeFile })} />
          <NumberInput label="Tail lines" value={node.config.tail ?? 200} onChange={(tail) => updateNodeConfig({ tail })} />
        </div>
      );
    default:
      return (
        <div className="persist-note">
          <Check size={15} />
          No extra fields needed for this node.
        </div>
      );
  }
}

function TextInput({ label, value, onChange }: { label: string; value: unknown; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SecretInput({ label, value, onChange }: { label: string; value: unknown; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input type="password" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" />
    </label>
  );
}

function TextAreaInput({ label, value, onChange }: { label: string; value: unknown; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <textarea value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function KeyValueInput({ label, value, onChange }: { label: string; value: unknown; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <textarea className="key-value-editor" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} placeholder={"KEY=value\nOTHER=value"} />
    </label>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: unknown; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <input type="number" value={String(value ?? 0)} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: unknown;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={String(value ?? options[0] ?? "")} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CredentialRequirements({ nodeType }: { nodeType: string }) {
  const req = credentialRequirementRows(nodeType);
  if (req.length === 0) return null;
  return (
    <div className="inspector-card">
      <strong>Credential requirements</strong>
      <ul>
        {req.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function credentialRequirementRows(nodeType: string): string[] {
  switch (nodeType) {
    case "telegram.send":
      return ["Telegram bot token (BotFather)", "Target chat ID"];
    case "whatsapp.send":
      return ["Meta WhatsApp permanent token", "Phone Number ID", "WABA ID"];
    case "discord.send":
      return ["Bot token or incoming webhook URL", "Target channel / thread"];
    case "slack.send":
      return ["Slack bot token or webhook URL", "Channel ID/name", "Signing secret for inbound Slack trigger"];
    case "email.send":
      return ["SMTP host", "Port (587 STARTTLS or 465 SSL/TLS)", "Auth: username+password or OAuth token", "From address"];
    case "gmail.action":
      return ["Google OAuth credential (gmail scope)", "Mailbox access grant"];
    case "google.sheets":
    case "google.drive":
      return ["Google OAuth credential", "Scope access for selected operation"];
    case "notion.action":
      return ["Notion integration token", "Connected workspace/page access"];
    case "airtable.action":
      return ["Airtable personal access token", "Base ID + table permissions"];
    case "hubspot.action":
      return ["HubSpot private app token", "Object scope permissions"];
    case "trello.action":
      return ["Trello API key", "Trello token"];
    case "linear.action":
      return ["Linear API key"];
    case "jira.action":
      return ["Atlassian account email", "Jira API token", "Jira domain URL"];
    case "github.action":
      return ["GitHub token (PAT or app token)", "Repo/org scopes for operation"];
    case "s3.action":
      return ["S3 region", "Access key + secret key (or IAM role)", "S3 endpoint for S3-compatible providers"];
    case "ftp.action":
      return ["Protocol (FTP/SFTP/FTPS)", "Host + port", "Username/password or SSH private key"];
    case "redis.action":
      return ["Redis host + port", "Optional username/password", "TLS setting if required"];
    case "mongodb.action":
      return ["Mongo connection string or host/port/user/pass", "Auth database and TLS if required"];
    case "elasticsearch.action":
      return ["Elasticsearch base URL", "Basic auth (username/password) or API key"];
    case "database.query":
      return ["DB host/port/database", "DB username/password or credential record"];
    case "ssh.action":
      return ["SSH host/IP + port", "Username", "Password or private key + passphrase"];
    default:
      return [];
  }
}

function keyValueTextToObject(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const splitAt = line.indexOf("=");
        return splitAt === -1 ? [line, ""] : [line.slice(0, splitAt).trim(), line.slice(splitAt + 1).trim()];
      })
  );
}

function firstModel(provider: ModelProviderId): string {
  return providerModels[provider][0] ?? "llama3.1";
}

function supportsIntelligenceControl(provider: ModelProviderId, model: string): boolean {
  if (provider === "anthropic") {
    return true;
  }
  if (provider === "openai") {
    const lower = model.toLowerCase();
    return lower.startsWith("o");
  }
  return false;
}

function createNodeConfig(template: NodeTemplate, id: string): Record<string, unknown> {
  switch (template.type) {
    case "group.box":
      return { width: 420, height: 280 };
    case "agent.run":
      return {
        agentId: id,
        name: "Canvas Agent",
        model: { provider: "ollama", model: "llama3.1" },
        intelligence: "off",
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
      return { path: template.type, method: "POST", authType: "none", secret: "" };
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
        tool: template.type.includes("bash") || template.type.includes("powershell") ? "shell.run" : template.type.includes("sql") ? "db.query" : "code.run",
        language: template.type.replace("code.", ""),
        runtime: runtimeForCodeNode(template.type),
        mode: "runOnceForAllItems",
        code: defaultCodeForNode(template.type),
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
      return { tool: template.type, credentialId: "", operation: "send", channel: "", message: "{{message}}", threadId: "", attachmentField: "" };
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
      return { tool: template.type, credentialId: "", operation: "send", to: "", ccBcc: "", subject: "", emailType: "text", body: "{{message}}", attachmentField: "" };
    case "google.sheets":
      return { tool: template.type, credentialId: "", operation: "append", spreadsheetId: "", sheetName: "", keyColumn: "", fieldsText: "", fields: {}, limit: 100 };
    case "google.drive":
      return { tool: template.type, credentialId: "", operation: "upload", container: "", path: "", fileName: "", binaryField: "data", content: "" };
    case "notion.action":
      return { tool: template.type, credentialId: "", resource: "page", operation: "create", target: "", title: "", fieldsText: "", fields: {}, payload: "" };
    case "airtable.action":
      return { tool: template.type, credentialId: "", operation: "create", baseId: "", table: "", recordId: "", fieldsText: "", fields: {} };
    case "hubspot.action":
    case "trello.action":
    case "linear.action":
    case "jira.action":
    case "github.action":
      return { tool: template.type, credentialId: "", resource: defaultResourceForNode(template.type), operation: "create", project: "", target: "", title: "", body: "", fieldsText: "", fields: {} };
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
      return { tool: template.type, credentialId: "", host: "", port: 6379, username: "", password: "", dbIndex: 0, tls: false, operation: "get", key: "", value: "", ttlSeconds: 0 };
    case "mongodb.action":
      return {
        tool: template.type,
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
        tool: template.type,
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
      return { tool: "git.status", operation: "status", repoPath: ".", target: ".", branch: "", remote: "origin", message: "", userName: "", userEmail: "", repoOwnerId: "", repoSharedWithUsernames: [] };
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

function createSkillAssetNodeConfig(skill: DashboardSkillAsset): Record<string, unknown> {
  if (skill.type === "soul") {
    return { savedSkillId: skill.id, soul: skill.soul ?? skill.name };
  }
  if (skill.type === "personality") {
    return { savedSkillId: skill.id, personality: skill.personality ?? skill.name };
  }
  return {
    savedSkillId: skill.id,
    name: skill.name,
    instructions: skill.instructions ?? "",
    toolNames: skill.toolNames ?? []
  };
}

function displaySessionName(name: string, index: number): string {
  return name === "Local Orchestrator" ? `Chat ${index + 1}` : name;
}

function ownerName(state: AppState, workflow: Workflow): string {
  const ownerId = workflow.ownerId ?? "system";
  return ownerNameFromId(state, ownerId);
}

function ownerNameFromId(state: AppState, ownerId: string): string {
  return state.users.find((user) => user.id === ownerId)?.username ?? (ownerId === state.user.id ? state.user.username : ownerId);
}

function canShareCanvas(state: AppState, workflow: Workflow): boolean {
  return state.user.role === "admin" || workflow.ownerId === state.user.id;
}

function workflowNameById(state: AppState, workflowId: string): string {
  return state.workflows.find((workflow) => workflow.id === workflowId)?.name ?? workflowId;
}

function sessionsForWorkflow(state: AppState, workflowId: string): ChatSession[] {
  return state.sessions.filter((session) => session.workflowId === workflowId);
}

function buildDashboardStats(state: AppState, runs: WorkflowRunRecord[], apiOnline: boolean, browserOnline: boolean) {
  const pendingApprovals = state.approvals.filter((approval) => approval.status === "pending").length;
  const failedRuns = runs.filter((run) => run.status === "failed").length;
  return {
    pendingApprovals,
    metrics: [
      { label: "Canvases", value: state.workflows.length, hint: state.user.role === "admin" ? "all users" : "owned" },
      { label: "Chat Sessions", value: state.sessions.length, hint: "canvas-scoped" },
      { label: "Agents", value: state.agents.length, hint: "persistent profiles" },
      { label: "Skills", value: (state.skills ?? []).length, hint: "saved assets" },
      { label: "Pending", value: pendingApprovals, hint: "approvals" },
      { label: "Health", value: apiOnline && browserOnline ? "Online" : "Check", hint: failedRuns ? `${failedRuns} failed runs` : "no failed runs" }
    ]
  };
}

function collectDashboardSkills(state: AppState): DashboardSkillAsset[] {
  return (state.skills ?? []).map((skill) => ({
    ...skill,
    source: "Saved library",
    canvasName: ownerNameFromId(state, skill.ownerId)
  }));
}

function collectDashboardCredentials(state: AppState): Array<{ id: string; name: string; status: "configured" | "missing"; canvasName: string; nodeName: string }> {
  return state.workflows.flatMap((workflow) =>
    workflow.nodes
      .filter((node) => nodeNeedsCredential(node))
      .map((node) => {
        const credentialId = firstString(node.config.credentialId, node.config.authType === "privateKey" ? node.config.privateKey : "", node.config.secret);
        return {
          id: `${workflow.id}:${node.id}`,
          name: credentialId || "Missing credential",
          status: credentialId ? "configured" : "missing",
          canvasName: workflow.name,
          nodeName: node.name
        };
      })
  );
}

function inferItemsSchema(items: Array<{ json: Record<string, unknown> }>): string[] {
  const keys = new Map<string, string>();
  for (const item of items.slice(0, 25)) {
    for (const [key, value] of Object.entries(item.json)) {
      if (!keys.has(key)) {
        keys.set(key, Array.isArray(value) ? "array" : value === null ? "null" : typeof value);
      }
    }
  }
  return [...keys.entries()].map(([key, type]) => `${key}: ${type}`);
}

function collectDashboardProviders(state: AppState): Array<{ id: string; name: string; sessions: number; models: string[] }> {
  const providers = new Map<string, { id: string; name: string; sessions: number; models: Set<string> }>();
  for (const session of state.sessions) {
    const provider = providers.get(session.model.provider) ?? {
      id: session.model.provider,
      name: session.model.provider,
      sessions: 0,
      models: new Set<string>()
    };
    provider.sessions += 1;
    provider.models.add(session.model.model);
    providers.set(session.model.provider, provider);
  }
  return [...providers.values()].map((provider) => ({
    id: provider.id,
    name: provider.name,
    sessions: provider.sessions,
    models: [...provider.models]
  }));
}

function nodeNeedsCredential(node: WorkflowNode): boolean {
  return /telegram|whatsapp|discord|slack|email|gmail|google|notion|airtable|hubspot|trello|linear|jira|github|s3|ftp|redis|mongodb|elasticsearch|database|ssh/.test(
    node.type
  );
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSkillAssetNode(node: WorkflowNode): boolean {
  return node.type === "agent.skill" || node.type === "agent.soul" || node.type === "agent.personality";
}

function skillSaveInputFromNode(node: WorkflowNode): {
  id?: string;
  type: "skill" | "soul" | "personality";
  name: string;
  instructions?: string;
  soul?: string;
  personality?: string;
  toolNames?: string[];
} {
  if (node.type === "agent.soul") {
    const soul = String(node.config.soul ?? "");
    return { id: firstString(node.config.savedSkillId), type: "soul", name: firstString(node.name, soul, "Soul"), soul, toolNames: [] };
  }
  if (node.type === "agent.personality") {
    const personality = String(node.config.personality ?? "");
    return { id: firstString(node.config.savedSkillId), type: "personality", name: firstString(node.name, personality, "Personality"), personality, toolNames: [] };
  }
  return {
    id: firstString(node.config.savedSkillId),
    type: "skill",
    name: firstString(node.config.name, node.name, "Skill"),
    instructions: String(node.config.instructions ?? ""),
    toolNames: Array.isArray(node.config.toolNames) ? node.config.toolNames.map(String) : []
  };
}

function isTerminalNode(node: WorkflowNode): boolean {
  return (
    node.type.startsWith("code.") ||
    node.type === "shell.action" ||
    node.type === "ssh.action" ||
    node.type === "test.run" ||
    node.type === "docker.action"
  );
}

function terminalHistoryFromNode(node: WorkflowNode): TerminalRunResult[] {
  return Array.isArray(node.config.terminalHistory) ? (node.config.terminalHistory as TerminalRunResult[]) : [];
}

function terminalCommandPatch(node: WorkflowNode, command: string): Record<string, unknown> {
  const patch: Record<string, unknown> = { terminalCommand: command };
  if (["shell.action", "ssh.action", "test.run", "docker.action"].includes(node.type)) {
    patch.command = command;
    patch.target = command;
  }
  return patch;
}

function terminalPromptForNode(node: WorkflowNode): string {
  if (node.type === "ssh.action") return "ssh-node";
  if (node.type === "docker.action") return "docker-node";
  if (node.type === "test.run") return "test-node";
  if (node.type.startsWith("code.")) return `${node.type.replace("code.", "")}-node`;
  return "shell-node";
}

function defaultTerminalCommandForNode(node: WorkflowNode): string {
  const command = String(node.config.command ?? "").trim();
  if (command) {
    return command;
  }
  switch (node.type) {
    case "test.run":
      return "npm test";
    case "docker.action":
      return "docker ps";
    case "ssh.action":
      return "echo Configure SSH command for this node";
    case "code.javascript":
    case "code.typescript":
      return "node --version";
    case "code.python":
      return "python --version";
    case "code.bash":
      return "bash --version";
    case "code.powershell":
      return "$PSVersionTable.PSVersion";
    case "code.go":
      return "go version";
    case "code.rust":
      return "rustc --version";
    case "code.java":
      return "java -version";
    case "code.csharp":
      return "dotnet --version";
    case "code.php":
      return "php --version";
    case "code.ruby":
      return "ruby --version";
    case "code.lua":
      return "lua -v";
    case "code.perl":
      return "perl -v";
    case "code.r":
      return "R --version";
    case "code.c":
    case "code.cpp":
      return "gcc --version";
    case "code.sql":
      return "echo SQL terminal adapter pending";
    case "code.regex":
      return "echo Regex terminal ready";
    case "code.jq":
      return "jq --version";
    default:
      return "pwd";
  }
}

function normalizeConnection(connection: Connection, workflow: Workflow): Connection | null {
  if (!connection.source || !connection.target) {
    return null;
  }
  const sourceNode = workflow.nodes.find((node) => node.id === connection.source);
  const targetNode = workflow.nodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode) {
    return null;
  }

  if (targetNode.type !== "agent.run") {
    return { ...connection, targetHandle: connection.targetHandle ?? "workflow-input" };
  }

  const expectedProfileHandle = profileHandleForSource(sourceNode.type);
  if (expectedProfileHandle) {
    return { ...connection, targetHandle: expectedProfileHandle };
  }

  return { ...connection, targetHandle: "workflow-input" };
}

function profileHandleForSource(sourceType: string): string | null {
  if (sourceType === "agent.soul") return "soul";
  if (sourceType === "agent.skill") return "skill";
  if (sourceType === "agent.personality") return "personality";
  return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function shouldRecordNodeChangeHistory(changes: NodeChange[], dragStartedRef: { current: boolean }): boolean {
  const positionChanges = changes.filter((change) => change.type === "position");
  if (positionChanges.length === 0) {
    dragStartedRef.current = false;
    return true;
  }

  const isDragging = positionChanges.some((change) => Boolean("dragging" in change && change.dragging));
  if (isDragging) {
    if (dragStartedRef.current) {
      return false;
    }
    dragStartedRef.current = true;
    return true;
  }

  dragStartedRef.current = false;
  return false;
}

function workflowSaveSignature(workflow: Workflow): string {
  return JSON.stringify({
    id: workflow.id,
    name: workflow.name,
    version: workflow.version,
    nodes: workflow.nodes,
    edges: workflow.edges
  });
}

function orderNodesForFlow(nodes: WorkflowNode[]): WorkflowNode[] {
  return [...nodes.filter((node) => node.type === "group.box"), ...nodes.filter((node) => node.type !== "group.box")];
}

function getGroupMinimumSize(groupId: string, nodes: WorkflowNode[]): { width: number; height: number } {
  const children = nodes.filter((node) => node.parentId === groupId && node.type !== "group.box");
  if (children.length === 0) {
    return { width: 260, height: 140 };
  }
  const maxX = Math.max(...children.map((node) => node.position.x + flowNodeWidth + groupPaddingX));
  const maxY = Math.max(...children.map((node) => node.position.y + flowNodeHeight + groupPaddingBottom));
  return {
    width: Math.max(260, maxX),
    height: Math.max(140, maxY)
  };
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

function clampWorkflowChildrenToGroups(workflow: Workflow): Workflow {
  let changed = false;
  const nodes = workflow.nodes.map((node) => {
    if (!node.parentId || node.type === "group.box") {
      return node;
    }
    const position = clampNodePositionInParent(node, node.position, workflow.nodes);
    if (position.x === node.position.x && position.y === node.position.y) {
      return node;
    }
    changed = true;
    return { ...node, position };
  });

  return changed ? { ...workflow, nodes, updatedAt: new Date().toISOString() } : workflow;
}

function clampNodePositionInParent(node: WorkflowNode, position: { x: number; y: number }, nodes: WorkflowNode[]): { x: number; y: number } {
  if (!node.parentId) {
    return position;
  }
  const group = nodes.find((item) => item.id === node.parentId && item.type === "group.box");
  if (!group) {
    return position;
  }
  const groupWidth = Number(group.config.width ?? 420);
  const groupHeight = Number(group.config.height ?? 280);
  const minX = groupPaddingX;
  const minY = groupPaddingTop;
  const maxX = Math.max(minX, groupWidth - flowNodeWidth - groupPaddingX);
  const maxY = Math.max(minY, groupHeight - flowNodeHeight - groupPaddingBottom);
  return {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY)
  };
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
      return "gcc:14";
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
    case "code.go":
      return "package main\n\nfunc main() {\n  // read item JSON from stdin and write JSON to stdout\n}";
    case "code.rust":
      return "fn main() {\n    // read item JSON from stdin and write JSON to stdout\n}";
    case "code.java":
      return "class Main {\n  public static void main(String[] args) {\n    // read item JSON from stdin and write JSON to stdout\n  }\n}";
    case "code.csharp":
      return "using System;\n\nConsole.WriteLine(Environment.GetEnvironmentVariable(\"BARYON_INPUT\"));";
    case "code.php":
      return "<?php\necho getenv('BARYON_INPUT');\n";
    case "code.ruby":
      return "puts ENV['BARYON_INPUT']";
    case "code.lua":
      return "print(os.getenv('BARYON_INPUT'))";
    case "code.perl":
      return "print $ENV{'BARYON_INPUT'};";
    case "code.r":
      return "cat(Sys.getenv('BARYON_INPUT'))";
    case "code.c":
      return "#include <stdio.h>\n#include <stdlib.h>\n\nint main(void) {\n  puts(getenv(\"BARYON_INPUT\"));\n  return 0;\n}";
    case "code.cpp":
      return "#include <cstdlib>\n#include <iostream>\n\nint main() {\n  std::cout << std::getenv(\"BARYON_INPUT\") << std::endl;\n}";
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveAbsolutePosition(node: WorkflowNode, lookup: Map<string, WorkflowNode>): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  let depth = 0;
  while (parentId && depth < 20) {
    const parent = lookup.get(parentId);
    if (!parent) {
      break;
    }
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
    depth += 1;
  }
  return { x, y };
}
