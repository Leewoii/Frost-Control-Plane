import { getIntelligenceProfile, mapReasoningForProvider } from "./intelligence.js";
import type {
  ChatMessage,
  ModelGenerateRequest,
  ModelGenerateResponse,
  ModelProvider,
  ModelProviderId,
  ToolDefinition
} from "./types.js";

export interface ProviderEnvironment {
  ollamaBaseUrl?: string;
  ollamaDefaultModel?: string;
  openAiApiKey?: string;
  anthropicApiKey?: string;
}

export function createProviderRegistry(env: ProviderEnvironment = {}): Map<ModelProviderId, ModelProvider> {
  return new Map<ModelProviderId, ModelProvider>([
    ["ollama", new OpenAiCompatibleProvider("ollama", env.ollamaBaseUrl ?? "http://localhost:11434/v1")],
    ["openai", new OpenAiCompatibleProvider("openai", "https://api.openai.com/v1", env.openAiApiKey)],
    ["anthropic", new AnthropicProvider(env.anthropicApiKey)]
  ]);
}

class OpenAiCompatibleProvider implements ModelProvider {
  readonly id: "ollama" | "openai";

  constructor(
    id: "ollama" | "openai",
    private readonly defaultBaseUrl: string,
    private readonly apiKey?: string
  ) {
    this.id = id;
  }

  async generate(request: ModelGenerateRequest): Promise<ModelGenerateResponse> {
    const baseUrl = request.model.baseUrl ?? this.defaultBaseUrl;
    const reasoning = mapReasoningForProvider(this.id, request.intelligence);
    const messages: ChatMessage[] = request.system
      ? [{ role: "system", content: request.system }, ...request.messages]
      : request.messages;

    let response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(request.model.apiKey || this.apiKey ? { authorization: `Bearer ${request.model.apiKey ?? this.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: request.model.model,
        messages: messages.map(toOpenAiMessage),
        tools: request.tools?.map(toOpenAiTool),
        stream: false,
        ...reasoning
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (request.tools?.length && isUnsupportedToolError(errorText)) {
        response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(request.model.apiKey || this.apiKey ? { authorization: `Bearer ${request.model.apiKey ?? this.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: request.model.model,
            messages: messages.map(toOpenAiMessage),
            stream: false,
            ...reasoning
          })
        });

        if (!response.ok) {
          throw new Error(`${this.id} model call failed: ${response.status} ${await response.text()}`);
        }
      } else if (request.intelligence !== "off" && isUnsupportedThinkingError(errorText)) {
        response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(request.model.apiKey || this.apiKey ? { authorization: `Bearer ${request.model.apiKey ?? this.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: request.model.model,
            messages: messages.map(toOpenAiMessage),
            tools: request.tools?.map(toOpenAiTool),
            stream: false,
            ...mapReasoningForProvider(this.id, "off")
          })
        });

        if (!response.ok) {
          throw new Error(`${this.id} model call failed: ${response.status} ${await response.text()}`);
        }
      } else {
        throw new Error(`${this.id} model call failed: ${response.status} ${errorText}`);
      }
    }

    const data = (await response.json()) as OpenAiResponse;
    const choice = data.choices?.[0];
    const message = choice?.message;
    return {
      content: message?.content ?? "",
      toolCalls:
        message?.tool_calls?.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.function.name,
          input: parseJsonObject(toolCall.function.arguments)
        })) ?? [],
      usage: data.usage,
      metadata: {
        provider: this.id,
        model: request.model.model,
        intelligence: request.intelligence
      }
    };
  }
}

class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic" as const;

  constructor(private readonly apiKey?: string) {}

  async generate(request: ModelGenerateRequest): Promise<ModelGenerateResponse> {
    const apiKey = request.model.apiKey ?? this.apiKey;
    if (!apiKey) {
      throw new Error("anthropic model call failed: missing API key");
    }

    const reasoning = mapReasoningForProvider("anthropic", request.intelligence);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: request.model.model,
        system: request.system,
        messages: request.messages.filter((message) => message.role !== "system").map(toAnthropicMessage),
        max_tokens: getIntelligenceProfile(request.intelligence).maxOutputTokens,
        tools: request.tools?.map(toAnthropicTool),
        ...reasoning
      })
    });

    if (!response.ok) {
      throw new Error(`anthropic model call failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const text = data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    const toolCalls = data.content
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        id: block.id ?? crypto.randomUUID(),
        name: block.name ?? "unknown",
        input: typeof block.input === "object" && block.input !== null ? block.input : {}
      }));

    return {
      content: text,
      toolCalls,
      usage: data.usage,
      metadata: {
        provider: this.id,
        model: request.model.model,
        intelligence: request.intelligence
      }
    };
  }
}

function toOpenAiMessage(message: ChatMessage): Record<string, unknown> {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {})
  };
}

function toAnthropicMessage(message: ChatMessage): Record<string, unknown> {
  return {
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content
  };
}

function toOpenAiTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  };
}

function toAnthropicTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  };
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isUnsupportedThinkingError(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("does not support thinking") || lower.includes("unsupported thinking") || lower.includes("unsupported reasoning");
}

function isUnsupportedToolError(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("does not support tools") || lower.includes("unsupported tools") || lower.includes("tool calls are not supported");
}

interface OpenAiResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
  usage?: Record<string, unknown>;
}

interface AnthropicResponse {
  content: Array<{
    type: "text" | "tool_use" | string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  usage?: Record<string, unknown>;
}
