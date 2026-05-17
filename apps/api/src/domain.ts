import type { AgentProfile, AuditEvent, Intelligence, ModelRef, Workflow, WorkflowItem } from "@baryon/core";

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

export interface UserRecord {
  id: string;
  username: string;
  role: "admin" | "user";
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
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

export interface EncryptedSecret {
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface CredentialRecord {
  id: string;
  ownerId: string;
  name: string;
  service: string;
  authType: "apiKey" | "oauth2" | "basic" | "token" | "sshKey" | "custom";
  fields: string[];
  encryptedData: EncryptedSecret;
  sharedWithUserIds: string[];
  sharedWithUsernames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CredentialView {
  id: string;
  ownerId: string;
  name: string;
  service: string;
  authType: CredentialRecord["authType"];
  fields: string[];
  sharedWithUserIds: string[];
  sharedWithUsernames: string[];
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

export interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  status: "completed" | "paused" | "failed";
  items: WorkflowItem[];
  nodeOutputs?: Record<string, WorkflowItem[]>;
  audit: AuditEvent[];
  error?: string;
  createdAt: string;
}

export interface ApprovalRecord {
  id: string;
  status: "pending" | "approved" | "rejected";
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AppStateSnapshot {
  users: UserRecord[];
  sessions: ChatSession[];
  workflows: Workflow[];
  agents: AgentProfile[];
  skills: SavedSkillAsset[];
  credentials: CredentialView[];
  approvals: ApprovalRecord[];
}
