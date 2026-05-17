export type Intelligence = "off" | "low" | "medium" | "high";
export type ModelProviderId = "ollama" | "openai" | "anthropic";

export interface ModelRef {
  provider: ModelProviderId;
  model: string;
  baseUrl?: string;
}

export interface ChatSession {
  id: string;
  ownerId: string;
  workflowId?: string;
  name: string;
  model: ModelRef;
  intelligence: Intelligence;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  kind: "trigger" | "action" | "agent";
  name: string;
  position: { x: number; y: number };
  parentId?: string;
  extent?: "parent" | null;
  config: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface Workflow {
  id: string;
  ownerId?: string;
  sharedWithUserIds?: string[];
  sharedWithUsernames?: string[];
  name: string;
  version: number;
  settings?: {
    active?: boolean;
    errorWorkflowId?: string;
    redactExecutionData?: boolean;
  };
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  model: ModelRef;
  intelligence: Intelligence;
  soul: string;
  personality: string;
  skills: Array<{ id: string; name: string; instructions: string; toolNames: string[] }>;
  toolNames: string[];
  memoryScope: "none" | "session" | "workflow" | "global";
  policy: Record<string, unknown>;
}

export interface SavedSkillAsset {
  id: string;
  ownerId: string;
  type: "skill" | "soul" | "personality";
  name: string;
  instructions?: string;
  soul?: string;
  personality?: string;
  toolNames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CredentialView {
  id: string;
  ownerId: string;
  name: string;
  service: string;
  authType: "apiKey" | "oauth2" | "basic" | "token" | "sshKey" | "custom";
  fields: string[];
  sharedWithUserIds: string[];
  sharedWithUsernames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  id: string;
  status: "pending" | "approved" | "rejected";
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  status: "completed" | "paused" | "failed";
  items: Array<{ json: Record<string, unknown> }>;
  nodeOutputs?: Record<string, Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }>>;
  audit: Array<{ id: string; type: string; message: string; createdAt: string; data?: Record<string, unknown> }>;
  error?: string;
  createdAt: string;
}

export interface CanvasActionResult {
  action: string;
  ok: boolean;
  message: string;
  nodeId?: string;
  edgeId?: string;
  selectedNodeId?: string | null;
}

export interface ChatSendResult {
  userMessage: StoredMessage;
  assistantMessage: StoredMessage;
  approval?: ApprovalRecord;
  canvas?: {
    workflow: Workflow;
    selectedNodeId?: string | null;
    actions: CanvasActionResult[];
    run?: WorkflowRunRecord;
    approval?: ApprovalRecord;
  };
}

export interface TerminalRunResult {
  id: string;
  nodeId: string;
  nodeType: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
}

export interface AppState {
  user: { id: string; username: string; role: "admin" | "user" };
  users: Array<{ id: string; username: string; role: "admin" | "user" }>;
  sessions: ChatSession[];
  workflows: Workflow[];
  agents: AgentProfile[];
  skills: SavedSkillAsset[];
  credentials: CredentialView[];
  approvals: ApprovalRecord[];
}

export interface AuthResult {
  token: string;
  user: { id: string; username: string; role: "admin" | "user" };
}

export interface AuthStatus {
  adminExists: boolean;
}
