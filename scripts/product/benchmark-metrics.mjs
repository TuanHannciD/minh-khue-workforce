export function summarize(values) {
  if (!values.length || values.some((n) => !Number.isFinite(n) || n < 0))
    throw new Error("Benchmark requires finite nonnegative samples");
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
}
