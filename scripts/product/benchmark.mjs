/**
 * File map: dataset loop owns one fresh sandbox and browser context at a time.
 * Seed -> API/cold/warm -> feedback/scroll -> post-GC cycles -> budget/report.
 * --profile reuses immutable prior timing samples, reruns only render/heap/CPU.
 * Kept together to make resource lifetime and measurement order reviewable;
 * summary validation lives in benchmark-metrics.mjs, tested independently.
 */
import assert from "node:assert/strict";
import { cpus, totalmem, release, platform } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { startSandbox } from "../../tests/product-e2e/sandbox.mjs";

import { measureScrollFrames } from "./benchmark-scroll.mjs";
import { retainedMetrics } from "./benchmark-metrics.mjs";
import { summarize as summary } from "./benchmark-metrics.mjs";
import { withCleanup } from "./cleanup.mjs";

const profileOnly = process.argv.includes("--profile");
const root = resolve(
  process.env.MKW_PRODUCT_EVIDENCE_ROOT ??
    ".agent-runs/MKW-PRODUCT-001/task10-acceptance",
);
await mkdir(root, { recursive: true });
const reportFile = resolve(root, `benchmark-run-${randomUUID()}.json`);
const requested = process.argv.find((arg) => arg.startsWith("--sizes="));
const sizes = requested
  ? requested.slice(8).split(",").map(Number)
  : [20, 200, 1000];
