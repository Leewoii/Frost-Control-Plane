import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createDefaultNodeRegistry,
  createProviderRegistry,
  WorkflowEngine,
  type ChatMessage,
  type AgentProfile,
  type ModelRef,
  type Workflow,
  type WorkflowNode
} from "@baryon/core";
import type { ApprovalRecord, CredentialRecord, CredentialView, StoredMessage, WorkflowRunRecord } from "./domain.js";
import {
  applyCanvasActions,
  buildCanvasSystemPrompt,
  canvasActionsFromToolCalls,
  canvasTools,
  inferCanvasActionsFromMessage,
  parseCanvasActionsFromText,
  summarizeCanvasResults,
  summarizeWorkflowForUser
} from "./canvas-actions.js";
import type { EventHub } from "./events.js";
import type { AppStore } from "./store.js";
import { runIsolatedTerminalCommand } from "./terminal.js";

interface RouteEnv {
  ollamaBaseUrl?: string;
  ollamaDefaultModel?: string;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  whatsappVerifyToken?: string;
  authSecret?: string;
}

export async function registerRoutes(app: FastifyInstance, store: AppStore, events: EventHub, env: RouteEnv) {
  const authSecret = env.authSecret ?? process.env.AUTH_SECRET ?? "frostbyte-local-secret";

  const providers = createProviderRegistry({
    ollamaBaseUrl: env.ollamaBaseUrl,
    ollamaDefaultModel: env.ollamaDefaultModel,
    openAiApiKey: env.openAiApiKey,
    anthropicApiKey: env.anthropicApiKey
  });

  async function runWorkflowNow(
    workflow: Workflow,
    input: Array<{ json: Record<string, unknown> }> = [{ json: {} }],
    options: { handlingError?: boolean } = {}
  ): Promise<{ run: WorkflowRunRecord; approval?: ApprovalRecord }> {
    const engine = new WorkflowEngine({
      nodes: createDefaultNodeRegistry(),
      providers,
      agents: await store.listAgents()
    });
    const result = await engine.run(workflow, input);
    const redact = workflow.settings?.redactExecutionData === true;
    const run = await store.saveRun({
      id: result.runId,
      workflowId: workflow.id,
      status: result.status,
      items: redact ? [] : result.items,
      nodeOutputs: redact ? {} : result.nodeOutputs,
      audit: result.audit,
      error: result.error,
      createdAt: new Date().toISOString()
    });

    let approval: ApprovalRecord | undefined;
    if (result.status === "paused") {
      const lastAudit = result.audit.at(-1);
      const inputContext = input[0]?.json ?? {};
      approval = await store.createApproval({
        message: lastAudit?.message ?? "Workflow paused for approval",
        payload: {
          workflowId: workflow.id,
          workflowName: workflow.name,
          runId: result.runId,
          sessionId: typeof inputContext.sessionId === "string" ? inputContext.sessionId : undefined,
          request: typeof inputContext.message === "string" ? inputContext.message : undefined,
          nodeId: typeof lastAudit?.data?.nodeId === "string" ? lastAudit.data.nodeId : undefined,
          auditMessage: lastAudit?.message,
          auditType: lastAudit?.type
        }
      });
    }

    if (result.status === "failed" && !options.handlingError && workflow.settings?.errorWorkflowId) {
      const errorWorkflow = await store.getWorkflow(workflow.settings.errorWorkflowId);
      if (errorWorkflow && errorWorkflow.id !== workflow.id) {
        await runWorkflowNow(
          errorWorkflow,
          [
            {
              json: {
                execution: {
                  id: result.runId,
                  error: result.error,
                  lastNodeExecuted: result.audit.at(-1)?.data?.nodeId,
                  mode: "manual"
                },
                workflow: {
                  id: workflow.id,
                  name: workflow.name
                }
              }
            }
          ],
          { handlingError: true }
        );
      }
    }

    events.publish("workflow.run.finished", { workflowId: workflow.id, runId: result.runId, status: result.status });
    return { run, ...(approval ? { approval } : {}) };
  }

  app.get("/health", async () => ({ ok: true, name: "frostbyte-api" }));

  app.get("/api/auth/status", async () => ({
    adminExists: (await store.listUsers()).some((user) => user.role === "admin")
  }));

  app.post("/api/auth/bootstrap-admin", async (request, reply) => {
    if ((await store.listUsers()).some((user) => user.role === "admin")) {
      return reply.code(409).send({ error: "admin already exists" });
    }
    const body = request.body as { username?: string; password?: string };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (username.length < 3 || password.length < 6) {
      return reply.code(400).send({ error: "username >= 3 chars and password >= 6 chars required" });
    }
    const user = await store.createUser({ username, password, role: "admin" });
    return { token: signToken({ id: user.id, username: user.username, role: user.role }, authSecret), user: sanitizeUser(user) };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    const user = await store.authenticate(String(body.username ?? ""), String(body.password ?? ""));
    if (!user) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    return { token: signToken({ id: user.id, username: user.username, role: user.role }, authSecret), user: sanitizeUser(user) };
  });

  app.get("/api/state", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const allSessions = await store.listSessions();
    const allWorkflows = await store.listWorkflows();
    const allApprovals = await store.listApprovals();
    const allSkills = await store.listSkills();
    const allCredentials = await store.listCredentials();
    const allowedSessionIds = new Set(allSessions.filter((session) => auth.role === "admin" || session.ownerId === auth.id).map((session) => session.id));
    return {
      user: auth,
      users: auth.role === "admin" ? (await store.listUsers()).map(sanitizeUser) : [],
      sessions: allSessions.filter((session) => auth.role === "admin" || session.ownerId === auth.id),
      workflows: allWorkflows.filter((workflow) => canAccessWorkflow(auth, workflow)),
      agents: await store.listAgents(),
      skills: allSkills.filter((skill) => auth.role === "admin" || skill.ownerId === auth.id),
      credentials: allCredentials.filter((credential) => canAccessCredential(auth, credential)).map(credentialToView),
      approvals: allApprovals.filter((approval) => auth.role === "admin" || allowedSessionIds.has(String(approval.payload.sessionId ?? "")))
    };
  });

  app.get("/api/events", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    const unsubscribe = events.subscribe((event) => {
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    request.raw.on("close", unsubscribe);
  });

  app.get("/api/chat/sessions", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const sessions = await store.listSessions();
    return sessions.filter((session) => auth.role === "admin" || session.ownerId === auth.id);
  });

  app.post("/api/chat/sessions", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const body = request.body as { name?: string; workflowId?: string; model?: ModelRef; intelligence?: "off" | "low" | "medium" | "high" };
    if (body.workflowId) {
      const workflow = await store.getWorkflow(body.workflowId);
      if (!workflow) return reply.code(404).send({ error: "workflow not found" });
      if (!canAccessWorkflow(auth, workflow)) return reply.code(403).send({ error: "forbidden workflow access" });
    }
    const session = await store.createSession({ ...body, ownerId: auth.id });
    events.publish("chat.session.created", { sessionId: session.id });
    return session;
  });

  app.patch("/api/chat/sessions/:id", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const params = request.params as { id: string };
    const current = await store.getSession(params.id);
    if (!current) {
      return reply.code(404).send({ error: "session not found" });
    }
    if (auth.role !== "admin" && current.ownerId !== auth.id) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const body = request.body as { name?: string; model?: ModelRef; intelligence?: "off" | "low" | "medium" | "high" };
    const session = await store.updateSession(params.id, body);
    events.publish("chat.session.updated", { sessionId: session.id, model: session.model, intelligence: session.intelligence });
    return session;
  });

  app.get("/api/chat/sessions/:id/messages", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const params = request.params as { id: string };
    const session = await store.getSession(params.id);
    if (!session) return reply.code(404).send({ error: "session not found" });
    if (auth.role !== "admin" && session.ownerId !== auth.id) return reply.code(403).send({ error: "forbidden" });
    return store.listMessages(params.id);
  });

  app.post("/api/chat/sessions/:id/messages", async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as { content?: string; workflowId?: string; selectedNodeId?: string | null; workflow?: Workflow };
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const session = await store.getSession(params.id);
    if (!session) {
      return reply.code(404).send({ error: "session not found" });
    }
    if (auth.role !== "admin" && session.ownerId !== auth.id) return reply.code(403).send({ error: "forbidden" });
    if (session.workflowId && body.workflowId && session.workflowId !== body.workflowId) {
      return reply.code(403).send({ error: "chat session is bound to another canvas" });
    }
    const content = String(body.content ?? "");
    const activeWorkflowId = session.workflowId ?? body.workflowId;
    const activeWorkflow =
      body.workflow && body.workflow.id
        ? body.workflow
          : activeWorkflowId
            ? await store.getWorkflow(activeWorkflowId)
            : (await store.listWorkflows()).find((item) => canAccessWorkflow(auth, item));
    if (activeWorkflow && session.workflowId && activeWorkflow.id !== session.workflowId) {
      return reply.code(403).send({ error: "chat session is bound to another canvas" });
    }
    if (activeWorkflow && !canAccessWorkflow(auth, activeWorkflow)) {
      return reply.code(403).send({ error: "forbidden workflow access" });
    }
    if (activeWorkflow && hasBlockedGitRepoAccess(activeWorkflow, auth)) {
      return reply.code(403).send({ error: "git repo access is isolated to owner or explicitly shared users" });
    }

    const userMessage = await store.addMessage({
      sessionId: session.id,
      role: "user",
      content,
      metadata: {}
    });

    const chatApprovalDecision = findChatApprovalDecision(content, await store.listApprovals(), session.id);
    if (chatApprovalDecision) {
      const approval = await store.decideApproval(chatApprovalDecision.approval.id, chatApprovalDecision.status);
      const assistantMessage = await store.addMessage({
        sessionId: session.id,
        role: "assistant",
        content: buildApprovalDecisionChatContent(approval),
        metadata: { approvalDecision: approval }
      });
      events.publish("approval.decided", { approvalId: approval.id, status: approval.status, source: "chat" });
      events.publish("chat.message.created", { sessionId: session.id, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id });
      return { userMessage, assistantMessage, approval };
    }

    const history = await store.listMessages(session.id);
    const provider = providers.get(session.model.provider);
    if (!provider) {
      throw new Error(`missing provider ${session.model.provider}`);
    }

    let assistantContent: string;
    let metadata: Record<string, unknown> = {};
    let modelActions = activeWorkflow ? inferCanvasActionsFromMessage(content, activeWorkflow, body.selectedNodeId) : [];
    try {
      const response = await provider.generate({
        model: session.model,
        intelligence: session.intelligence,
        messages: history.slice(-20).map((message): ChatMessage => ({ role: message.role, content: message.content })),
        tools: canvasTools,
        system:
          [
            "You are Frostbyte Control Plane, Leeroi Alter's personal cyber/CTF automation console.",
            "Use this chat session model only. Reply directly and briefly. Do not welcome the user, show menus, or use markdown bold.",
            "Help create, run, debug, and approve canvas workflows only when asked.",
            buildSessionLearningPrompt(history),
            buildCanvasSystemPrompt(activeWorkflow, body.selectedNodeId)
          ].join("\n\n")
      });
      assistantContent = cleanAssistantReply(response.content);
      metadata = response.metadata;
      modelActions = canvasActionsFromToolCalls(response.toolCalls);
      if (modelActions.length === 0) {
        modelActions = parseCanvasActionsFromText(response.content);
      }
      if (modelActions.length === 0 && activeWorkflow) {
        modelActions = inferCanvasActionsFromMessage(content, activeWorkflow, body.selectedNodeId);
      }
    } catch (error) {
      assistantContent = `Model call failed: ${error instanceof Error ? error.message : String(error)}`;
      metadata = { error: assistantContent };
    }

    let canvas:
      | {
          workflow: Workflow;
          selectedNodeId?: string | null;
          actions: Array<{ action: string; ok: boolean; message: string; nodeId?: string; edgeId?: string; selectedNodeId?: string | null }>;
          run?: WorkflowRunRecord;
          approval?: ApprovalRecord;
        }
      | undefined;

    if (activeWorkflow && modelActions.length > 0) {
      const applied = applyCanvasActions(activeWorkflow, modelActions, body.selectedNodeId);
      let updatedWorkflow = applied.workflow;
      if (applied.changed) {
        updatedWorkflow = await store.upsertWorkflow({
          ...applied.workflow,
          createdAt: applied.workflow.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        events.publish("workflow.updated", { workflowId: updatedWorkflow.id, source: "chat" });
      }

      const runResult = applied.runRequested
        ? await runWorkflowNow(updatedWorkflow, [{ json: { source: "chat", sessionId: session.id, message: content } }])
        : undefined;

      assistantContent = runResult?.approval
        ? buildApprovalChatContent(runResult.approval, updatedWorkflow, runResult.run)
        : summarizeCanvasResults(applied.results, runResult?.run.status);
      metadata = {
        ...metadata,
        canvas: {
          workflowId: updatedWorkflow.id,
          changed: applied.changed,
          selectedNodeId: applied.selectedNodeId,
          actions: applied.results,
          runId: runResult?.run.id,
          approvalId: runResult?.approval?.id
        },
        ...(runResult?.approval ? { approval: runResult.approval } : {})
      };
      canvas = {
        workflow: updatedWorkflow,
        selectedNodeId: applied.selectedNodeId,
        actions: applied.results,
        ...(runResult ? { run: runResult.run } : {}),
        ...(runResult?.approval ? { approval: runResult.approval } : {})
      };
    } else if (activeWorkflow && metadata.error && asksAboutCanvas(content)) {
      assistantContent = summarizeWorkflowForUser(activeWorkflow);
    }

    const assistantMessage = await store.addMessage({
      sessionId: session.id,
      role: "assistant",
      content: assistantContent,
      metadata
    });

    events.publish("chat.message.created", { sessionId: session.id, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id });
    return { userMessage, assistantMessage, canvas };
  });

  app.get("/api/workflows", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const workflows = await store.listWorkflows();
    return workflows.filter((workflow) => canAccessWorkflow(auth, workflow));
  });

  app.get("/api/users", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    if (auth.role !== "admin") return reply.code(403).send({ error: "admin only" });
    return (await store.listUsers()).map(sanitizeUser);
  });

  app.post("/api/users", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    if (auth.role !== "admin") return reply.code(403).send({ error: "admin only" });
    const body = request.body as { username?: string; password?: string; role?: "admin" | "user" };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const role = body.role === "admin" ? "admin" : "user";
    if (username.length < 3 || password.length < 6) {
      return reply.code(400).send({ error: "username >= 3 chars and password >= 6 chars required" });
    }
    const user = await store.createUser({ username, password, role });
    return sanitizeUser(user);
  });

  app.get("/api/workflows/:id", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const params = request.params as { id: string };
    const workflow = await store.getWorkflow(params.id);
    if (workflow && !canAccessWorkflow(auth, workflow)) return reply.code(403).send({ error: "forbidden" });
    return workflow ?? reply.code(404).send({ error: "workflow not found" });
  });

  app.put("/api/workflows/:id", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const params = request.params as { id: string };
    const body = request.body as Workflow;
    const existing = await store.getWorkflow(params.id);
    if (existing && !canAccessWorkflow(auth, existing)) return reply.code(403).send({ error: "forbidden" });
    const time = new Date().toISOString();
    const ownerId = existing ? workflowOwnerId(existing) : auth.id;
    const workflow = await store.upsertWorkflow({
      ...stampGitRepoOwnership(body, existing, auth),
      id: params.id,
      ownerId,
      sharedWithUserIds: existing ? workflowSharedWithUserIds(existing) : workflowSharedWithUserIds(body),
      sharedWithUsernames: existing ? workflowSharedWithUsernames(existing) : workflowSharedWithUsernames(body),
      updatedAt: time,
      createdAt: body.createdAt ?? time
    } as Workflow);
    events.publish("workflow.updated", { workflowId: workflow.id });
    return workflow;
  });

  app.post("/api/workflows/:id/share", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const params = request.params as { id: string };
    const body = request.body as { username?: string };
    const workflow = await store.getWorkflow(params.id);
    if (!workflow) return reply.code(404).send({ error: "workflow not found" });
    if (!canManageWorkflow(auth, workflow)) return reply.code(403).send({ error: "only owner or admin can share canvas" });
    const user = await store.getUserByUsername(String(body.username ?? ""));
    if (!user) return reply.code(404).send({ error: "user not found" });
    const sharedWithUserIds = [...new Set([...workflowSharedWithUserIds(workflow), user.id])];
    const sharedWithUsernames = [...new Set([...workflowSharedWithUsernames(workflow), user.username])];
    const updated = await store.upsertWorkflow({
      ...(workflow as Workflow),
      sharedWithUserIds,
      sharedWithUsernames,
      updatedAt: new Date().toISOString()
    } as Workflow);
    events.publish("workflow.updated", { workflowId: updated.id, source: "share" });
    return updated;
  });

  app.post("/api/workflows/:id/run", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const params = request.params as { id: string };
    const body = request.body as { input?: Array<{ json: Record<string, unknown> }> };
    const workflow = await store.getWorkflow(params.id);
    if (!workflow) {
      return reply.code(404).send({ error: "workflow not found" });
    }
    if (!canAccessWorkflow(auth, workflow)) return reply.code(403).send({ error: "forbidden" });
    if (hasBlockedGitRepoAccess(workflow, auth)) return reply.code(403).send({ error: "git repo access is isolated to owner or explicitly shared users" });
    const result = await runWorkflowNow(workflow, body.input ?? [{ json: {} }]);
    return result.run;
  });

  app.post("/api/terminal/run", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const body = request.body as { workflowId?: string; nodeId?: string; nodeType?: string; command?: string; timeoutSeconds?: number };
    const workflow = body.workflowId ? await store.getWorkflow(body.workflowId) : undefined;
    if (!workflow) return reply.code(404).send({ error: "workflow not found" });
    if (!canAccessWorkflow(auth, workflow)) return reply.code(403).send({ error: "forbidden workflow access" });
    const node = workflow.nodes.find((candidate) => candidate.id === body.nodeId);
    if (!node) return reply.code(404).send({ error: "node not found" });
    if (body.nodeType && node.type !== body.nodeType) return reply.code(400).send({ error: "node type mismatch" });
    if (!isTerminalNodeType(node.type)) return reply.code(400).send({ error: "node does not support isolated terminal" });
    if (hasBlockedGitNodeAccess(node, workflow, auth)) return reply.code(403).send({ error: "git repo access is isolated to owner or explicitly shared users" });
    if (auth.role !== "admin" && node.config.requiresApproval !== false) {
      return reply.code(403).send({ error: "terminal command requires approval or admin access" });
    }
    const result = await runIsolatedTerminalCommand({
      nodeId: String(body.nodeId ?? ""),
      nodeType: node.type,
      command: String(body.command ?? ""),
      timeoutSeconds: body.timeoutSeconds
    });
    events.publish("terminal.command.finished", {
      nodeId: result.nodeId,
      nodeType: result.nodeType,
      exitCode: result.exitCode,
      timedOut: result.timedOut
    });
    return result;
  });

  app.get("/api/runs", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const query = request.query as { workflowId?: string };
    const runs = await store.listRuns(query.workflowId);
    if (auth.role === "admin") return runs;
    const ownedIds = new Set((await store.listWorkflows()).filter((workflow) => canAccessWorkflow(auth, workflow)).map((workflow) => workflow.id));
    return runs.filter((run) => ownedIds.has(run.workflowId));
  });

  app.get("/api/agents", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    return store.listAgents();
  });

  app.post("/api/skills", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const body = request.body as {
      id?: string;
      type?: "skill" | "soul" | "personality";
      name?: string;
      instructions?: string;
      soul?: string;
      personality?: string;
      toolNames?: string[];
    };
    const type = body.type === "soul" || body.type === "personality" ? body.type : "skill";
    const name = String(body.name ?? "").trim();
    if (!name) return reply.code(400).send({ error: "skill name required" });
    const existing = body.id ? await store.getSkill(body.id) : undefined;
    if (existing && !canManageSkill(auth, existing)) return reply.code(403).send({ error: "only owner or admin can edit skill" });
    const skill = await store.upsertSkill({
      id: existing?.id,
      ownerId: existing?.ownerId ?? auth.id,
      type,
      name,
      instructions: typeof body.instructions === "string" ? body.instructions : undefined,
      soul: typeof body.soul === "string" ? body.soul : undefined,
      personality: typeof body.personality === "string" ? body.personality : undefined,
      toolNames: Array.isArray(body.toolNames) ? body.toolNames.map(String) : []
    });
    return skill;
  });

  app.delete("/api/skills/:id", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const params = request.params as { id: string };
    const skill = await store.getSkill(params.id);
    if (!skill) return reply.code(404).send({ error: "skill not found" });
    if (!canManageSkill(auth, skill)) return reply.code(403).send({ error: "only owner or admin can delete skill" });
    await store.deleteSkill(params.id);
    return { ok: true };
  });

  app.get("/api/credentials", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    return (await store.listCredentials()).filter((credential) => canAccessCredential(auth, credential)).map(credentialToView);
  });

  app.post("/api/credentials", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const body = request.body as {
      id?: string;
      name?: string;
      service?: string;
      authType?: CredentialRecord["authType"];
      data?: Record<string, unknown>;
      sharedWithUsernames?: string[];
    };
    const existing = body.id ? await store.getCredential(body.id) : undefined;
    if (existing && !canManageCredential(auth, existing)) return reply.code(403).send({ error: "only owner or admin can edit credential" });
    const name = String(body.name ?? "").trim();
    const service = String(body.service ?? "").trim();
    if (!name || !service) return reply.code(400).send({ error: "credential name and service required" });
    const authType = isCredentialAuthType(body.authType) ? body.authType : "apiKey";
    const data = typeof body.data === "object" && body.data && !Array.isArray(body.data) ? body.data : {};
    if (Object.keys(data).length === 0) return reply.code(400).send({ error: "credential data required" });
    const credential = await store.upsertCredential({
      id: existing?.id,
      ownerId: existing?.ownerId ?? auth.id,
      name,
      service,
      authType,
      data,
      sharedWithUserIds: existing?.sharedWithUserIds ?? [],
      sharedWithUsernames: body.sharedWithUsernames?.map(String) ?? existing?.sharedWithUsernames ?? [],
      createdAt: existing?.createdAt
    });
    return credentialToView(credential);
  });

  app.delete("/api/credentials/:id", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const params = request.params as { id: string };
    const credential = await store.getCredential(params.id);
    if (!credential) return reply.code(404).send({ error: "credential not found" });
    if (!canManageCredential(auth, credential)) return reply.code(403).send({ error: "only owner or admin can delete credential" });
    await store.deleteCredential(params.id);
    return { ok: true };
  });

  app.put("/api/agents/:id", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    if (auth.role !== "admin") return reply.code(403).send({ error: "admin only" });
    const params = request.params as { id: string };
    const agent = await store.upsertAgent({ ...(request.body as AgentProfile), id: params.id });
    events.publish("agent.updated", { agentId: agent.id });
    return agent;
  });

  app.get("/api/approvals", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const approvals = await store.listApprovals();
    return filterApprovalsForUser(approvals, auth, store);
  });

  app.post("/api/approvals/:id/decision", async (request, reply) => {
    const auth = await requireUser(request, reply, store, authSecret);
    if (!auth) return;
    const params = request.params as { id: string };
    const body = request.body as { status: "approved" | "rejected" };
    const existing = (await store.listApprovals()).find((item) => item.id === params.id);
    if (!existing) return reply.code(404).send({ error: "approval not found" });
    if (!(await canAccessApproval(auth, existing, store))) return reply.code(403).send({ error: "forbidden approval access" });
    const approval = await store.decideApproval(params.id, body.status);
    events.publish("approval.decided", { approvalId: approval.id, status: approval.status });
    const sessionId = typeof approval.payload.sessionId === "string" ? approval.payload.sessionId : undefined;
    const message = sessionId
      ? await store.addMessage({
          sessionId,
          role: "assistant",
          content: buildApprovalDecisionChatContent(approval),
          metadata: { approvalDecision: approval }
        })
      : undefined;
    return { approval, message };
  });

  app.post("/webhooks/telegram/:credentialId", async (request) => {
    const params = request.params as { credentialId: string };
    events.publish("channel.telegram.inbound", { credentialId: params.credentialId, update: request.body as Record<string, unknown> });
    return { ok: true };
  });

  app.get("/webhooks/whatsapp/:credentialId", async (request, reply) => {
    const query = request.query as Record<string, string>;
    if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === env.whatsappVerifyToken) {
      return reply.type("text/plain").send(query["hub.challenge"] ?? "");
    }
    return reply.code(403).send("verification failed");
  });

  app.post("/webhooks/whatsapp/:credentialId", async (request) => {
    const params = request.params as { credentialId: string };
    events.publish("channel.whatsapp.inbound", { credentialId: params.credentialId, update: request.body as Record<string, unknown> });
    return { ok: true };
  });
}

