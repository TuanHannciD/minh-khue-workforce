export function summarize(values) {
  if (!values.length || values.some((n) => !Number.isFinite(n) || n < 0))
    throw new Error("Benchmark requires finite nonnegative samples");
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values,
    median:
      (sorted[Math.floor((sorted.length - 1) / 2)] +
        sorted[Math.floor(sorted.length / 2)]) /
      2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
}

export function retainedMetrics(metric) {
  if (!metric) throw new Error("Missing retained benchmark size");
  const result = { ...metric };
  for (const [name, value] of Object.entries(metric)) {
    // Resource descriptors are metadata, not timing samples. All remaining raw
    // arrays and every metric.samples must pass the same validation as fresh data.
    if (name === "jsResources") continue;
    try {
      if (Array.isArray(value)) {
        summarize(value);
        if (name === "heapBytes") {
          result.heapGrowthPercent = (value.at(-1) / value[0] - 1) * 100;
          result.heapMonotonic = value.slice(1).every((n, i) => n > value[i]);
        }
      } else if (value && typeof value === "object" && "samples" in value) {
        result[name] = summarize(value.samples);
      }
    } catch (error) {
      throw new Error(
        `Retained size${metric.size ?? "unknown"} ${name}: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }
  return result;
}