assert(
  sizes.length && sizes.every((n) => [20, 200, 1000].includes(n)),
  "Only approved benchmark sizes20/200/1000 are supported",
);
let measured;
const report = {
  machine: {
    platform: platform(),
    os: release(),
    cpu: cpus()[0].model,
    logicalCPUs: cpus().length,
    ramBytes: totalmem(),
    node: process.version,
  },
  profile:
    "production build; headless project-local Chromium; 1280x800; loopback; no network/CPU throttling; warm DB; fresh context cold route; browser cache warm reload",
  mode: profileOnly
    ? "profile + corrected heap; prior API/feedback/scroll samples retained"
    : "full",
  sizes: [],
  reportFile,
  result: "RUNNING",
};
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
let failed = false;
try {
  if (profileOnly) {
    const sourceFile = resolve(
      process.env.MKW_BENCHMARK_PRIOR ??
        resolve(root, "benchmark-measured.json"),
    );
    report.sourceMetrics = sourceFile;
    measured = JSON.parse(await readFile(sourceFile, "utf8"));
    measured.sizes = measured.sizes.map(retainedMetrics);
    for (const size of sizes) {
      const prior = measured.sizes.find((entry) => entry.size === size);
      if (
        !prior ||
        [
          "apiMs",
          "editorMs",
          "inputMs",
          "scrollFramesMs",
          "coldLoadMs",
          "warmLoadMs",
          "renderAfterResponseMs",
        ].some((key) => !prior[key]?.samples) ||
        !prior.heapBytes?.length
      )
        throw new Error(`Missing retained raw prerequisites for size${size}`);
    }
  }
  for (const size of sizes) {
    const s = await startSandbox({ acceptance: true });
    const metric = {
      size,
      days: 31,
      kinds: 2,
      cells: size * 62,
      density:
        "all logical cells; idx modulo10: number0..4, work absence5, otherwise empty; reminder idx modulo7=0; same distribution at each size",
      runDir: s.runDir,
      budgets: {
        apiP95Ms: size === 200 ? 500 : size === 1000 ? 1500 : null,
        loadMs: size === 200 ? 2000 : size === 1000 ? 5000 : null,
        editorP95Ms: size === 1000 ? 150 : 100,
        inputP95Ms: size === 1000 ? 150 : 100,
        frameP95Ms: 33,
        freezeMaxMs: 200,
        heapGrowthPercent: 20,
      },
      result: "RUNNING",
    };
    if (profileOnly) {
      const previous = measured.sizes.find((x) => x.size === size);
      Object.assign(metric, retainedMetrics(previous), {
        originalRunDir: previous.runDir,
        runDir: s.runDir,
        sourceMetrics: report.sourceMetrics,
      });
    }
    report.sizes.push(metric);
    let context, metricError;
    try {
      // Only the freshly enrolled, actual-identity-checked run DB is seeded.
      await s.pool.query(
        `INSERT INTO "Employee" (id,name,"startDate","endDate",revision,"createdAt","updatedAt") SELECT gen_random_uuid(),'Nhân sự benchmark giả '||lpad(i::text,4,'0'),'2024-01-01',NULL,gen_random_uuid(),now(),now() FROM generate_series(1,$1::int) i`,
        [size],
      );
      await s.pool.query(
        `WITH e AS (SELECT id,row_number() OVER(ORDER BY name) n FROM "Employee"), c AS (SELECT id,d,k,(n+extract(day from d)::int)%10 idx FROM e CROSS JOIN generate_series('2026-10-01'::date,'2026-10-31'::date,'1 day') d CROSS JOIN unnest(ARRAY['work','overtime']::"AttendanceKind"[]) k) INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType","halfUnits",reminder,revision,"updatedAt") SELECT id,d,k,(CASE WHEN idx<5 THEN 'number' WHEN idx=5 AND k='work' THEN 'absence' ELSE 'empty' END)::"CellValueType",CASE WHEN idx<5 THEN 3 ELSE NULL END,idx%7=0,gen_random_uuid(),now() FROM c`,
      );
      let sessionState;
      const login = async () => {
        const c = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          ...(sessionState ? { storageState: sessionState } : {}),
        });
        await c.addInitScript(() => {
          const NativeDate = Date;
          class BenchmarkDate extends NativeDate {
            constructor(...args) {
              super(...(args.length ? args : ["2026-10-15T12:00:00+07:00"]));
            }
            static now() {
              return NativeDate.now();
            }
          }
          window.Date = BenchmarkDate;
        });
        if (sessionState) return c;
        const r = await c.request.post(`${s.webOrigin}/api/v1/auth/login`, {
          headers: { origin: s.webOrigin },
          data: s.accounts[0],
        });
        assert.equal(r.status(), 200);
        sessionState = await c.storageState();
        return c;
      };
      context = await login();
      if (!profileOnly) {
        const api = [];
        for (let i = 0; i < 5; i++) {
          const start = performance.now();
          const r = await context.request.get(
            `${s.webOrigin}/api/v1/attendance/month?month=2026-10`,
          );
          assert.equal(r.status(), 200);
          const data = await r.json();
          api.push(performance.now() - start);
          assert.equal(data.employees.length, size);
          assert.equal(data.cells.length, size * 62);
        }
        metric.apiMs = summary(api);
      }
      await context.close();
      context = undefined;
      const ready = async (page) => {
        await page
          .locator(".grid-scroll tbody tr:last-child button[data-cell]")
          .first()
          .waitFor({ state: "visible", timeout: 120000 });
        await page.evaluate(
          () =>
            new Promise((r) =>
              requestAnimationFrame(() => requestAnimationFrame(r)),
            ),
        );
      };
      const cold = [],
        warm = [],
        render = [];
      for (let i = 0; i < 5; i++) {
        context = await login();
        const page = await context.newPage();
        let start = performance.now();
        await page.goto(s.webOrigin, { waitUntil: "domcontentloaded" });
        await ready(page);
        cold.push(performance.now() - start);
        render.push(
          await page.evaluate(() => {
            const r = performance
              .getEntriesByType("resource")
              .filter((x) => x.name.includes("/attendance/month?"))
              .at(-1);
            return performance.now() - r.responseEnd;
          }),
        );
        start = performance.now();
        await page.reload({ waitUntil: "domcontentloaded" });
        await ready(page);
        warm.push(performance.now() - start);
        if (i < 4) {
          await context.close();
          context = undefined;
        }
      }
      metric.coldLoadMs = summary(cold);
      metric.warmLoadMs = summary(warm);
      const page = context.pages()[0];
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      await cdp.send("HeapProfiler.enable");
      metric.dom = await cdp.send("Memory.getDOMCounters");
      metric.jsResources = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((e) => e.name.includes("/assets/"))
          .map((e) => ({
            path: new URL(e.name).pathname,
            transferSize: e.transferSize,
            decodedBodySize: e.decodedBodySize,
            duration: e.duration,
          })),
      );
      const closeEditor = async () => {
        await page
          .getByRole("button", { name: "Hủy", exact: true })
          .last()
          .click();
        const discard = page.getByRole("button", {
          name: "Bỏ phần nhập và tiếp tục",
          exact: true,
        });
        if (await discard.isVisible()) await discard.click();
      };
      metric.renderAfterResponseMs = summary(render);
      if (!profileOnly) {
        // Browser capture timestamp -> next paint opportunity. Playwright locator
        // waiting/transport overhead is excluded; input uses trusted browser keys.
        await page.evaluate(() => {
          window.__feedback = [];
          document.addEventListener(
            "click",
            (e) => {
              if (e.target.closest("button[data-cell]")) {
                const start = performance.now();
                requestAnimationFrame(() =>
                  requestAnimationFrame(() =>
                    window.__feedback.push({
                      type: "editor",
                      ms: performance.now() - start,
                    }),
                  ),
                );
              }
            },
            true,
          );
          document.addEventListener(
            "input",
            (e) => {
              if (e.target.id === "custom-value") {
                const start = performance.now();
                requestAnimationFrame(() =>
                  requestAnimationFrame(() =>
                    window.__feedback.push({
                      type: "input",
                      ms: performance.now() - start,
                    }),
                  ),
                );
              }
            },
            true,
          );
        });
        for (let i = 0; i < 30; i++) {
          await page.locator("button[data-cell]").first().click();
          await closeEditor();
        }
        await page.locator("button[data-cell]").first().click();
        await page
          .getByRole("button", { name: "Tùy chỉnh", exact: true })
          .click();
        const input = page.getByLabel("Số công tùy chỉnh");
        const inputId = await input.getAttribute("id");
        // Install against the actual labeled field, not an assumed DOM id.
        await page.evaluate(
          (id) =>
            document.getElementById(id).addEventListener("input", () => {
              const start = performance.now();
              requestAnimationFrame(() =>
                requestAnimationFrame(() =>
                  window.__feedback.push({
                    type: "keypress",
                    ms: performance.now() - start,
                  }),
                ),
              );
            }),
          inputId,
        );
        await input.focus();
        for (let i = 0; i < 30; i++) {
          await page.keyboard.press("ControlOrMeta+a");
          await page.keyboard.press(String((i % 2) + 1));
          await page.evaluate(
            () =>
              new Promise((r) =>
                requestAnimationFrame(() => requestAnimationFrame(r)),
              ),
          );
        }
        await page
          .getByRole("button", { name: "Hủy", exact: true })
          .last()
          .click();
        await page
          .getByRole("button", {
            name: "Bỏ phần nhập và tiếp tục",
            exact: true,
          })
          .click();
        const feedback = await page.evaluate(() => window.__feedback);
        metric.editorMs = summary(
          feedback.filter((x) => x.type === "editor").map((x) => x.ms),
        );
        metric.inputMs = summary(
          feedback.filter((x) => x.type === "keypress").map((x) => x.ms),
        );
        metric.scroll = [];
        for (let i = 0; i < 5; i++) {
          metric.scroll.push(await page.evaluate(measureScrollFrames));
        }
        metric.scrollFramesMs = summary(metric.scroll.flat());
        delete metric.scroll;
      }
      const heap = async () => {
        await cdp.send("HeapProfiler.collectGarbage");
        const { metrics } = await cdp.send("Performance.getMetrics");
        return metrics.find((x) => x.name === "JSHeapUsedSize").value;
      };
      // Stabilize before baseline; then 10 month/editor close cycles with no writes.
      const cycle = async () => {
        await page.getByLabel("Tháng chấm công").fill("2026-09");
        await ready(page);
        await page.getByLabel("Tháng chấm công").fill("2026-10");
        await ready(page);
        await page.locator("button[data-cell]").first().click();
        await closeEditor();
      };
      await cycle();
      await cycle();
      const baseline = await heap();
      metric.heapBytes = [baseline];
      for (let i = 0; i < 10; i++) {
        await cycle();
        metric.heapBytes.push(await heap());
      }
      metric.domAfterHeap = await cdp.send("Memory.getDOMCounters");
      if (size === 1000) {
        // Diagnostics run after every budget sample and heap measurement, so
        // tracing cannot contaminate measured feedback/frame intervals.
        const traceComplete = new Promise((done) =>
          cdp.once("Tracing.tracingComplete", done),
        );
        await cdp.send("Tracing.start", {
          categories: "devtools.timeline",
          transferMode: "ReturnAsStream",
        });
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.start");
        await page.locator("button[data-cell]").first().click();
        await page
          .getByRole("button", { name: "Tùy chỉnh", exact: true })
          .click();
        await page.getByLabel("Số công tùy chỉnh").fill("2");
        await page.evaluate(
          () =>
            new Promise((r) =>
              requestAnimationFrame(() => requestAnimationFrame(r)),
            ),
        );
        await closeEditor();
        const { profile } = await cdp.send("Profiler.stop");
        await writeFile(
          resolve(s.runDir, "interaction.cpuprofile"),
          JSON.stringify(profile),
        );
        metric.cpuProfile = resolve(s.runDir, "interaction.cpuprofile");
        await cdp.send("Tracing.end");
        const { stream } = await traceComplete;
        let trace = "";
        for (;;) {
          const part = await cdp.send("IO.read", { handle: stream });
          trace += part.data;
          if (part.eof) break;
        }
        await cdp.send("IO.close", { handle: stream });
        metric.interactionTrace = resolve(s.runDir, "interaction-trace.json");
        await writeFile(metric.interactionTrace, trace);
      }
      metric.heapGrowthPercent = (metric.heapBytes.at(-1) / baseline - 1) * 100;
      metric.heapMonotonic = metric.heapBytes
        .slice(1)
        .every((n, i) => n > metric.heapBytes[i]);
      const b = metric.budgets;
      metric.checks = {
        api: b.apiP95Ms === null ? "NO_BUDGET" : metric.apiMs.p95 <= b.apiP95Ms,
        load:
          b.loadMs === null ? "NO_BUDGET" : metric.coldLoadMs.p95 <= b.loadMs,
        editor: metric.editorMs.p95 <= b.editorP95Ms,
        input: metric.inputMs.p95 <= b.inputP95Ms,
        scroll:
          metric.scrollFramesMs.p95 <= 33 && metric.scrollFramesMs.max <= 200,
        heap: metric.heapGrowthPercent <= 20 && !metric.heapMonotonic,
      };
      metric.result = Object.values(metric.checks).includes(false)
        ? "FAILED"
        : "PASS";
      if (metric.result === "FAILED") failed = true;
    } catch (error) {
      metricError = error;
      metric.result = "FAILED";
      metric.error = error.message;
      failed = true;
      console.error(`Benchmark ${size} failed: ${error.message}`);
    } finally {
      try {
        await withCleanup(
          async () => {
            if (metricError) throw metricError;
          },
          () => context?.close(),
          () => s.stop(),
        );
      } catch (error) {
        failed = true;
        metric.result = "FAILED";
        // Keep a measurement failure distinct from cleanup failures. Never
        // serialize nested DB errors from fixture invalidation.
        metric.error ??= error.message;
        if (error instanceof AggregateError)
          metric.cleanupError = error.errors
            .slice(metricError ? 1 : 0)
            .map((e) => e.message)
            .join("; ");
      }
      await writeFile(reportFile, JSON.stringify(report, null, 2));
    }
    // Publish a size result only after its owned resources have been released.
    console.log(
      JSON.stringify({
        size,
        result: metric.result,
        checks: metric.checks,
        cold: metric.coldLoadMs?.p95,
        api: metric.apiMs?.p95,
        editor: metric.editorMs?.p95,
        input: metric.inputMs?.p95,
        frame: metric.scrollFramesMs?.p95,
        freeze: metric.scrollFramesMs?.max,
        heapGrowth: metric.heapGrowthPercent,
      }),
    );
  }
} catch (error) {
  failed = true;
  report.error = error.message;
  console.error(`Benchmark prerequisite failed: ${error.message}`);
} finally {
  try {
    await browser.close();
  } catch (error) {
    failed = true;
    report.cleanupError = error.message;
  }
  report.result = failed ? "FAILED" : "PASS";
  await writeFile(reportFile, JSON.stringify(report, null, 2));
}
process.exitCode = failed ? 1 : 0;
console.log(`Benchmark evidence ${reportFile}`);
