import test from "node:test";
import assert from "node:assert/strict";
import { summarize } from "../../scripts/product/benchmark-metrics.mjs";

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
