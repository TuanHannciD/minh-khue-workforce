const digest = /^[^@\s]+@sha256:[a-f0-9]{64}$/i;
export function verifyRelease({ manifest, expectedSha, composeText }) {
  const errors = [];
  if (!manifest || typeof manifest !== "object")
    errors.push("manifest is required");
  if (typeof expectedSha !== "string" || manifest?.releaseSha !== expectedSha)
    errors.push("release SHA does not match expected SHA");
  for (const field of ["apiImage", "webImage", "postgresImage"]) {
    if (!digest.test(manifest?.[field] ?? ""))
      errors.push(`${field} is not an immutable digest reference`);
    else if (
      typeof composeText !== "string" ||
      !composeText.includes(manifest[field])
    )
      errors.push(`${field} digest is absent from compose text`);
  }
  if (
    typeof composeText === "string" &&
    /(?:^|\s)image\s*:\s*[^\s@]+(?::[^\s]+)?(?:\s|$)/im.test(composeText)
  )
    errors.push("compose contains mutable image reference");
  return { ok: errors.length === 0, errors };
}
