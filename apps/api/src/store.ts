import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { defaultAgentPolicy, type AgentProfile, type Intelligence, type ModelRef, type Workflow } from "@baryon/core";
import type { ApprovalRecord, ChatSession, CredentialRecord, EncryptedSecret, SavedSkillAsset, StoredMessage, UserRecord, WorkflowRunRecord } from "./domain.js";

export interface AppStore {
  init(): Promise<void>;
  listUsers(): Promise<UserRecord[]>;
  getUserById(id: string): Promise<UserRecord | undefined>;
  getUserByUsername(username: string): Promise<UserRecord | undefined>;
  createUser(input: { username: string; password: string; role?: "admin" | "user" }): Promise<UserRecord>;
  authenticate(username: string, password: string): Promise<UserRecord | undefined>;
  listSessions(): Promise<ChatSession[]>;
  createSession(input: Partial<ChatSession>): Promise<ChatSession>;
  getSession(id: string): Promise<ChatSession | undefined>;
  updateSession(id: string, patch: Partial<Pick<ChatSession, "model" | "intelligence" | "name">>): Promise<ChatSession>;
  listMessages(sessionId: string): Promise<StoredMessage[]>;
  addMessage(message: Omit<StoredMessage, "id" | "createdAt">): Promise<StoredMessage>;
  listWorkflows(): Promise<Workflow[]>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  upsertWorkflow(workflow: Workflow): Promise<Workflow>;
  saveRun(run: WorkflowRunRecord): Promise<WorkflowRunRecord>;
  listRuns(workflowId?: string): Promise<WorkflowRunRecord[]>;
  listAgents(): Promise<AgentProfile[]>;
  upsertAgent(agent: AgentProfile): Promise<AgentProfile>;
  listSkills(): Promise<SavedSkillAsset[]>;
  getSkill(id: string): Promise<SavedSkillAsset | undefined>;
  upsertSkill(skill: Partial<SavedSkillAsset> & Pick<SavedSkillAsset, "ownerId" | "type" | "name" | "toolNames">): Promise<SavedSkillAsset>;
  deleteSkill(id: string): Promise<void>;
  listCredentials(): Promise<CredentialRecord[]>;
  getCredential(id: string): Promise<CredentialRecord | undefined>;
  upsertCredential(credential: Partial<CredentialRecord> & Pick<CredentialRecord, "ownerId" | "name" | "service" | "authType"> & { data: Record<string, unknown> }): Promise<CredentialRecord>;
  deleteCredential(id: string): Promise<void>;
  createApproval(input: Pick<ApprovalRecord, "message" | "payload">): Promise<ApprovalRecord>;
  listApprovals(): Promise<ApprovalRecord[]>;
  decideApproval(id: string, status: "approved" | "rejected"): Promise<ApprovalRecord>;
}

const now = () => new Date().toISOString();
const defaultStateFile = fileURLToPath(new URL("../../../data/app-state.json", import.meta.url));

export function createStore(databaseUrl?: string): AppStore {
  return databaseUrl ? new PgStore(databaseUrl) : new MemoryStore(process.env.BARYON_STATE_FILE ?? defaultStateFile);
}

class MemoryStore implements AppStore {
  private users: UserRecord[] = [];
  private sessions: ChatSession[] = [];
  private messages: StoredMessage[] = [];
  private workflows: Workflow[] = [];
  private runs: WorkflowRunRecord[] = [];
  private agents: AgentProfile[] = [];
  private skills: SavedSkillAsset[] = [];
  private credentials: CredentialRecord[] = [];
  private approvals: ApprovalRecord[] = [];

  constructor(private readonly stateFile: string) {}

  async init() {
    const loaded = await this.load();
    if (!loaded) {
      await seedMemory(this);
      await this.persist();
    }
  }

  async listSessions() {
    return this.sessions;
  }

  async listUsers() {
    return this.users;
  }

  async getUserById(id: string) {
    return this.users.find((user) => user.id === id);
  }

  async getUserByUsername(username: string) {
    const normalized = username.trim().toLowerCase();
    return this.users.find((user) => user.username.toLowerCase() === normalized);
  }

