import type {
  AgentProfile,
  AuditEvent,
  Id,
  ModelProvider,
  ModelProviderId,
  NodeDefinition,
  Workflow,
  WorkflowItem,
  WorkflowRunResult
} from "./types.js";

export interface WorkflowEngineOptions {
  nodes: NodeDefinition[];
  providers: Map<ModelProviderId, ModelProvider>;
  agents?: AgentProfile[];
}

export class WorkflowEngine {
  private readonly nodes: Map<string, NodeDefinition>;
  private readonly providers: Map<ModelProviderId, ModelProvider>;
  private readonly agents: Map<Id, AgentProfile>;

  constructor(options: WorkflowEngineOptions) {
    this.nodes = new Map(options.nodes.map((node) => [node.type, node]));
    this.providers = options.providers;
    this.agents = new Map((options.agents ?? []).map((agent) => [agent.id, agent]));
  }

  async run(workflow: Workflow, input: WorkflowItem[] = [{ json: {} }]): Promise<WorkflowRunResult> {
    const runId = crypto.randomUUID();
    const audit: AuditEvent[] = [];
    const log = (event: Omit<AuditEvent, "id" | "createdAt">) => {
      audit.push({ ...event, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    };

    log({ type: "workflow.run.started", message: `Workflow ${workflow.name} started`, data: { workflowId: workflow.id } });

    try {
      const order = this.resolveExecutionOrder(workflow);
      const outputs = new Map<Id, WorkflowItem[]>();
      const nodeOutputs: Record<Id, WorkflowItem[]> = {};
      let lastItems = input;

      for (const workflowNode of order) {
        const nodeDef = this.nodes.get(workflowNode.type);
        if (!nodeDef) {
          throw new Error(`Unknown node type: ${workflowNode.type}`);
        }

        const incoming = workflow.edges.filter((edge) => edge.target === workflowNode.id);
        const nodeInput =
          incoming.length > 0
            ? incoming.flatMap((edge) => outputs.get(edge.source) ?? [])
            : lastItems;

        log({ type: "workflow.node.started", message: `Node ${workflowNode.name} started`, data: { nodeId: workflowNode.id } });
        const result = await nodeDef.run({
          runId,
          workflow,
          node: workflowNode,
          input: nodeInput,
          agents: this.agents,
          providers: this.providers,
          tools: new Map(),
          log
        });

        outputs.set(workflowNode.id, result.items);
        nodeOutputs[workflowNode.id] = result.items;
        lastItems = result.items;

        if (result.status === "paused") {
          log({
            type: "workflow.node.paused",
            message: result.pauseReason ?? `Node ${workflowNode.name} paused`,
            data: { nodeId: workflowNode.id }
          });
          return { runId, status: "paused", items: result.items, nodeOutputs, audit };
        }

        log({
          type: "workflow.node.completed",
          message: `Node ${workflowNode.name} completed`,
          data: { nodeId: workflowNode.id, itemCount: result.items.length }
        });
      }

      log({ type: "workflow.run.completed", message: `Workflow ${workflow.name} completed` });
      return { runId, status: "completed", items: lastItems, nodeOutputs, audit };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log({ type: "workflow.run.failed", message });
      return { runId, status: "failed", items: [], nodeOutputs: {}, audit, error: message };
    }
  }

  private resolveExecutionOrder(workflow: Workflow) {
    const incomingCount = new Map(workflow.nodes.map((node) => [node.id, 0]));
    for (const edge of workflow.edges) {
      incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    }

    const queue = workflow.nodes.filter((node) => (incomingCount.get(node.id) ?? 0) === 0);
    const order = [];

    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) {
        break;
      }
      order.push(node);

      for (const edge of workflow.edges.filter((item) => item.source === node.id)) {
        incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 1) - 1);
        if (incomingCount.get(edge.target) === 0) {
          const next = workflow.nodes.find((candidate) => candidate.id === edge.target);
          if (next) {
            queue.push(next);
          }
        }
      }
    }

    if (order.length !== workflow.nodes.length) {
      throw new Error("Workflow graph contains a cycle or disconnected invalid edge");
    }

    return order;
  }
}
