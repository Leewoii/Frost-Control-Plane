import { describe, expect, it } from "vitest";
import { defaultAgentPolicy, evaluatePolicy } from "../src/policy.js";

describe("policy", () => {
  it("allows pre-approved read tools", () => {
    expect(evaluatePolicy(defaultAgentPolicy, { tool: "repo.inspect", risk: "read" }).decision).toBe("allow");
  });

  it("requires approval for risky tools", () => {
    expect(evaluatePolicy(defaultAgentPolicy, { tool: "shell.run", risk: "write" }).decision).toBe("approval");
  });
});