  async createUser(input: { username: string; password: string; role?: "admin" | "user" }) {
    const existing = await this.getUserByUsername(input.username);
    if (existing) {
      throw new Error("username already exists");
    }
    const time = now();
    const user: UserRecord = {
      id: crypto.randomUUID(),
      username: input.username.trim(),
      role: input.role ?? "user",
      passwordHash: hashPassword(input.password),
      createdAt: time,
      updatedAt: time
    };
    this.users.push(user);
    await this.persist();
    return user;
  }

  async authenticate(username: string, password: string) {
    const user = await this.getUserByUsername(username);
    if (!user) {
      return undefined;
    }
    return verifyPassword(password, user.passwordHash) ? user : undefined;
  }

  async createSession(input: Partial<ChatSession>) {
    const time = now();
    const model = input.model ?? defaultChatModel();
    const session: ChatSession = {
      id: input.id ?? crypto.randomUUID(),
      ownerId: input.ownerId ?? "system",
      workflowId: input.workflowId,
      name: input.name ?? "Local chat",
      model,
      intelligence: input.intelligence ?? defaultIntelligenceForModel(model),
      createdAt: time,
      updatedAt: time
    };
    this.sessions.push(session);
    await this.persist();
    return session;
  }

  async getSession(id: string) {
    return this.sessions.find((session) => session.id === id);
  }

  async updateSession(id: string, patch: Partial<Pick<ChatSession, "model" | "intelligence" | "name">>) {
    const session = await this.getSession(id);
    if (!session) {
      throw new Error("session not found");
    }
    Object.assign(session, patch, { updatedAt: now() });
    await this.persist();
    return session;
  }

  async listMessages(sessionId: string) {
    return this.messages.filter((message) => message.sessionId === sessionId);
  }

  async addMessage(message: Omit<StoredMessage, "id" | "createdAt">) {
    const stored = { ...message, id: crypto.randomUUID(), createdAt: now() };
    this.messages.push(stored);
    await this.persist();
    return stored;
  }

  async listWorkflows() {
    return this.workflows;
  }

  async getWorkflow(id: string) {
    return this.workflows.find((workflow) => workflow.id === id);
  }

  async upsertWorkflow(workflow: Workflow) {
    const index = this.workflows.findIndex((item) => item.id === workflow.id);
    if (index >= 0) {
      this.workflows[index] = workflow;
    } else {
      this.workflows.push(workflow);
    }
    await this.persist();
    return workflow;
  }

  async saveRun(run: WorkflowRunRecord) {
    this.runs.unshift(run);
    await this.persist();
    return run;
  }

  async listRuns(workflowId?: string) {
    return workflowId ? this.runs.filter((run) => run.workflowId === workflowId) : this.runs;
  }

  async listAgents() {
    return this.agents;
  }

  async upsertAgent(agent: AgentProfile) {
    const index = this.agents.findIndex((item) => item.id === agent.id);
    if (index >= 0) {
      this.agents[index] = agent;
    } else {
      this.agents.push(agent);
    }
    await this.persist();
    return agent;
  }

  async listSkills() {
    return this.skills;
  }

  async getSkill(id: string) {
    return this.skills.find((skill) => skill.id === id);
  }

  async upsertSkill(input: Partial<SavedSkillAsset> & Pick<SavedSkillAsset, "ownerId" | "type" | "name" | "toolNames">) {
    const time = now();
    const skill: SavedSkillAsset = {
      id: input.id ?? crypto.randomUUID(),
      ownerId: input.ownerId,
      type: input.type,
      name: input.name,
      instructions: input.instructions,
      soul: input.soul,
      personality: input.personality,
      toolNames: input.toolNames,
      createdAt: input.createdAt ?? time,
      updatedAt: time
    };
    const index = this.skills.findIndex((item) => item.id === skill.id);
    if (index >= 0) this.skills[index] = skill;
    else this.skills.unshift(skill);
    await this.persist();
    return skill;
  }

  async deleteSkill(id: string) {
    this.skills = this.skills.filter((skill) => skill.id !== id);
    await this.persist();
  }

  async listCredentials() {
    return this.credentials;
  }

  async getCredential(id: string) {
    return this.credentials.find((credential) => credential.id === id);
  }