type AuthUser = { id: string; username: string; role: "admin" | "user" };

function signToken(user: AuthUser, secret: string): string {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(token: string, secret: string): AuthUser | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (expected !== signature) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthUser;
  } catch {
    return null;
  }
}

async function requireUser(request: FastifyRequest, reply: FastifyReply, store: AppStore, secret: string): Promise<AuthUser | null> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    reply.code(401).send({ error: "missing auth token" });
    return null;
  }
  const decoded = verifyToken(header.slice("Bearer ".length), secret);
  if (!decoded) {
    reply.code(401).send({ error: "invalid auth token" });
    return null;
  }
  const user = await store.getUserById(decoded.id);
  if (!user) {
    reply.code(401).send({ error: "user not found" });
    return null;
  }
  return { id: user.id, username: user.username, role: user.role };
}

function sanitizeUser(user: { id: string; username: string; role: "admin" | "user" }) {
  return { id: user.id, username: user.username, role: user.role };
}

function canAccessWorkflow(user: AuthUser, workflow: Workflow): boolean {
  return canManageWorkflow(user, workflow) || workflowSharedWithUserIds(workflow).includes(user.id) || workflowSharedWithUsernames(workflow).includes(user.username);
}

function canManageWorkflow(user: AuthUser, workflow: Workflow): boolean {
  return user.role === "admin" || workflowOwnerId(workflow) === user.id;
}

