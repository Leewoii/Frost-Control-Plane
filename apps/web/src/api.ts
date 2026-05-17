import type { AppState, ApprovalRecord, AuthResult, AuthStatus, ChatSendResult, ChatSession, CredentialView, ModelRef, SavedSkillAsset, StoredMessage, TerminalRunResult, Workflow, WorkflowRunRecord } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4310";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("baryon.auth.token");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export const api = {
  authStatus: () => request<AuthStatus>("/api/auth/status"),
  login: (username: string, password: string) =>
    request<AuthResult>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  bootstrapAdmin: (username: string, password: string) =>
    request<AuthResult>("/api/auth/bootstrap-admin", { method: "POST", body: JSON.stringify({ username, password }) }),
  createUser: (username: string, password: string, role: "admin" | "user" = "user") =>
    request<{ id: string; username: string; role: "admin" | "user" }>("/api/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role })
    }),
  state: () => request<AppState>("/api/state"),
  saveSkill: (input: {
    id?: string;
    type: "skill" | "soul" | "personality";
    name: string;
    instructions?: string;
    soul?: string;
    personality?: string;
    toolNames?: string[];
  }) =>
    request<SavedSkillAsset>("/api/skills", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  deleteSkill: (id: string) =>
    request<{ ok: true }>(`/api/skills/${id}`, {
      method: "DELETE"
    }),
  saveCredential: (input: {
    id?: string;
    name: string;
    service: string;
    authType: CredentialView["authType"];
    data: Record<string, unknown>;
    sharedWithUsernames?: string[];
  }) =>
    request<CredentialView>("/api/credentials", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  deleteCredential: (id: string) =>
    request<{ ok: true }>(`/api/credentials/${id}`, {
      method: "DELETE"
    }),
  createSession: (name: string, model: ModelRef, intelligence: "off" | "low" | "medium" | "high", workflowId?: string) =>
    request<ChatSession>("/api/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ name, model, intelligence, workflowId })
    }),
  messages: (sessionId: string) => request<StoredMessage[]>(`/api/chat/sessions/${sessionId}/messages`),
  sendMessage: (sessionId: string, content: string, context?: { workflow?: Workflow; workflowId?: string; selectedNodeId?: string | null }) =>
    request<ChatSendResult>(`/api/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, workflowId: context?.workflowId, selectedNodeId: context?.selectedNodeId, workflow: context?.workflow })
    }),
  updateSession: (sessionId: string, patch: { model?: ModelRef; intelligence?: "off" | "low" | "medium" | "high"; name?: string }) =>
    request<ChatSession>(`/api/chat/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  decideApproval: (approvalId: string, status: "approved" | "rejected") =>
    request<{ approval: ApprovalRecord; message?: StoredMessage }>(`/api/approvals/${approvalId}/decision`, {
      method: "POST",
      body: JSON.stringify({ status })
    }),
  saveWorkflow: (workflow: Workflow) =>
    request<Workflow>(`/api/workflows/${workflow.id}`, {
      method: "PUT",
      body: JSON.stringify(workflow)
    }),
  shareWorkflow: (workflowId: string, username: string) =>
    request<Workflow>(`/api/workflows/${workflowId}/share`, {
      method: "POST",
      body: JSON.stringify({ username })
    }),
  runWorkflow: (workflowId: string, input: Record<string, unknown>) =>
    request<WorkflowRunRecord>(`/api/workflows/${workflowId}/run`, {
      method: "POST",
      body: JSON.stringify({ input: [{ json: input }] })
    }),
  runTerminal: (input: { workflowId: string; nodeId: string; nodeType: string; command: string; timeoutSeconds?: number }) =>
    request<TerminalRunResult>("/api/terminal/run", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  runs: () => request<WorkflowRunRecord[]>("/api/runs")
};
