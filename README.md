# Frost Control Plane

Local-first AI orchestration app: chat session + n8n-like canvas, built for Ollama-first IT and coding agents.

## Run

```bash
npm install
cp .env.example .env
docker compose up --build
```

Open `http://localhost:5173`.

For local Node development:

```bash
npm install
npm run dev
```

The API uses Postgres when `DATABASE_URL` is set and an in-memory store when it is not.
Without `DATABASE_URL`, local state persists to `data/app-state.json` so chat session model/provider settings survive restart.

## Core Rules

- Chat session uses one selected model until changed.
- Canvas Agent nodes keep their own persistent model, intelligence, soul, personality, skills, tools, memory, and policy.
- Workflow execution uses the Agent node config, not the chat session model.
- `low | medium | high` intelligence maps to provider reasoning controls when available and internal planner limits always.
"# Frost-Control-Plane" 