function canAccessCredential(user: AuthUser, credential: CredentialRecord): boolean {
  return (
    canManageCredential(user, credential) ||
    credential.sharedWithUserIds.includes(user.id) ||
    credential.sharedWithUsernames.includes(user.username)
  );
}

function canManageCredential(user: AuthUser, credential: CredentialRecord): boolean {
  return user.role === "admin" || credential.ownerId === user.id;
}

function canManageSkill(user: AuthUser, skill: { ownerId: string }): boolean {
  return user.role === "admin" || skill.ownerId === user.id;
}

function credentialToView(credential: CredentialRecord): CredentialView {
  return {
    id: credential.id,
    ownerId: credential.ownerId,
    name: credential.name,
    service: credential.service,
    authType: credential.authType,
    fields: credential.fields,
    sharedWithUserIds: credential.sharedWithUserIds,
    sharedWithUsernames: credential.sharedWithUsernames,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt
  };
}

function isCredentialAuthType(value: unknown): value is CredentialRecord["authType"] {
  return ["apiKey", "oauth2", "basic", "token", "sshKey", "custom"].includes(String(value));
}

function workflowOwnerId(workflow: Workflow): string {
  const candidate = (workflow as unknown as Record<string, unknown>).ownerId;
  return typeof candidate === "string" && candidate ? candidate : "system";
}

