import type { Policy, PolicyDecision, PolicyRequest, PolicyRule } from "./types.js";

export const defaultAgentPolicy: Policy = {
  defaultDecision: "approval",
  rules: [
    { tool: "repo.inspect", risks: ["read"], decision: "allow" },
    { tool: "file.read", risks: ["read"], decision: "allow" },
    { tool: "file.write", risks: ["write"], decision: "approval" },
    { tool: "git.status", risks: ["read"], decision: "allow" },
    { tool: "ssh.inspect", risks: ["read"], decision: "allow" },
    { tool: "http.request", risks: ["read"], decision: "allow" },
    { tool: "db.query", risks: ["read"], decision: "allow" },
    { tool: "docker.inspect", risks: ["read"], decision: "allow" },
    { tool: "docker.run", risks: ["write", "destructive"], decision: "approval" },
    { tool: "cache.store", risks: ["write"], decision: "allow" },
    { tool: "queue.publish", risks: ["external-send"], decision: "approval" },
    { tool: "notify.send", risks: ["external-send"], decision: "approval" },
    { tool: "telegram.send", risks: ["external-send"], decision: "approval" },
    { tool: "whatsapp.send", risks: ["external-send"], decision: "approval" },
    { tool: "shell.run", risks: ["write", "destructive"], decision: "approval" },
    { tool: "ssh.run", risks: ["write", "destructive"], decision: "approval" },
    { tool: "git.push", risks: ["external-send", "write"], decision: "approval" }
  ]
};

export function evaluatePolicy(policy: Policy, request: PolicyRequest): PolicyDecision {
  const matched = findPolicyRule(policy.rules, request);
  if (matched) {
    return {
      decision: matched.decision,
      reason: `Matched policy rule for ${matched.tool}`,
      matchedRule: matched
    };
  }

  return {
    decision: policy.defaultDecision,
    reason: `No exact rule matched; using default ${policy.defaultDecision}`
  };
}

function findPolicyRule(rules: PolicyRule[], request: PolicyRequest): PolicyRule | undefined {
  return rules.find((rule) => {
    const toolMatches = rule.tool === request.tool;
    const targetMatches = !rule.target || rule.target === request.target;
    const riskMatches = rule.risks.includes(request.risk);
    return toolMatches && targetMatches && riskMatches;
  });
}
