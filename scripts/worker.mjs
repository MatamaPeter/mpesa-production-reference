import { setTimeout as wait } from "node:timers/promises";
const origin = process.env.WORKER_APP_ORIGIN ?? process.env.APP_ORIGIN,
  secret = process.env.CRON_SECRET;
if (!origin || !secret || secret.length < 24) {
  console.error("Worker origin and CRON_SECRET are required.");
  process.exit(1);
}
const interval = Math.max(1000, Number(process.env.WORKER_INTERVAL_MS ?? 5000)),
  concurrency = Math.min(
    8,
    Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 2)),
  );
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
async function loop(index) {
  while (running) {
    try {
      const response = await fetch(new URL("/api/internal/reconcile", origin), {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(250000),
      });
      if (!response.ok)
        console.error(
          JSON.stringify({
            event: "worker.request_failed",
            worker: index,
            status: response.status,
          }),
        );
      else await response.arrayBuffer();
    } catch {
      console.error(
        JSON.stringify({ event: "worker.connection_failed", worker: index }),
      );
    }
    if (running) await wait(interval);
  }
}
await Promise.all(Array.from({ length: concurrency }, (_, i) => loop(i)));
