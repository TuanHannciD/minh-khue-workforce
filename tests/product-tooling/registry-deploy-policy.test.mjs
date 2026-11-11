import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(import.meta.dirname, "../..");
const BASH =
  process.env.MKW_TEST_BASH ??
  (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash");
const HELPER = join(ROOT, "scripts/product/release/pull-exact-images.sh");
const posix = (path) =>
  path
    .replaceAll("\\", "/")
    .replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const WORKFLOW = await readFile(
  join(ROOT, ".github/workflows/deploy.yml"),
  "utf8",
);
const API = "ghcr.io/minh-khue/api@sha256:" + "a".repeat(64);
const WEB = "ghcr.io/minh-khue/web@sha256:" + "b".repeat(64);

function run(cwd, env, script) {
  return new Promise((resolve, reject) => {
    const prelude =
      'stat() { printf "600:%s\\n" "$(id -u)"; }; export -f stat;\n';
    const child = spawn(
      BASH,
      [
        "--noprofile",
        "--norc",
        "-c",
        prelude + (script ?? `bash '${posix(HELPER)}'`),
      ],
      {
        cwd,
        env: { ...process.env, ...env },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function fixture(t, { pull = 0, requireAuth = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "mkw-registry-policy-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin");
  await mkdir(bin);
  await writeFile(join(dir, "token"), "fixture-read-only-token\n");
  await chmod(join(dir, "token"), 0o600);
  const log = join(dir, "docker.log");
  await writeFile(
    join(bin, "docker"),
    `#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\\n' "$*" >> "$DOCKER_LOG"
if [[ "$1 $2" == "login ghcr.io" ]]; then
  IFS= read -r token
  [[ "$token" == fixture-read-only-token ]] || exit 92
  echo "$DOCKER_CONFIG" > "$AUTH_CONFIG_PATH"
  echo fixture-login > "$DOCKER_CONFIG/config.json"
  exit ${pull}
fi
if [[ "$1 $2" == "pull --quiet" ]]; then
  if [[ "${requireAuth}" == true && ! -f "$AUTH_CONFIG_PATH" ]]; then exit 77; fi
  if [[ "$3" == "\${DENY_IMAGE:-}" ]]; then echo fixture-read-only-token >&2; exit 77; fi
  exit ${pull}
fi
if [[ "$1 $2 $3" == "image inspect --format" ]]; then
  case "$5" in
    *api@*) printf '%s\\n' "$DOCKER_INSPECT" ;;
    *web@*) printf '%s\\n' "\${WEB_INSPECT:-$WEB_EXPECTED}" ;;
  esac
  exit 0
fi
if [[ "$1" == compose ]]; then
  case "$6" in
    config) printf 'services:\\n  db:\\n    image: %s\\n  api:\\n    image: %s\\n  gateway:\\n    image: %s\\n' "$MKW_POSTGRES_IMAGE" "$MKW_API_IMAGE" "$MKW_WEB_IMAGE" ;;
    up|run) [[ "\${FAIL_MUTATION:-false}" != true ]] || exit 97 ;;
    ps) ;;
    *) exit 95 ;;
  esac
  exit 0
fi
if [[ "$1" == run ]]; then
  [[ "$*" == *--pull=never* ]] || exit 94
  while [[ "$1" != --entrypoint ]]; do shift; done
  shift 3
  exec "$FIXTURE_NODE" "$@"
fi
exit 91
`,
  );
  await chmod(join(bin, "docker"), 0o755);
  // Explicit POSIX metadata fixture: Windows mode/uid cannot model Linux ACLs.
  await writeFile(
    join(bin, "stat"),
    '#!/usr/bin/env bash\nprintf "%s:%s\\n" "${TOKEN_MODE:-600}" "$(id -u)"\n',
  );
  await chmod(join(bin, "stat"), 0o755);
  return {
    dir,
    log,
    token: join(dir, "token"),
    path: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
  };
}

test("public registry pulls both exact digests and rejects mutable latest", async (t) => {
  const f = await fixture(t, { inspect: API });
  const ok = await run(f.dir, {
    PATH: f.path,
    DOCKER_LOG: f.log,
    DOCKER_INSPECT: API,
    WEB_EXPECTED: WEB,
    MKW_API_IMAGE: API,
    MKW_WEB_IMAGE: WEB,
    MKW_REGISTRY_VISIBILITY: "public",
  });
  assert.equal(ok.code, 0, ok.stderr);
  assert.match(ok.stdout, /REGISTRY_PULL_OK images=2 auth=public/);
  const log = await readFile(f.log, "utf8");
  assert.match(log, /pull --quiet ghcr\.io\/minh-khue\/api@sha256:/);
  assert.match(log, /pull --quiet ghcr\.io\/minh-khue\/web@sha256:/);
  const latest = await run(f.dir, {
    PATH: f.path,
    DOCKER_LOG: f.log,
    MKW_API_IMAGE: "ghcr.io/minh-khue/api:latest",
    MKW_WEB_IMAGE: WEB,
  });
  assert.notEqual(latest.code, 0);
  assert.match(latest.stderr, /immutable digest|required/i);
});

test("private registry authenticates with read-only token file and never prints its contents", async (t) => {
  const f = await fixture(t, { inspect: API });
  const result = await run(f.dir, {
    PATH: f.path,
    DOCKER_LOG: f.log,
    DOCKER_INSPECT: API,
    WEB_EXPECTED: WEB,
    MKW_API_IMAGE: API,
    MKW_WEB_IMAGE: WEB,
    MKW_REGISTRY_VISIBILITY: "private",
    MKW_REGISTRY_PULL_USERNAME: "mkw-pull",
    MKW_REGISTRY_PULL_TOKEN_FILE: f.token,
    AUTH_CONFIG_PATH: join(f.dir, "auth-path"),
    TOKEN_MODE: "600",
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /REGISTRY_PULL_OK images=2 auth=private/);
  assert.doesNotMatch(
    `${result.stdout}\n${result.stderr}`,
    /fixture-read-only-token/,
  );
  assert.match(
    await readFile(f.log, "utf8"),
    /login ghcr\.io --username mkw-pull --password-stdin/,
  );
  const config = (await readFile(join(f.dir, "auth-path"), "utf8")).trim();
  assert.equal(
    (await run(f.dir, { CONFIG_PATH: config }, 'test ! -e "$CONFIG_PATH"'))
      .code,
    0,
  );
});

test("denied pull and manifest digest mismatch fail closed before any later mutation", async (t) => {
  const denied = await fixture(t, { pull: 19, inspect: API });
  const deniedResult = await run(denied.dir, {
    PATH: denied.path,
    DOCKER_LOG: denied.log,
    MKW_API_IMAGE: API,
    MKW_WEB_IMAGE: WEB,
  });
  assert.notEqual(deniedResult.code, 0);
  assert.match(deniedResult.stderr, /pull failed|registry/i);
  assert.doesNotMatch(await readFile(denied.log, "utf8"), /compose|migrate/);

  const mismatch = await fixture(t, {
    inspect: "ghcr.io/minh-khue/api@sha256:" + "c".repeat(64),
  });
  const mismatchResult = await run(mismatch.dir, {
    PATH: mismatch.path,
    DOCKER_LOG: mismatch.log,
    DOCKER_INSPECT: "ghcr.io/minh-khue/api@sha256:" + "c".repeat(64),
    MKW_API_IMAGE: API,
    MKW_WEB_IMAGE: WEB,
  });
  assert.notEqual(mismatchResult.code, 0);
  assert.match(mismatchResult.stderr, /digest mismatch/i);
});

test("deploy handoff carries only registry policy and the helper, never a build write token", () => {
  assert.match(WORKFLOW, /scripts\/product\/release/);
  assert.match(WORKFLOW, /MKW_REGISTRY_PULL_TOKEN_FILE/);
  assert.match(WORKFLOW, /MKW_REGISTRY_VISIBILITY/);
  assert.doesNotMatch(WORKFLOW, /MKW_REGISTRY_PULL_TOKEN\s*:/);
  assert.doesNotMatch(WORKFLOW, /packages:\s*write/);
  assert.match(WORKFLOW, /release-manifest\.json/);
});

test("rollback remote environment authenticates private GHCR with a non-default VPS token path", async (t) => {
  const f = await fixture(t, { requireAuth: true });
  const rollback = (
    await readFile(join(ROOT, ".github/workflows/rollback.yml"), "utf8")
  ).replaceAll("\r\n", "\n");
  const handoff = rollback.slice(
    rollback.indexOf("          printf -v remote_env "),
    rollback.indexOf("          printf -v remote_command '%s bash %q"),
  );
  assert.ok(handoff, "missing rollback remote environment builder");
  const result = await run(
    f.dir,
    {
      PATH: f.path,
      DOCKER_LOG: f.log,
      DOCKER_INSPECT: API,
      WEB_EXPECTED: WEB,
      MKW_WEB_IMAGE: WEB,
      MKW_DEPLOY_PATH: "/home/deploy/mkw-fixture",
      MKW_PROJECT_NAME: "mkw",
      MKW_GATEWAY_PORT: "3200",
      OLD_RELEASE_SHA: "a".repeat(40),
      api_image: API,
      postgres_image: "postgres@sha256:" + "3".repeat(64),
      MKW_ATTESTATION_MODE: "required",
      MKW_ATTESTATION_STATUS: "verified",
      MKW_BACKUP_MAX_AGE_SECONDS: "86400",
      MKW_BACKUP_EXPECTED_KIND: "BACKUP",
      MKW_BACKUP_EXPECTED_HOST: "fixture.invalid",
      MKW_BACKUP_EXPECTED_DATABASE: "mkw",
      MKW_BACKUP_EXPECTED_TARGET_IDENTITY: "fixture-target",
      MKW_REGISTRY_HOST: "ghcr.io",
      MKW_REGISTRY_VISIBILITY: "private",
      MKW_REGISTRY_PULL_USERNAME: "mkw-pull",
      MKW_REGISTRY_PULL_TOKEN_FILE: posix(f.token),
      AUTH_CONFIG_PATH: posix(join(f.dir, "auth-path")),
    },
    `set -Eeuo pipefail\n${handoff}\nprintf '%s\\n' "$remote_env"\n(
    unset MKW_REGISTRY_HOST MKW_REGISTRY_VISIBILITY MKW_REGISTRY_PULL_USERNAME MKW_REGISTRY_PULL_TOKEN_FILE
    eval "$remote_env MKW_WEB_IMAGE='${WEB}' bash '${posix(HELPER)}'"
  )`,
  );
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /MKW_OPERATION_KIND=application-rollback/);
  assert.match(result.stdout, /REGISTRY_PULL_OK images=2 auth=private/);
  const log = await readFile(f.log, "utf8");
  assert.match(log, /login ghcr\.io --username mkw-pull --password-stdin/);
  assert.ok(log.indexOf("login ghcr.io") < log.indexOf(`pull --quiet ${API}`));
  assert.ok(log.includes(`pull --quiet ${WEB}`));
  assert.doesNotMatch(
    result.stdout + result.stderr + log,
    /fixture-read-only-token/,
  );
});
