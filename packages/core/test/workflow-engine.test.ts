import { describe, expect, it } from "vitest";
import {
  createDefaultNodeRegistry,
  WorkflowEngine,
  type ModelGenerateRequest,
  type ModelGenerateResponse,
  type ModelProvider,
  type Workflow
} from "../src/index.js";

describe("workflow engine", () => {
  it("runs a canvas agent with its own persistent model config", async () => {
    const workflow: Workflow = {
      id: "workflow-1",
      name: "Agent test",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: "manual",
          type: "manual.trigger",
          kind: "trigger",
          name: "Manual",
          position: { x: 0, y: 0 },
          config: {}
        },
        {
          id: "agent",
          type: "agent.run",
          kind: "agent",
          name: "Persistent Agent",
          position: { x: 240, y: 0 },
          config: {
            agentId: "inline-agent",
            model: { provider: "ollama", model: "canvas-model" },
            intelligence: "high",
            soul: "Test soul",
            personality: "Test personality"
          }
        }
      ],
      edges: [{ id: "edge-1", source: "manual", target: "agent" }]
    };

    const engine = new WorkflowEngine({
      nodes: createDefaultNodeRegistry(),
      providers: new Map([["ollama", new TestProvider()]])
    });

    const result = await engine.run(workflow, [{ json: { prompt: "hello" } }]);
    expect(result.status).toBe("completed");
    expect(result.items[0]?.json).toMatchObject({
      model: { provider: "ollama", model: "canvas-model" },
      intelligence: "high"
    });
  });
});

class TestProvider implements ModelProvider {
  readonly id = "ollama" as const;

  async generate(request: ModelGenerateRequest): Promise<ModelGenerateResponse> {
    return {
      content: `Test provider received ${request.model.model}`,
      toolCalls: [],
      metadata: { provider: this.id, model: request.model.model }
    };
  }
}
