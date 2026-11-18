import { parseJsonStrict, validateManifest } from "./validate-manifest.mjs";

const digest = /^[^@\s]+@sha256:[a-f0-9]{64}$/i;
const serviceImages = {
  api: "apiImage",
  gateway: "webImage",
  db: "postgresImage",
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseResolvedCompose(jsonText) {
  if (typeof jsonText !== "string")
    throw new Error("resolved compose JSON must be a string");
  return parseJsonStrict(jsonText);
}

export function verifyResolvedRelease({
  manifest,
  expectedSha,
  composeConfig,
}) {
  const { errors } = validateManifest(manifest);
  if (typeof expectedSha !== "string" || manifest?.releaseSha !== expectedSha)
    errors.push("release SHA does not match expected SHA");
  if (!isObject(composeConfig) || !isObject(composeConfig.services)) {
    errors.push("resolved compose services must be an object");
    return { ok: false, errors };
  }
  const { services } = composeConfig;
  for (const name of Object.keys(services))
    if (!Object.hasOwn(serviceImages, name))
      errors.push(`resolved compose service ${name} is unexpected`);
  for (const [name, field] of Object.entries(serviceImages)) {
    if (!Object.hasOwn(services, name)) {
      errors.push(`resolved compose service ${name} is required`);
      continue;
    }
    const service = services[name];
    if (!isObject(service)) {
      errors.push(`resolved compose service ${name} must be an object`);
      continue;
    }
    if (typeof service.image !== "string" || !digest.test(service.image))
      errors.push(
        `resolved compose service ${name} requires an immutable digest reference`,
      );
    else if (service.image !== manifest?.[field])
      errors.push(
        `resolved compose service ${name} image does not match ${field}`,
      );
  }
  return { ok: errors.length === 0, errors };
}
