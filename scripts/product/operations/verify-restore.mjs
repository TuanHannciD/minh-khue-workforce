export function verifyRestore(result) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(detail ? { detail } : {}) });
  add('targetIdentity', typeof result?.targetIdentity === 'string' && result.targetIdentity.length > 0);
  add('schema', result?.schema?.expected !== undefined && result.schema.expected === result.schema.actual);
  add('migrations', result?.migrations?.expected !== undefined && result.migrations.expected === result.migrations.actual);
  add('counts', result?.counts && Object.values(result.counts).every((count) => Number.isInteger(count) && count >= 0));
  add('relations', result?.relations?.valid === true);
  add('requiredData', result?.requiredData?.valid === true);
  return { verified: checks.every((check) => check.ok), checks };
}
