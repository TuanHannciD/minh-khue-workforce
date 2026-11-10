import { createApp } from "#app/bootstrap.js";

const port = Number(process.env["PORT"] ?? "3001");
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("Invalid PORT");
if (
  !process.env.DATABASE_URL ||
  !process.env.AUTH_THROTTLE_SECRET ||
  !process.env.WEB_ORIGIN
)
  throw new Error(
    "DATABASE_URL, AUTH_THROTTLE_SECRET and WEB_ORIGIN are required",
  );
const app = await createApp(process.env.WEB_ORIGIN, {
  databaseUrl: process.env.DATABASE_URL,
  throttleSecret: process.env.AUTH_THROTTLE_SECRET,
  production: process.env.NODE_ENV === "production",
  tlsTerminated: process.env.TLS_TERMINATED === "true",
});
await app.listen(port, process.env.HOST ?? "127.0.0.1");
console.log(`MKW bootstrap API listening at ${await app.getUrl()}`);
