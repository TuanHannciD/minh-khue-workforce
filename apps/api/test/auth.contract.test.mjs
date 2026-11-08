import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/bootstrap.js";

test("auth routes reject anonymous sessions and generic invalid credentials", async () => {
  const app = await createApp("http://127.0.0.1:5173");
  try {
    await app.listen(0, "127.0.0.1");
    const base = `${await app.getUrl()}/api/v1/auth`;
    const session = await fetch(`${base}/session`);
    assert.equal(session.status, 401);
    assert.equal((await session.json()).error.code, "SESSION_REQUIRED");
    for (const path of ["signup", "reset-password", "admin"]) {
      assert.equal((await fetch(`${base}/${path}`)).status, 404);
    }
  } finally {
    await app.close();
  }
});