function workflowSharedWithUserIds(workflow: Workflow): string[] {
  const candidate = (workflow as unknown as Record<string, unknown>).sharedWithUserIds;
  return Array.isArray(candidate) ? candidate.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
}

function workflowSharedWithUsernames(workflow: Workflow): string[] {
  const candidate = (workflow as unknown as Record<string, unknown>).sharedWithUsernames;
  return Array.isArray(candidate) ? candidate.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
}

function stampGitRepoOwnership(workflow: Workflow, existing: Workflow | undefined, user: AuthUser): Workflow {
  const existingNodes = new Map((existing?.nodes ?? []).map((node) => [node.id, node]));
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => {
      if (node.type !== "git.action") return node;
      const existingNode = existingNodes.get(node.id);
      const existingConfig = existingNode?.config ?? {};
      return {
        ...node,
        config: {
          ...node.config,
          repoOwnerId: typeof existingConfig.repoOwnerId === "string" ? existingConfig.repoOwnerId : typeof node.config.repoOwnerId === "string" ? node.config.repoOwnerId : user.id,
          repoSharedWithUserIds: Array.isArray(existingConfig.repoSharedWithUserIds) ? existingConfig.repoSharedWithUserIds : node.config.repoSharedWithUserIds ?? [],
          repoSharedWithUsernames: Array.isArray(existingConfig.repoSharedWithUsernames) ? existingConfig.repoSharedWithUsernames : node.config.repoSharedWithUsernames ?? []
        }
      };
    })
  };
}

