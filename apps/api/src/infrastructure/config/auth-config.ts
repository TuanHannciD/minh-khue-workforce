export interface AuthConfig {
  webOrigin: string;
  databaseUrl?: string;
  throttleSecret?: string;
  production?: boolean;
  tlsTerminated?: boolean;
}

export const AUTH_CONFIG = Symbol("AUTH_CONFIG");

export function validateAuthConfig(config: AuthConfig): AuthConfig {
  const origin = new URL(config.webOrigin);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.origin !== config.webOrigin
  )
    throw new Error("WEB_ORIGIN must be an exact HTTP(S) origin");
  if (
    config.production &&
    (origin.protocol !== "https:" ||
      !config.databaseUrl ||
      !config.throttleSecret ||
      config.tlsTerminated !== true)
  )
    throw new Error(
      "Production requires HTTPS origin, database and throttle secret",
    );
  if (
    !config.production &&
    (origin.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname))
  )
    throw new Error("Local HTTP auth is restricted to loopback");
  if (
    config.throttleSecret !== undefined &&
    Buffer.byteLength(config.throttleSecret) < 32
  )
    throw new Error("AUTH_THROTTLE_SECRET requires at least 32 bytes");
  return config;
}
