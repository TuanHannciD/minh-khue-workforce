// Complete trusted/staging trees; actual entrypoint/receipt/trap code runs under
// real fd9 flock. Docker/curl are external command doubles, never lock doubles.
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { runBash } from "./deploy-account.mjs";
import { writeBundleInventory } from "../../../scripts/product/release/release-bundle.mjs";

const ROOT = resolve(import.meta.dirname, "../../..");
export const SHA = "a".repeat(40),
  CONTROL = "c".repeat(40);
export const images = {
  api: `ghcr.io/example/api@sha256:${"1".repeat(64)}`,
  web: `ghcr.io/example/web@sha256:${"2".repeat(64)}`,
  postgres: `postgres@sha256:${"3".repeat(64)}`,
};
const manifest = {
  schemaVersion: "1",
  releaseSha: SHA,
  sourceRepository: "example/project",
  createdAt: "2026-11-15T00:00:00Z",
  apiImage: images.api,
  webImage: images.web,
  postgresImage: images.postgres,
  artifacts: {
    sbom: { sha256: "4".repeat(64), size: 1 },
    provenance: { sha256: "5".repeat(64), size: 1 },
  },
};
export const flockProbe = await runBash("-c", ["command -v flock"], {
  cwd: ROOT,
});
export const linuxOnly =
  process.platform === "win32" || flockProbe.code !== 0
    ? "Not run: real Linux flock and /home fixture required; no substitute lock"
    : false;

