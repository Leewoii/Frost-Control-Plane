import cors from "@fastify/cors";
import Fastify from "fastify";
import { EventHub } from "./events.js";
import { registerRoutes } from "./routes.js";
import { createStore } from "./store.js";

const port = Number(process.env.APP_PORT ?? 4310);
const host = process.env.APP_HOST ?? "0.0.0.0";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const store = createStore(process.env.DATABASE_URL);
await store.init();

const events = new EventHub();
await registerRoutes(app, store, events, {
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
  ollamaDefaultModel: process.env.OLLAMA_DEFAULT_MODEL,
  openAiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  authSecret: process.env.AUTH_SECRET
});

await app.listen({ port, host });
