import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { writeFile, mkdir } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { prepareIndexes } from "../scripts/prepare-db.mjs";
const vus = Math.max(1, Math.min(5000, Number(process.env.LOAD_VUS ?? 1000))),
  rampSeconds = Math.max(1, Number(process.env.LOAD_RAMP_SECONDS ?? 20)),
  holdSeconds = Math.max(5, Number(process.env.LOAD_HOLD_SECONDS ?? 30)),
  origin = "http://127.0.0.1:3300";
const samples = [],
  groups = { catalog: [], documents: [] };
let errors = 0,
  requests = 0,
  inFlight = 0,
  peakInFlight = 0,
  server,
  replica,
  logs = "",
  reporter;
const errorStatuses = {};
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)],
  );
}
try {
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { checkMD5: true },
  });
  const uri = replica.getUri("isolated_capacity_test");
  await mongoose.connect(uri);
  await prepareIndexes(mongoose.connection.db);
  await mongoose.connection.db.collection("products").insertMany(
    Array.from({ length: 1000 }, (_, i) => ({
      sku: `load-${i}`,
      slug: `load-${i}`,
      name: `Load Test Product ${i}`,
      category: i % 2 ? "Audio" : "Computing",
      tagline: "Isolated capacity fixture",
      description:
        "Synthetic product for a local read-only capacity workload. Not a real item for sale.",
      prices: { USD: 10000 + i * 100, KES: 1300000 + i * 10000 },
      image: i % 2 ? "headphones" : "keyboard",
      features: ["Synthetic fixture", "No payment requests"],
      stock: 100,
      active: true,
      featured: i < 4,
    })),
  );
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3300",
    ],
    {
      env: {
        ...process.env,
        MONGODB_URI: uri,
        APP_ORIGIN: origin,
        COMMERCE_LIVE: "true",
        COMMERCE_STAGE: "sandbox",
        ACCOUNT_AUTH_ENABLED: "false",
        PAYMENT_WORKER_ENABLED: "false",
        SHIPPING_TRACKING_ENABLED: "false",
        SHIPPING_LABEL_PURCHASE_ENABLED: "false",
        RESEND_API_KEY: "",
        EMAIL_FROM: "",
        FX_API_KEY: "",
        SHIPPO_API_TOKEN: "",
        STRIPE_SECRET_KEY: "sk_test_isolated_load_fixture",
        STRIPE_WEBHOOK_SECRET: "",
        MPESA_TAX_APPROVED: "false",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (b) => (logs += b));
  server.stderr.on("data", (b) => (logs += b));
  let ready = false;
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(origin + "/api/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await wait(100);
  }
  if (!ready) throw new Error("Load-test server did not become ready");
  for (const path of [
    "/api/catalog?currency=KES",
    "/api/catalog?category=Audio&currency=KES",
    "/",
    "/cart",
    ...Array.from({ length: 30 }, (_, i) => `/products/load-${i}`),
  ]) {
    const r = await fetch(origin + path);
    if (!r.ok) throw new Error("Warm-up failed: " + path);
    await r.arrayBuffer();
  }
  const start = Date.now(),
    end = start + (rampSeconds + holdSeconds) * 1000;
  console.log(
    `Ramping to ${vus} virtual shoppers over ${rampSeconds}s, then holding ${holdSeconds}s. Think time: 2–8s. No payment or external provider calls.`,
  );
  reporter = setInterval(
    () =>
      console.log(
        JSON.stringify({
          elapsedSeconds: Math.round((Date.now() - start) / 1000),
          requests,
          errors,
          inFlight,
        }),
      ),
    10000,
  );
  await Promise.all(
    Array.from({ length: vus }, async (_, id) => {
      await wait((id / vus) * rampSeconds * 1000);
      let iteration = 0;
      while (Date.now() < end) {
        const selector = (id * 17 + iteration * 13) % 100,
          path =
            selector < 40
              ? "/api/catalog?currency=KES"
              : selector < 70
                ? "/api/catalog?category=Audio&currency=KES"
                : selector < 90
                  ? `/products/load-${(id + iteration) % 30}`
                  : selector < 96
                    ? "/"
                    : "/cart",
          group = path.startsWith("/api/") ? "catalog" : "documents",
          t = performance.now();
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        try {
          const r = await fetch(origin + path, {
              signal: AbortSignal.timeout(15000),
            }),
            body = await r.text();
          if (
            !r.ok ||
            (group === "catalog" && !body.includes('"items"')) ||
            (group === "documents" && !body.includes("<main"))
          ) {
            errors++;
            errorStatuses[r.status] = (errorStatuses[r.status] ?? 0) + 1;
          }
        } catch {
          errors++;
          errorStatuses.timeoutOrConnection =
            (errorStatuses.timeoutOrConnection ?? 0) + 1;
        } finally {
          const ms = performance.now() - t;
          samples.push(ms);
          groups[group].push(ms);
          requests++;
          inFlight--;
        }
        iteration++;
        const think =
          2000 + (((id * 1103515245 + iteration * 12345) >>> 0) % 6000);
        if (Date.now() + think < end) await wait(think);
        else break;
      }
    }),
  );
  clearInterval(reporter);
  const elapsedSeconds = (Date.now() - start) / 1000;
  const report = {
    generatedAt: new Date().toISOString(),
    scope:
      "Isolated read-only browsing workload; not a production SLA or payment capacity certification.",
    fixtureProducts: 1000,
    virtualShoppers: vus,
    rampSeconds,
    holdSeconds,
    thinkTimeSeconds: [2, 8],
    distribution: { catalogAPI: 70, productPages: 20, homePage: 6, bagPage: 4 },
    elapsedSeconds: Math.round(elapsedSeconds),
    requests,
    errors,
    errorRate: errors / Math.max(1, requests),
    peakConcurrentRequests: peakInFlight,
    requestsPerSecond: Math.round(requests / elapsedSeconds),
    latencyMs: {
      p50: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      p99: percentile(samples, 0.99),
    },
    byRoute: Object.fromEntries(
      Object.entries(groups).map(([name, values]) => [
        name,
        {
          requests: values.length,
          p95Ms: percentile(values, 0.95),
          p99Ms: percentile(values, 0.99),
        },
      ]),
    ),
    errorStatuses,
    host: {
      logicalCPUs: cpus().length,
      totalMemoryGiB: Math.round(totalmem() / 1024 ** 3),
      node: process.version,
      generatorAndServerShareHost: true,
    },
    limits: {
      maxErrorRate: 0.01,
      p95BudgetMs: Number(process.env.LOAD_P95_MS ?? 2000),
    },
  };
  report.passed =
    report.errorRate <= report.limits.maxErrorRate &&
    report.byRoute.catalog.p95Ms <= report.limits.p95BudgetMs &&
    report.byRoute.documents.p95Ms <= report.limits.p95BudgetMs;
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/load-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} catch (e) {
  console.error(e);
  if (logs) console.error(logs.slice(-3000));
  process.exitCode = 1;
} finally {
  if (reporter) clearInterval(reporter);
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  await mongoose.disconnect();
  if (replica) await replica.stop();
}