  async upsertCredential(input: Partial<CredentialRecord> & Pick<CredentialRecord, "ownerId" | "name" | "service" | "authType"> & { data: Record<string, unknown> }) {
    const time = now();
    const credential: CredentialRecord = {
      id: input.id ?? crypto.randomUUID(),
      ownerId: input.ownerId,
      name: input.name,
      service: input.service,
      authType: input.authType,
      fields: Object.keys(input.data).sort(),
      encryptedData: encryptSecret(input.data),
      sharedWithUserIds: input.sharedWithUserIds ?? [],
      sharedWithUsernames: input.sharedWithUsernames ?? [],
      createdAt: input.createdAt ?? time,
      updatedAt: time
    };
    const index = this.credentials.findIndex((item) => item.id === credential.id);
    if (index >= 0) this.credentials[index] = credential;
    else this.credentials.unshift(credential);
    await this.persist();
    return credential;
  }

  async deleteCredential(id: string) {
    this.credentials = this.credentials.filter((credential) => credential.id !== id);
    await this.persist();
  }

  async createApproval(input: Pick<ApprovalRecord, "message" | "payload">) {
    const time = now();
    const approval: ApprovalRecord = {
      id: crypto.randomUUID(),
      status: "pending",
      message: input.message,
      payload: input.payload,
      createdAt: time,
      updatedAt: time
    };
    this.approvals.unshift(approval);
    await this.persist();
    return approval;
  }

  async listApprovals() {
    return this.approvals;
  }

  async decideApproval(id: string, status: "approved" | "rejected") {
    const approval = this.approvals.find((item) => item.id === id);
    if (!approval) {
      throw new Error("approval not found");
    }
    approval.status = status;
    approval.updatedAt = now();
    await this.persist();
    return approval;
  }

