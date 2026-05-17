import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface TerminalRunInput {
  nodeId: string;
  nodeType: string;
  command: string;
  timeoutSeconds?: number;
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

const defaultTerminalRoot = resolve(dirname(fileURLToPath(new URL("../../../data/node-terminals/.keep", import.meta.url))));
const outputLimit = 60_000;

export async function runIsolatedTerminalCommand(input: TerminalRunInput): Promise<TerminalRunResult> {
  const startedAt = new Date().toISOString();
  const command = input.command.trim();
  if (!command) {
    throw new Error("terminal command required");
  }

  const cwd = await ensureNodeTerminalDir(input.nodeId);
  const timeoutMs = Math.max(1, Math.min(Number(input.timeoutSeconds ?? 60), 600)) * 1000;

  return new Promise((resolveResult, reject) => {
    const shell = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
    const args = process.platform === "win32" ? ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command] : ["-lc", command];
    const child = spawn(shell, args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        BARYON_NODE_ID: input.nodeId,
        BARYON_NODE_TYPE: input.nodeType,
        BARYON_TERMINAL_CWD: cwd
      }
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = capOutput(stdout + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = capOutput(stderr + chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveResult({
        id: crypto.randomUUID(),
        nodeId: input.nodeId,
        nodeType: input.nodeType,
        command,
        cwd,
        exitCode,
        timedOut,
        stdout,
        stderr,
        startedAt,
        finishedAt: new Date().toISOString()
      });
    });
  });
}

async function ensureNodeTerminalDir(nodeId: string): Promise<string> {
  const root = resolve(process.env.BARYON_TERMINAL_ROOT ?? defaultTerminalRoot);
  const safeNodeId = nodeId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const cwd = resolve(join(root, safeNodeId));
  if (!cwd.startsWith(root)) {
    throw new Error("invalid terminal node path");
  }
  await mkdir(cwd, { recursive: true });
  return cwd;
}

function capOutput(value: string): string {
  return value.length <= outputLimit ? value : value.slice(value.length - outputLimit);
}
