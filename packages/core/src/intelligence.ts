import type { Intelligence } from "./types.js";

export interface IntelligenceProfile {
  reasoningEffort?: "low" | "medium" | "high";
  toolCallLimit: number;
  planningBudgetTokens: number;
  maxOutputTokens: number;
  claudeThinkingBudgetTokens?: number;
}

const profiles: Record<Intelligence, IntelligenceProfile> = {
  off: {
    toolCallLimit: 3,
    planningBudgetTokens: 0,
    maxOutputTokens: 1024
  },
  low: {
    reasoningEffort: "low",
    toolCallLimit: 3,
    planningBudgetTokens: 1024,
    maxOutputTokens: 1024,
    claudeThinkingBudgetTokens: 1024
  },
  medium: {
    reasoningEffort: "medium",
    toolCallLimit: 6,
    planningBudgetTokens: 4096,
    maxOutputTokens: 2048,
    claudeThinkingBudgetTokens: 4096
  },
  high: {
    reasoningEffort: "high",
    toolCallLimit: 10,
    planningBudgetTokens: 12000,
    maxOutputTokens: 4096,
    claudeThinkingBudgetTokens: 8192
  }
};

export function getIntelligenceProfile(intelligence: Intelligence): IntelligenceProfile {
  return profiles[intelligence];
}

export function mapReasoningForProvider(provider: string, intelligence: Intelligence): Record<string, unknown> {
  const profile = getIntelligenceProfile(intelligence);
  const metadata = {
    intelligence,
    planning_budget_tokens: profile.planningBudgetTokens,
    tool_call_limit: profile.toolCallLimit,
    reasoning_enabled: intelligence !== "off"
  };

  if (intelligence === "off") {
    return { metadata };
  }

  if (provider === "ollama" || provider === "openai") {
    return {
      reasoning_effort: profile.reasoningEffort,
      metadata
    };
  }

  if (provider === "anthropic") {
    return {
      thinking:
        intelligence === "low"
          ? undefined
          : {
              type: "enabled",
              budget_tokens: profile.claudeThinkingBudgetTokens
            },
      metadata
    };
  }

  return { metadata };
}