  private async load(): Promise<boolean> {
    try {
      const raw = await readFile(this.stateFile, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      this.users = Array.isArray(parsed.users) ? parsed.users : [];
      this.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      this.messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      this.workflows = Array.isArray(parsed.workflows) ? parsed.workflows : [];
      this.runs = Array.isArray(parsed.runs) ? parsed.runs : [];
      this.agents = Array.isArray(parsed.agents) ? parsed.agents : [];
      this.skills = Array.isArray(parsed.skills) ? parsed.skills : [];
      this.credentials = Array.isArray(parsed.credentials) ? parsed.credentials : [];
      this.approvals = Array.isArray(parsed.approvals) ? parsed.approvals : [];
      this.migrateLegacyModelProvider();
      await this.persist();
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  private async persist() {
    await mkdir(dirname(this.stateFile), { recursive: true });
    const state: PersistedState = {
      version: 1,
      users: this.users,
      sessions: this.sessions,
      messages: this.messages,
      workflows: this.workflows,
      runs: this.runs,
      agents: this.agents,
      skills: this.skills,
      credentials: this.credentials,
      approvals: this.approvals
    };
    await writeFile(this.stateFile, `${JSON.stringify(state, null, 2)}\n`);
  }

  private migrateLegacyModelProvider() {
    this.sessions = this.sessions.map((session) => ({
      ...session,
      ownerId: session.ownerId ?? "system",
      workflowId: session.workflowId ?? firstWorkflowIdForOwner(this.workflows, session.ownerId ?? "system"),
      model: normalizeModelRef(session.model),
      intelligence: session.model.provider === "ollama" ? "off" : session.intelligence
    }));
    this.agents = this.agents.map((agent) => ({
      ...agent,
      model: normalizeModelRef(agent.model),
      intelligence: agent.model.provider === "ollama" ? "off" : agent.intelligence
    }));
    this.workflows = this.workflows.map((workflow) => ({
      ...workflow,
      nodes: workflow.nodes.map((node) => {
        const model = normalizeUnknownModel(node.config.model);
        return model
          ? {
              ...node,
              config: {
                ...node.config,
                model,
                intelligence: model.provider === "ollama" ? "off" : node.config.intelligence
              }
            }
          : node;
      })
    }));
  }
}

interface PersistedState {
  version: 1;
  users: UserRecord[];
  sessions: ChatSession[];
  messages: StoredMessage[];
  workflows: Workflow[];
  runs: WorkflowRunRecord[];
  agents: AgentProfile[];
  skills: SavedSkillAsset[];
  credentials: CredentialRecord[];
  approvals: ApprovalRecord[];
}

class PgStore implements AppStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async init() {
    await this.pool.query(`
      create table if not exists chat_sessions (
        id text primary key,
        owner_id text not null,
        workflow_id text,
        name text not null,
        model jsonb not null,
        intelligence text not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists users (
        id text primary key,
        username text not null unique,
        role text not null,
        password_hash text not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists chat_messages (
        id text primary key,
        session_id text not null,
        role text not null,
        content text not null,
        metadata jsonb not null,
        created_at timestamptz not null
      );
      create table if not exists workflows (
        id text primary key,
        document jsonb not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists workflow_runs (
        id text primary key,
        workflow_id text not null,
        status text not null,
        items jsonb not null,
        node_outputs jsonb not null default '{}',
        audit jsonb not null,
        error text,
        created_at timestamptz not null
      );
      create table if not exists agents (
        id text primary key,
        document jsonb not null,
        updated_at timestamptz not null
      );
      create table if not exists skills (
        id text primary key,
        owner_id text not null,
        document jsonb not null,
        updated_at timestamptz not null
      );
      create table if not exists credentials (
        id text primary key,
        owner_id text not null,
        document jsonb not null,
        updated_at timestamptz not null
      );
      create table if not exists approvals (
        id text primary key,
        status text not null,
        message text not null,
        payload jsonb not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
    `);
    await this.pool.query("alter table chat_sessions add column if not exists owner_id text");
    await this.pool.query("alter table chat_sessions add column if not exists workflow_id text");
    await this.pool.query("alter table workflow_runs add column if not exists node_outputs jsonb not null default '{}'");
    await this.pool.query("update chat_sessions set owner_id = coalesce(owner_id, 'system') where owner_id is null");
    await this.pool.query("alter table chat_sessions alter column owner_id set not null");
    const { rowCount } = await this.pool.query("select id from workflows limit 1");
    if (rowCount === 0) {
      await seedMemory(this);
    }
  }

  async listSessions() {
    const { rows } = await this.pool.query("select * from chat_sessions order by created_at desc");
    return rows.map(rowToSession);
  }

  async listUsers() {
    const { rows } = await this.pool.query("select * from users order by created_at asc");
    return rows.map(rowToUser);
  }

  async getUserById(id: string) {
    const { rows } = await this.pool.query("select * from users where id = $1", [id]);
    return rows[0] ? rowToUser(rows[0]) : undefined;
  }

  async getUserByUsername(username: string) {
    const { rows } = await this.pool.query("select * from users where lower(username) = lower($1)", [username.trim()]);
    return rows[0] ? rowToUser(rows[0]) : undefined;
  }

  async createUser(input: { username: string; password: string; role?: "admin" | "user" }) {
    const existing = await this.getUserByUsername(input.username);
    if (existing) {
      throw new Error("username already exists");
    }
    const time = now();
    const user: UserRecord = {
      id: crypto.randomUUID(),
      username: input.username.trim(),
      role: input.role ?? "user",
      passwordHash: hashPassword(input.password),
      createdAt: time,
      updatedAt: time
    };
    await this.pool.query(
      "insert into users (id, username, role, password_hash, created_at, updated_at) values ($1, $2, $3, $4, $5, $6)",
      [user.id, user.username, user.role, user.passwordHash, user.createdAt, user.updatedAt]
    );
    return user;
  }

  async authenticate(username: string, password: string) {
    const user = await this.getUserByUsername(username);
    if (!user) {
      return undefined;
    }
    return verifyPassword(password, user.passwordHash) ? user : undefined;
  }

  async createSession(input: Partial<ChatSession>) {
    const time = now();
    const model = input.model ?? defaultChatModel();
    const session: ChatSession = {
      id: input.id ?? crypto.randomUUID(),
      ownerId: input.ownerId ?? "system",
      workflowId: input.workflowId,
      name: input.name ?? "Local chat",
      model,
      intelligence: input.intelligence ?? defaultIntelligenceForModel(model),
      createdAt: time,
      updatedAt: time
    };
    await this.pool.query(
      "insert into chat_sessions (id, owner_id, workflow_id, name, model, intelligence, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $7, $8)",
      [session.id, session.ownerId, session.workflowId ?? null, session.name, session.model, session.intelligence, session.createdAt, session.updatedAt]
    );
    return session;
  }

  async getSession(id: string) {
    const { rows } = await this.pool.query("select * from chat_sessions where id = $1", [id]);
    return rows[0] ? rowToSession(rows[0]) : undefined;
  }

  async updateSession(id: string, patch: Partial<Pick<ChatSession, "model" | "intelligence" | "name">>) {
    const session = await this.getSession(id);
    if (!session) {
      throw new Error("session not found");
    }
    const updated = { ...session, ...patch, updatedAt: now() };
    await this.pool.query(
      "update chat_sessions set name = $2, model = $3, intelligence = $4, updated_at = $5 where id = $1",
      [id, updated.name, updated.model, updated.intelligence, updated.updatedAt]
    );
    return updated;
  }

  async listMessages(sessionId: string) {
    const { rows } = await this.pool.query("select * from chat_messages where session_id = $1 order by created_at asc", [sessionId]);
    return rows.map(rowToMessage);
  }

  async addMessage(message: Omit<StoredMessage, "id" | "createdAt">) {
    const stored: StoredMessage = { ...message, id: crypto.randomUUID(), createdAt: now() };
    await this.pool.query(
      "insert into chat_messages (id, session_id, role, content, metadata, created_at) values ($1, $2, $3, $4, $5, $6)",
      [stored.id, stored.sessionId, stored.role, stored.content, stored.metadata, stored.createdAt]
    );
    return stored;
  }

  async listWorkflows() {
    const { rows } = await this.pool.query("select document from workflows order by updated_at desc");
    return rows.map((row) => row.document as Workflow);
  }

  async getWorkflow(id: string) {
    const { rows } = await this.pool.query("select document from workflows where id = $1", [id]);
    return rows[0]?.document as Workflow | undefined;
  }

  async upsertWorkflow(workflow: Workflow) {
    await this.pool.query(
      `insert into workflows (id, document, created_at, updated_at)
       values ($1, $2, $3, $4)
       on conflict (id) do update set document = excluded.document, updated_at = excluded.updated_at`,
      [workflow.id, workflow, workflow.createdAt, workflow.updatedAt]
    );
    return workflow;
  }

  async saveRun(run: WorkflowRunRecord) {
    await this.pool.query(
      "insert into workflow_runs (id, workflow_id, status, items, node_outputs, audit, error, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)",
      [run.id, run.workflowId, run.status, run.items, run.nodeOutputs ?? {}, run.audit, run.error ?? null, run.createdAt]
    );
    return run;
  }

  async listRuns(workflowId?: string) {
    const query = workflowId
      ? await this.pool.query("select * from workflow_runs where workflow_id = $1 order by created_at desc", [workflowId])
      : await this.pool.query("select * from workflow_runs order by created_at desc");
    return query.rows.map(rowToRun);
  }

  async listAgents() {
    const { rows } = await this.pool.query("select document from agents order by updated_at desc");
    return rows.map((row) => row.document as AgentProfile);
  }

  async upsertAgent(agent: AgentProfile) {
    await this.pool.query(
      `insert into agents (id, document, updated_at)
       values ($1, $2, $3)
       on conflict (id) do update set document = excluded.document, updated_at = excluded.updated_at`,
      [agent.id, agent, now()]
    );
    return agent;
  }

  async listSkills() {
    const { rows } = await this.pool.query("select document from skills order by updated_at desc");
    return rows.map((row) => row.document as SavedSkillAsset);
  }

  async getSkill(id: string) {
    const { rows } = await this.pool.query("select document from skills where id = $1", [id]);
    return rows[0]?.document as SavedSkillAsset | undefined;
  }

  async upsertSkill(input: Partial<SavedSkillAsset> & Pick<SavedSkillAsset, "ownerId" | "type" | "name" | "toolNames">) {
    const time = now();
    const skill: SavedSkillAsset = {
      id: input.id ?? crypto.randomUUID(),
      ownerId: input.ownerId,
      type: input.type,
      name: input.name,
      instructions: input.instructions,
      soul: input.soul,
      personality: input.personality,
      toolNames: input.toolNames,
      createdAt: input.createdAt ?? time,
      updatedAt: time
    };
    await this.pool.query(
      `insert into skills (id, owner_id, document, updated_at)
       values ($1, $2, $3, $4)
       on conflict (id) do update set owner_id = excluded.owner_id, document = excluded.document, updated_at = excluded.updated_at`,
      [skill.id, skill.ownerId, skill, skill.updatedAt]
    );
    return skill;
  }

  async deleteSkill(id: string) {
    await this.pool.query("delete from skills where id = $1", [id]);
  }

  async listCredentials() {
    const { rows } = await this.pool.query("select document from credentials order by updated_at desc");
    return rows.map((row) => row.document as CredentialRecord);
  }

  async getCredential(id: string) {
    const { rows } = await this.pool.query("select document from credentials where id = $1", [id]);
    return rows[0]?.document as CredentialRecord | undefined;
  }

  async upsertCredential(input: Partial<CredentialRecord> & Pick<CredentialRecord, "ownerId" | "name" | "service" | "authType"> & { data: Record<string, unknown> }) {
    const time = now();
    const credential: CredentialRecord = {
      id: input.id ?? crypto.randomUUID(),
      ownerId: input.ownerId,
      name: input.name,
      service: input.service,
      authType: input.authType,
      fields: Object.keys(input.data).sort(),
      encryptedData: encryptSecret(input.data),
      sharedWithUserIds: input.sharedWithUserIds ?? [],
      sharedWithUsernames: input.sharedWithUsernames ?? [],
      createdAt: input.createdAt ?? time,
      updatedAt: time
    };
    await this.pool.query(
      `insert into credentials (id, owner_id, document, updated_at)
       values ($1, $2, $3, $4)
       on conflict (id) do update set owner_id = excluded.owner_id, document = excluded.document, updated_at = excluded.updated_at`,
      [credential.id, credential.ownerId, credential, credential.updatedAt]
    );
    return credential;
  }

  async deleteCredential(id: string) {
    await this.pool.query("delete from credentials where id = $1", [id]);
  }

  async createApproval(input: Pick<ApprovalRecord, "message" | "payload">) {
    const time = now();
    const approval: ApprovalRecord = {
      id: crypto.randomUUID(),
      status: "pending",
      message: input.message,
      payload: input.payload,
      createdAt: time,
      updatedAt: time
    };
    await this.pool.query(
      "insert into approvals (id, status, message, payload, created_at, updated_at) values ($1, $2, $3, $4, $5, $6)",
      [approval.id, approval.status, approval.message, approval.payload, approval.createdAt, approval.updatedAt]
    );
    return approval;
  }

  async listApprovals() {
    const { rows } = await this.pool.query("select * from approvals order by created_at desc");
    return rows.map(rowToApproval);
  }

  async decideApproval(id: string, status: "approved" | "rejected") {
    const time = now();
    const { rows } = await this.pool.query(
      "update approvals set status = $2, updated_at = $3 where id = $1 returning *",
      [id, status, time]
    );
    if (!rows[0]) {
      throw new Error("approval not found");
    }
    return rowToApproval(rows[0]);
  }
}

export function defaultChatModel(): ModelRef {
  return {
    provider: "ollama",
    model: process.env.OLLAMA_DEFAULT_MODEL ?? "llama3.1",
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1"
  };
}

function defaultIntelligenceForModel(model: ModelRef): Intelligence {
  return model.provider === "ollama" ? "off" : "medium";
}

function normalizeModelRef(model: ModelRef): ModelRef {
  if (model.provider === "openai" || model.provider === "anthropic") {
    return model;
  }

  return {
    provider: "ollama",
    model: model.provider === "ollama" ? model.model : process.env.OLLAMA_DEFAULT_MODEL ?? "llama3.1",
    baseUrl: model.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1"
  };
}

function normalizeUnknownModel(value: unknown): ModelRef | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return normalizeModelRef(value as ModelRef);
}

function firstWorkflowIdForOwner(workflows: Workflow[], ownerId: string): string | undefined {
  return workflows.find((workflow) => workflowOwnerId(workflow) === ownerId)?.id ?? workflows[0]?.id;
}

function workflowOwnerId(workflow: Workflow): string {
  const candidate = (workflow as unknown as Record<string, unknown>).ownerId;
  return typeof candidate === "string" && candidate ? candidate : "system";
}

function seedWorkflow(): Workflow {
  const time = now();
  const model = defaultChatModel();
  return {
    id: "default-workflow",
    name: "Telegram/WhatsApp to Coding Agent",
    version: 1,
    createdAt: time,
    updatedAt: time,
    nodes: [
      {
        id: "manual",
        type: "manual.trigger",
        kind: "trigger",
        name: "Manual / Channel Input",
        position: { x: 80, y: 120 },
        config: {}
      },
      {
        id: "agent",
        type: "agent.run",
        kind: "agent",
        name: "Repo + Ops Agent",
        position: { x: 420, y: 120 },
        config: {
          agentId: "repo-ops-agent",
          name: "Repo + Ops Agent",
          model,
          intelligence: defaultIntelligenceForModel(model),
          soul: "You orchestrate coding and IT operations with careful approvals.",
          personality: "Direct, precise, safety-aware.",
          tools: ["repo.inspect", "file.read", "git.status", "ssh.inspect"]
        }
      },
      {
        id: "notify",
        type: "notify.send",
        kind: "action",
        name: "Reply",
        position: { x: 760, y: 120 },
        config: { channel: "chat", message: "Return agent result to chat/channel" }
      }
    ],
    edges: [
      { id: "edge-manual-agent", source: "manual", target: "agent" },
      { id: "edge-agent-notify", source: "agent", target: "notify" }
    ]
  };
}

function seedAgent(): AgentProfile {
  const model = defaultChatModel();
  return {
    id: "repo-ops-agent",
    name: "Repo + Ops Agent",
    model,
    intelligence: defaultIntelligenceForModel(model),
    soul: "You are a local IT and coding agent. Inspect first, propose exact changes, require approval for risky actions.",
    personality: "Terse, practical, technically precise.",
    skills: [
      {
        id: "coding",
        name: "Coding",
        instructions: "Inspect repository, identify minimal patch, run relevant tests, summarize changed files.",
        toolNames: ["repo.inspect", "file.read", "git.status", "shell.run"]
      },
      {
        id: "server-ops",
        name: "Server Ops",
        instructions: "Use SSH read diagnostics first. Mutating commands need explicit approval or pre-approved runbook.",
        toolNames: ["ssh.inspect", "ssh.run"]
      }
    ],
    toolNames: ["repo.inspect", "file.read", "git.status", "shell.run", "ssh.inspect", "ssh.run"],
    memoryScope: "workflow",
    policy: defaultAgentPolicy
  };
}

async function seedMemory(store: Pick<AppStore, "createSession" | "upsertWorkflow" | "upsertAgent">) {
  const model = defaultChatModel();
  await store.createSession({ id: "default-session", ownerId: "system", workflowId: "default-workflow", name: "Chat 1", model, intelligence: defaultIntelligenceForModel(model) });
  await store.upsertAgent(seedAgent());
  await store.upsertWorkflow(seedWorkflow());
}

function rowToSession(row: Record<string, unknown>): ChatSession {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id ?? "system"),
    workflowId: typeof row.workflow_id === "string" ? row.workflow_id : undefined,
    name: String(row.name),
    model: row.model as ModelRef,
    intelligence: row.intelligence as Intelligence,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function rowToUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    username: String(row.username),
    role: row.role as UserRecord["role"],
    passwordHash: String(row.password_hash),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [salt, storedHash] = encoded.split(":");
  if (!salt || !storedHash) {
    return false;
  }
  const actualHash = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(actualHash, "hex"));
}

