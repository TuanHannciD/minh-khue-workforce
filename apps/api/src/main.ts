import { createApp } from "#app/bootstrap.js";

const port = Number(process.env["PORT"] ?? "3001");
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("Invalid PORT");
const app = await createApp(process.env["WEB_ORIGIN"]);
await app.listen(port, "127.0.0.1");
console.log(`MKW bootstrap API listening at ${await app.getUrl()}`);