function hasBlockedGitRepoAccess(workflow: Workflow, user: AuthUser): boolean {
  if (user.role === "admin") return false;
  return workflow.nodes.some((node) => hasBlockedGitNodeAccess(node, workflow, user));
}

function hasBlockedGitNodeAccess(node: WorkflowNode, workflow: Workflow, user: AuthUser): boolean {
  if (user.role === "admin" || node.type !== "git.action") return false;
  const operation = String(node.config.operation ?? "status");
  if (!["pull", "push", "commit"].includes(operation)) return false;
  const repoOwnerId = typeof node.config.repoOwnerId === "string" ? node.config.repoOwnerId : workflowOwnerId(workflow);
  const sharedIds = Array.isArray(node.config.repoSharedWithUserIds) ? node.config.repoSharedWithUserIds : [];
  const sharedNames = Array.isArray(node.config.repoSharedWithUsernames) ? node.config.repoSharedWithUsernames : [];
  return repoOwnerId !== user.id && !sharedIds.includes(user.id) && !sharedNames.includes(user.username);
}

function isTerminalNodeType(type: string): boolean {
  return (
    type.startsWith("code.") ||
    ["shell.action", "ssh.action", "git.action", "file.action", "test.run", "database.query", "docker.action"].includes(type)
  );
}