function credentialKey(): Buffer {
  return createHash("sha256").update(process.env.CREDENTIAL_SECRET ?? process.env.AUTH_SECRET ?? "frostbyte-local-secret").digest();
}

function encryptSecret(data: Record<string, unknown>): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };
}

export function decryptSecret(secret: EncryptedSecret): Record<string, unknown> {
  const decipher = createDecipheriv("aes-256-gcm", credentialKey(), Buffer.from(secret.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(secret.tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as Record<string, unknown>;
}

function rowToMessage(row: Record<string, unknown>): StoredMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as StoredMessage["role"],
    content: String(row.content),
    metadata: row.metadata as Record<string, unknown>,
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function rowToRun(row: Record<string, unknown>): WorkflowRunRecord {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    status: row.status as WorkflowRunRecord["status"],
    items: row.items as WorkflowRunRecord["items"],
    nodeOutputs: row.node_outputs as WorkflowRunRecord["nodeOutputs"],
    audit: row.audit as WorkflowRunRecord["audit"],
    error: typeof row.error === "string" ? row.error : undefined,
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function rowToApproval(row: Record<string, unknown>): ApprovalRecord {
  return {
    id: String(row.id),
    status: row.status as ApprovalRecord["status"],
    message: String(row.message),
    payload: row.payload as Record<string, unknown>,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}
