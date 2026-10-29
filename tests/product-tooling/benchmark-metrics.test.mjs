import test from "node:test";
import assert from "node:assert/strict";
import {
  summarize,
  retainedMetrics,
} from "../../scripts/product/benchmark-metrics.mjs";

test("benchmark nearest-rank p95 preserves a freeze hidden by the median", () => {
  const data = Array(29).fill(16.7).concat([220]);
  const result = summarize(data);
  assert.equal(result.median, 16.7);
  assert.equal(result.p95, 16.7);
  assert.equal(result.max, 220);
  assert.deepEqual(result.samples, data);
});
test("benchmark refuses missing, negative or non-finite samples instead of false green/null JSON", () => {
  for (const samples of [[], [NaN], [Infinity], [-1]])
    assert.throws(() => summarize(samples), /finite nonnegative/);
  assert.deepEqual(summarize([1, 2, 3, 4, 5]), {
    samples: [1, 2, 3, 4, 5],
    median: 3,
    p95: 5,
    max: 5,
  });
});

test("conventional median averages both middle values for even N without changing raw order", () => {
  const values = [9, 1, 5, 3];
  assert.equal(summarize(values).median, 4);
  assert.deepEqual(values, [9, 1, 5, 3]);
});
test("profile reuse validates every retained raw metric and recomputes stale summaries", () => {
  const metric = {
    apiMs: { samples: [1, 3], median: 999, p95: 999, max: 999 },
    heapBytes: [100, 101],
  };
  assert.equal(retainedMetrics(metric).apiMs.median, 2);
  assert.equal(metric.apiMs.median, 999);
  for (const field of [
    "apiMs",
    "editorMs",
    "inputMs",
    "scrollFramesMs",
    "coldLoadMs",
    "warmLoadMs",
    "renderAfterResponseMs",
  ])
    assert.throws(
      () => retainedMetrics({ ...metric, [field]: { samples: [16.7, -1] } }),
      /finite nonnegative/,
    );
  assert.throws(
    () => retainedMetrics({ ...metric, heapBytes: [100, -1] }),
    /finite nonnegative/,
  );
});

test("profile reuse preserves resource metadata while validating raw samples with size/field context", () => {
  const jsResources = [{ path: "/assets/app.js", duration: 1 }];
  const metric = {
    size: 1000,
    jsResources,
    apiMs: { samples: [1, 3], median: 999 },
    heapBytes: [100, 101],
  };
  const reused = retainedMetrics(metric);
  assert.deepEqual(reused.jsResources, jsResources);
  assert.equal(reused.apiMs.median, 2);
  assert.throws(
    () => retainedMetrics({ ...metric, scrollFramesMs: { samples: [-1, 2] } }),
    /size1000.*scrollFramesMs.*finite nonnegative/,
  );
});
