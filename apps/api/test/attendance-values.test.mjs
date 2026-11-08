import { test } from "node:test";
import assert from "node:assert/strict";

test("exact half units, per-cell limits, work zero and overtime absence rules", async () => {
  const module =
    await import("../dist/modules/attendance/attendance-values.js").catch(
      () => ({}),
    );
  assert.equal(
    typeof module.normalizeValue,
    "function",
    "attendance value validation must exist",
  );
  const { normalizeValue } = module;
  for (const [kind, values] of [
    ["work", [0.5, 29.5, 30]],
    ["overtime", [0.5, 23.5, 24]],
  ])
    for (const value of values)
      assert.deepEqual(normalizeValue(kind, { type: "number", value }), {
        type: "number",
        value,
      });
  assert.deepEqual(normalizeValue("work", { type: "number", value: 0 }), {
    type: "absence",
  });
  assert.equal(normalizeValue("work", null), null);
  assert.equal(normalizeValue("overtime", null), null);
  assert.deepEqual(normalizeValue("work", { type: "absence" }), {
    type: "absence",
  });
  for (const [kind, values] of [
    ["work", [30.5, 31, -0.5, 3.25, NaN, Infinity]],
    ["overtime", [0, 24.5, 25, -1, 3.25, NaN, Infinity]],
  ])
    for (const value of values)
      assert.throws(
        () => normalizeValue(kind, { type: "number", value }),
        (e) => e.getStatus() === 422,
      );
  assert.throws(
    () => normalizeValue("overtime", { type: "absence" }),
    (e) => e.getStatus() === 422,
  );
});
