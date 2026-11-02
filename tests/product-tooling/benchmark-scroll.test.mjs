import test from "node:test";
import assert from "node:assert/strict";
import { measureScrollFrames } from "../../scripts/product/benchmark-scroll.mjs";
test("first RAF predating registration starts the interval clock instead of producing a negative frame", async () => {
  const queue = [];
  const region = {
    scrollHeight: 1100,
    clientHeight: 100,
    scrollWidth: 1100,
    clientWidth: 100,
  };
  const original = {
    raf: globalThis.requestAnimationFrame,
    document: globalThis.document,
    performance: globalThis.performance,
  };
  try {
    globalThis.requestAnimationFrame = (callback) => queue.push(callback);
    globalThis.document = { querySelector: () => region };
    globalThis.performance = { now: () => 110 };
    const result = measureScrollFrames();
    for (const timestamp of [100, 120, 5120]) queue.shift()(timestamp);
    assert.deepEqual(await result, [20, 5000]);
    assert.equal(region.scrollTop, 1004);
  } finally {
    globalThis.requestAnimationFrame = original.raf;
    globalThis.document = original.document;
    globalThis.performance = original.performance;
  }
});

test("trusted drag frame clock does not programmatically move the table", async () => {
  const queue = [],
    region = {
      scrollHeight: 1100,
      clientHeight: 100,
      scrollWidth: 1100,
      clientWidth: 100,
      scrollTop: 17,
      scrollLeft: 19,
    };
  const raf = globalThis.requestAnimationFrame,
    document = globalThis.document;
  try {
    globalThis.requestAnimationFrame = (callback) => queue.push(callback);
    globalThis.document = { querySelector: () => region };
    const result = measureScrollFrames({ scroll: false });
    for (const timestamp of [100, 120, 5120]) queue.shift()(timestamp);
    assert.deepEqual(await result, [20, 5000]);
    assert.equal(region.scrollTop, 17);
    assert.equal(region.scrollLeft, 19);
  } finally {
    globalThis.requestAnimationFrame = raf;
    globalThis.document = document;
  }
});
