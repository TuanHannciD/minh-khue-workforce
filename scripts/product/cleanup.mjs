// Keep the operation's cause while attempting every independent owned cleanup.
export async function withCleanup(operation, ...cleanups) {
  let result, originalError;
  let failed = false;
  try {
    result = await operation();
  } catch (error) {
    failed = true;
    originalError = error;
  }
  const failures = [];
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      [...(failed ? [originalError] : []), ...failures],
      "Owned cleanup failed",
      failed ? { cause: originalError } : undefined,
    );
  if (failed) throw originalError;
  return result;
}