async function filterApprovalsForUser(approvals: ApprovalRecord[], user: AuthUser, store: AppStore): Promise<ApprovalRecord[]> {
  const allowed: ApprovalRecord[] = [];
  for (const approval of approvals) {
    if (await canAccessApproval(user, approval, store)) {
      allowed.push(approval);
    }
  }
  return allowed;
}

async function canAccessApproval(user: AuthUser, approval: ApprovalRecord, store: AppStore): Promise<boolean> {
  if (user.role === "admin") return true;
  const sessionId = typeof approval.payload.sessionId === "string" ? approval.payload.sessionId : undefined;
  if (sessionId) {
    const session = await store.getSession(sessionId);
    if (session?.ownerId === user.id) return true;
  }
  const workflowId = typeof approval.payload.workflowId === "string" ? approval.payload.workflowId : undefined;
  if (workflowId) {
    const workflow = await store.getWorkflow(workflowId);
    if (workflow && canAccessWorkflow(user, workflow)) return true;
  }
  return false;
}

function cleanAssistantReply(content: string): string {
  return content.replace(/\*\*(.*?)\*\*/g, "$1").trim();
}

function asksAboutCanvas(content: string): boolean {
  return /\b(canvas|workflow|flow|nodes?|connections?|edges?)\b/i.test(content);
}

