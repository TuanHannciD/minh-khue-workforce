import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "#app/bootstrap.js";
import { createDocument } from "../dist/openapi.js";

test("compiled ESM Nest/Express serves typed health with configured CORS and closes", async () => {
  const app = await createApp("http://127.0.0.1:5173");
  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch(`${await app.getUrl()}/health`, {
      headers: { Origin: "http://127.0.0.1:5173" },
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://127.0.0.1:5173",
    );
    assert.deepEqual(await response.json(), { status: "ok" });
    const missing = await fetch(`${await app.getUrl()}/future-feature`);
    assert.equal(missing.status, 404);
  } finally {
    await app.close();
  }
  const doc = await createDocument();
  assert.equal(doc.openapi, "3.0.3");
  assert.equal(
    doc.paths["/health"].get.responses["200"].content["application/json"].schema
      .$ref,
    "#/components/schemas/HealthDto",
  );
});

test("bootstrap rejects an origin with a path before acquiring a listener", async () => {
  await assert.rejects(
    createApp("http://127.0.0.1:5173/path"),
    /exact HTTP\(S\) origin/,
  );
});
