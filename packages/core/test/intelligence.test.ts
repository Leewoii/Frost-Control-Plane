import { describe, expect, it } from "vitest";
import { getIntelligenceProfile, mapReasoningForProvider } from "../src/intelligence.js";

describe("intelligence mapping", () => {
  it("maps low/medium/high into increasing planner limits", () => {
    expect(getIntelligenceProfile("low").toolCallLimit).toBeLessThan(getIntelligenceProfile("medium").toolCallLimit);
    expect(getIntelligenceProfile("medium").toolCallLimit).toBeLessThan(getIntelligenceProfile("high").toolCallLimit);
  });

  it("turns provider reasoning off", () => {
    expect(mapReasoningForProvider("ollama", "off")).toMatchObject({
      metadata: { intelligence: "off", reasoning_enabled: false }
    });
    expect(mapReasoningForProvider("ollama", "off")).not.toHaveProperty("reasoning_effort");
    expect(mapReasoningForProvider("anthropic", "off")).not.toHaveProperty("thinking");
  });

  it("maps OpenAI-compatible providers to reasoning_effort", () => {
    expect(mapReasoningForProvider("ollama", "high")).toMatchObject({ reasoning_effort: "high" });
    expect(mapReasoningForProvider("openai", "low")).toMatchObject({ reasoning_effort: "low" });
  });

  it("maps Claude high to thinking budget", () => {
    expect(mapReasoningForProvider("anthropic", "high")).toMatchObject({
      thinking: { type: "enabled", budget_tokens: 8192 }
    });
  });
});