function buildApprovalChatContent(approval: ApprovalRecord, workflow: Workflow, run: WorkflowRunRecord): string {
  const nodeContext = typeof approval.payload.nodeId === "string" ? `Node: ${approval.payload.nodeId}` : "Node: approval point";
  const request = typeof approval.payload.request === "string" && approval.payload.request.trim() ? `Request: ${approval.payload.request}` : "";
  return [
    "Approval needed.",
    approval.message,
    `Workflow: ${workflow.name}`,
    nodeContext,
    `Run: ${run.id}`,
    request,
    "Choose Approve or Deny."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildApprovalDecisionChatContent(approval: ApprovalRecord): string {
  const workflowName = typeof approval.payload.workflowName === "string" ? approval.payload.workflowName : "workflow";
  const runId = typeof approval.payload.runId === "string" ? approval.payload.runId : approval.id;
  return `${approval.status === "approved" ? "Approved" : "Denied"} approval for ${workflowName}.\nRun: ${runId}`;
}

function findChatApprovalDecision(
  content: string,
  approvals: ApprovalRecord[],
  sessionId: string
): { approval: ApprovalRecord; status: "approved" | "rejected" } | null {
  const lower = content.trim().toLowerCase();
  const status = /\b(approve|approved|yes|allow|accept)\b/.test(lower)
    ? "approved"
    : /\b(deny|denied|reject|rejected|no|block)\b/.test(lower)
      ? "rejected"
      : null;
  if (!status) {
    return null;
  }
  const approval = approvals.find(
    (item) => item.status === "pending" && typeof item.payload.sessionId === "string" && item.payload.sessionId === sessionId
  );
  return approval ? { approval, status } : null;
}

function buildSessionLearningPrompt(history: StoredMessage[]): string {
  const learned = history
    .filter((message) => message.role === "assistant" && typeof message.metadata.canvas === "object" && message.metadata.canvas !== null)
    .slice(-6)
    .map((message) => {
      const canvas = message.metadata.canvas as {
        workflowId?: string;
        actions?: Array<{ action?: string; ok?: boolean; message?: string }>;
      };
      const actions = Array.isArray(canvas.actions)
        ? canvas.actions
            .filter((action) => action.ok !== false)
            .map((action) => action.message || action.action)
            .filter(Boolean)
            .join("; ")
        : "";
      return actions ? `- ${actions}` : "";
    })
    .filter(Boolean);

  return [
    "Session pattern memory:",
    learned.length > 0 ? learned.join("\n") : "- No prior canvas edits in this chat yet.",
    "Use this memory as examples of the user's preferred workflow style, but still adapt to the latest request."
  ].join("\n");
}
