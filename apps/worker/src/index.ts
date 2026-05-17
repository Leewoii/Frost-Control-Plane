import { setTimeout as wait } from "node:timers/promises";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const pollMs = Number(process.env.WORKER_POLL_MS ?? 2000);

if (!databaseUrl) {
  console.log("baryon-worker running without DATABASE_URL; no queue attached");
  await idle();
} else {
  const pool = new Pool({ connectionString: databaseUrl });
  await ensureQueue(pool);
  console.log("baryon-worker ready");

  while (true) {
    const job = await claimJob(pool);
    if (!job) {
      await wait(pollMs);
      continue;
    }

    try {
      await pool.query("update workflow_jobs set status = 'completed', updated_at = now(), result = $2 where id = $1", [
        job.id,
        {
          note:
            "Worker queue boundary active. API currently executes runs inline; move workflow.run jobs here when long-running sandbox execution is enabled."
        }
      ]);
    } catch (error) {
      await pool.query("update workflow_jobs set status = 'failed', updated_at = now(), error = $2 where id = $1", [
        job.id,
        error instanceof Error ? error.message : String(error)
      ]);
    }
  }
}

async function ensureQueue(pool: Pool) {
  await pool.query(`
    create table if not exists workflow_jobs (
      id text primary key,
      type text not null,
      status text not null default 'queued',
      payload jsonb not null,
      result jsonb,
      error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
}

async function claimJob(pool: Pool): Promise<{ id: string; type: string; payload: Record<string, unknown> } | undefined> {
  const { rows } = await pool.query(`
    update workflow_jobs
    set status = 'running', updated_at = now()
    where id = (
      select id from workflow_jobs
      where status = 'queued'
      order by created_at asc
      limit 1
      for update skip locked
    )
    returning id, type, payload;
  `);
  const row = rows[0] as { id: string; type: string; payload: Record<string, unknown> } | undefined;
  return row;
}

async function idle(): Promise<never> {
  while (true) {
    await wait(60_000);
  }
}
