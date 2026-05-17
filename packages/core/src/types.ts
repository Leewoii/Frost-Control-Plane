export type Id = string;

export type Intelligence = "off" | "low" | "medium" | "high";

export type ModelProviderId = "ollama" | "openai" | "anthropic";

export interface ModelRef {
  provider: ModelProviderId;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface ChatMessage {
  id?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt?: string;
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk: ActionRisk;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ModelGenerateRequest {
  model: ModelRef;
  intelligence: Intelligence;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  system?: string;
}

export interface ModelGenerateResponse {
  content: string;
  toolCalls: ToolCall[];
  usage?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ModelProvider {
  id: ModelProviderId;
  generate(request: ModelGenerateRequest): Promise<ModelGenerateResponse>;
}

export type NodeKind = "trigger" | "action" | "agent";

export interface WorkflowItem {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
}

export interface WorkflowNode<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  id: Id;
  type: string;
  kind: NodeKind;
  name: string;
  position: { x: number; y: number };
  parentId?: string;
  extent?: "parent" | null;
  config: TConfig;
}

export interface WorkflowEdge {
  id: Id;
  source: Id;
  target: Id;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface Workflow {
  id: Id;
  name: string;
  version: number;
  settings?: {
    active?: boolean;
    errorWorkflowId?: Id;
    redactExecutionData?: boolean;
  };
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface Skill {
  id: Id;
  name: string;
  instructions: string;
  toolNames: string[];
}

export interface AgentProfile {
  id: Id;
  name: string;
  model: ModelRef;
  intelligence: Intelligence;
  soul: string;
  personality: string;
  skills: Skill[];
  toolNames: string[];
  memoryScope: "none" | "session" | "workflow" | "global";
  policy: Policy;
}

export type ActionRisk = "read" | "write" | "destructive" | "external-send";

export interface PolicyRule {
  tool: string;
  target?: string;
  risks: ActionRisk[];
  decision: "allow" | "approval" | "block";
}

export interface Policy {
  defaultDecision: "allow" | "approval" | "block";
  rules: PolicyRule[];
}

export interface PolicyRequest {
  tool: string;
  target?: string;
  risk: ActionRisk;
}

export interface PolicyDecision {
  decision: "allow" | "approval" | "block";
  reason: string;
  matchedRule?: PolicyRule;
}

export interface ToolAdapter {
  name: string;
  definition: ToolDefinition;
  run(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<WorkflowItem[]>;
}

export interface ToolExecutionContext {
  runId: Id;
  workflowId?: Id;
  policy: Policy;
  log(event: AuditEvent): void;
}

export interface AuditEvent {
  id: Id;
  type:
    | "workflow.run.started"
    | "workflow.node.started"
    | "workflow.node.completed"
    | "workflow.node.paused"
    | "workflow.run.completed"
    | "workflow.run.failed"
    | "model.call"
    | "tool.call"
    | "policy.decision"
    | "approval.requested";
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface NodeExecutionContext {
  runId: Id;
  workflow: Workflow;
  node: WorkflowNode;
  input: WorkflowItem[];
  agents: Map<Id, AgentProfile>;
  providers: Map<ModelProviderId, ModelProvider>;
  tools: Map<string, ToolAdapter>;
  log(event: Omit<AuditEvent, "id" | "createdAt">): void;
}

export interface NodeExecutionResult {
  status: "completed" | "paused";
  items: WorkflowItem[];
  pauseReason?: string;
}

export interface NodeDefinition {
  type: string;
  kind: NodeKind;
  label: string;
  description: string;
  defaultConfig: Record<string, unknown>;
  run(ctx: NodeExecutionContext): Promise<NodeExecutionResult>;
}

export interface WorkflowRunResult {
  runId: Id;
  status: "completed" | "paused" | "failed";
  items: WorkflowItem[];
  nodeOutputs: Record<Id, WorkflowItem[]>;
  audit: AuditEvent[];
  error?: string;
}