export async function entrypointFixture(t) {
  const root = await mkdtemp("/home/mkw-task6-");
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const p of [
    "bin",
    "trusted/scripts/product",
    "shared",
    "current",
    "staging",
  ])
    await mkdir(join(root, p), { recursive: true });
  await cp(
    join(ROOT, "scripts/product/release"),
    join(root, "trusted/scripts/product/release"),
    { recursive: true },
  );
  for (const p of ["deploy-entrypoint.sh", "post-deploy-verify.sh"])
    await cp(
      join(ROOT, "scripts/product", p),
      join(root, "trusted/scripts/product", p),
    );
  await writeBundleInventory(join(root, "trusted"));
  await writeFile(
    join(root, "shared/api.env"),
    "DATABASE_URL=fixture-private\nWEB_ORIGIN=https://old.test\n",
  );
  await writeFile(join(root, "shared/db.env"), "POSTGRES_DB=mkw\n");
  await writeFile(join(root, "current/compose.rendered.yml"), "old-config\n");
  await writeFile(
    join(root, "resolved.json"),
    JSON.stringify({
      services: {
        api: { image: images.api },
        gateway: { image: images.web },
        db: { image: images.postgres },
      },
    }),
  );
  await writeFile(
    join(root, "bin/docker"),
    `#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$1 $2" == 'compose version' ]]; then exit 0; fi
if [[ "$1" == pull ]]; then [[ "\${PULL_FAIL:-false}" != true ]]; exit; fi
if [[ "$1 $2" == 'image inspect' ]]; then
  if [[ "$*" == *'{{.Id}}'* ]]; then echo fixture-image-id; else printf '%s\\n' "\${@: -1}"; fi
  exit 0
fi
if [[ "$1" == ps ]]; then echo db-current; exit 0; fi
if [[ "$1" == inspect ]]; then
  case "$*" in
    *'{{.State.Running}}'*) printf 'true %s\\n' "\${CURRENT_PG:-$MKW_POSTGRES_IMAGE}" ;;
    *'{{.Config.Image}}'*)
      case "$2" in id-api) echo "$MKW_API_IMAGE" ;; id-gateway) echo "$MKW_WEB_IMAGE" ;; *) echo "$MKW_POSTGRES_IMAGE" ;; esac ;;
    *'{{.Image}}'*) echo fixture-image-id ;;
    *'{{.State.Status}}'*) echo 'running|healthy' ;;
    *) echo fixture-runtime ;;
  esac
  exit 0
fi
if [[ "$1" == run ]]; then
  while [[ "$1" != --entrypoint ]]; do shift; done
  shift 3
  exec node "$@"
fi
if [[ "$1" == compose ]]; then
  if [[ " $* " == *' config '* ]]; then cat "$FIXTURE_RESOLVED"; exit 0; fi
  if [[ " $* " == *' ps -q '* ]]; then echo "id-\${@: -1}"; exit 0; fi
  if [[ " $* " == *' up '* || " $* " == *' run '* ]]; then
    printf '%s\\n' "$*" >> "$MUTATIONS"
    if [[ " $* " == *' up -d --wait --no-deps db '* && -n "\${BARRIER_FIFO:-}" ]]; then
      touch "$BARRIER_REACHED"; IFS= read -r ignored < "$BARRIER_FIFO"
    fi
    if [[ " $* " == *' migrate deploy '* && "\${FAIL_MIGRATION:-false}" == true ]]; then exit 97; fi
  fi
  exit 0
fi
exit 99
`,
  );
  await chmod(join(root, "bin/docker"), 0o755);
  await writeFile(join(root, "bin/curl"), "#!/usr/bin/env bash\nexit 0\n");
  await chmod(join(root, "bin/curl"), 0o755);
  const stage = async (id, backupId = randomUUID()) => {
    const dir = join(root, "staging", `${id}-${randomUUID()}`);
    await mkdir(join(dir, "release/deploy"), { recursive: true });
    await mkdir(join(dir, "operation"));
    await cp(join(root, "trusted"), join(dir, "controls"), { recursive: true });
    await writeFile(
      join(dir, "release/release-manifest.json"),
      JSON.stringify(manifest),
    );
    await writeFile(
      join(dir, "release/deploy/compose.production.yml"),
      "services: {}\n",
    );
    await writeFile(
      join(dir, "operation/backup-ready.json"),
      JSON.stringify({
        schemaVersion: "1",
        kind: "BACKUP",
        backupId,
        releaseSha: SHA,
        createdAt: new Date(Date.now() - 1000).toISOString(),
        retentionUntil: new Date(Date.now() + 86400000).toISOString(),
        dumpSha256: "6".repeat(64),
        size: 10,
        restoreVerified: true,
        storageLocation: "fixture-current",
        databaseIdentity: {
          host: "fixture-db",
          name: "mkw",
          engine: "postgresql",
          targetIdentity: "fixture-target",
        },
      }),
    );
    await writeFile(
      join(dir, "operation/backup-ready.sha256"),
      "fixture-checksum\n",
    );
    for (const part of ["release", "operation"])
      await writeBundleInventory(join(dir, part));
    return dir;
  };
  const env = {
    ...process.env,
    PATH: `${root}/bin:${process.env.PATH}`,
    MKW_DEPLOY_PATH: root,
    MKW_CONTROL_ROOT: join(root, "trusted"),
    MKW_CONTROL_SHA: CONTROL,
    MKW_RELEASE_SHA: SHA,
    MKW_API_IMAGE: images.api,
    MKW_PROJECT_NAME: "fixture",
    MKW_SIMPLE_RELEASE: "true",
    MKW_AUTOMATIC_RELEASE: "false",
    MKW_WEB_ORIGIN: "https://new.test",
    MKW_BACKUP_MAX_AGE_SECONDS: "86400",
    MKW_BACKUP_EXPECTED_HOST: "fixture-db",
    MKW_BACKUP_EXPECTED_DATABASE: "mkw",
    MKW_BACKUP_EXPECTED_TARGET_IDENTITY: "fixture-target",
    MKW_REGISTRY_VISIBILITY: "public",
    FIXTURE_RESOLVED: join(root, "resolved.json"),
    MUTATIONS: join(root, "mutations"),
  };
  const start = (
    id,
    stagePath,
    extra = {},
    entry = join(root, "trusted/scripts/product/deploy-entrypoint.sh"),
  ) => {
    const child = spawn("bash", [entry, "--release", "--staging", stagePath], {
      cwd: ROOT,
      env: { ...env, MKW_OPERATION_ID: id, ...extra },
      detached: true,
      stdio: "pipe",
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (b) => (stdout += b));
    child.stderr.on("data", (b) => (stderr += b));
    child.stdin.end();
    const result = new Promise((ok, fail) => {
      child.on("error", fail);
      child.on("close", (code, signal) => ok({ code, signal, stdout, stderr }));
    });
    t.after(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    });
    return { child, result };
  };
  const events = async (id) =>
    Promise.all(
      (await readdir(join(root, "operations", id)))
        .filter((p) => p.startsWith(id + ".") && p.endsWith(".json"))
        .map(async (p) =>
          JSON.parse(await readFile(join(root, "operations", id, p), "utf8")),
        ),
    );
  const verify = (id, extra = {}) =>
    runBash(join(root, "trusted/scripts/product/post-deploy-verify.sh"), [], {
      cwd: ROOT,
      env: {
        ...env,
        MKW_OPERATION_ID: id,
        RELEASE_SHA: SHA,
        MKW_CONTROL_ROOT: join(root, "controls", CONTROL),
        EXPECTED_API_IMAGE: images.api,
        EXPECTED_WEB_IMAGE: images.web,
        EXPECTED_POSTGRES_IMAGE: images.postgres,
        MKW_GATEWAY_PORT: "3200",
        ...extra,
      },
    });
  return { root, stage, start, events, verify };
}
