import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const requireApi = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
export const { Pool } = requireApi("pg");
const normalized = (value) => {
  const path = resolve(value).replaceAll("\\", "/");
  return process.platform === "win32" ? path.toLowerCase() : path;
};

// CLI supports only explicitly enrolled fake sandboxes, including Task11 rehearsal.
// Production target enrollment belongs to the separately approved operations runbook.
export async function openSandboxTarget(
  recordPath,
  alias,
  { signal, deadlineMs, onPool } = {},
) {
  const check = () => {
    if (
      signal?.aborted ||
      (deadlineMs !== undefined && performance.now() >= deadlineMs)
    ) {
      const error = new Error("Sandbox target acquisition stopped");
      error.code = "SANDBOX_TARGET_ABORTED";
      throw error;
    }
  };
  check();
  const target = JSON.parse(await readFile(recordPath, "utf8"));
  const policy =
    alias === "task10-acceptance"
      ? {
          owner: "MKW-PRODUCT-001/Task10",
          directory: "task10-acceptance",
          user: "mkw_task10",
          databases: /^(?:postgres|mkw_acceptance_[a-f0-9_]+)$/,
        }
      : alias === "task9-export"
        ? {
            owner: "MKW-PRODUCT-001/Task9",
            directory: "task9-export",
            user: "mkw_task9",
            databases: /^(?:postgres|mkw_export_[a-f0-9_]+)$/,
          }
        : alias === "task3-auth"
          ? {
              owner: "MKW-PRODUCT-001/Task3",
              directory: "task3-auth",
              user: "mkw_task3",
              databases: /^(?:postgres|mkw_auth_[a-f0-9_]+)$/,
            }
          : alias === "task5-attendance"
            ? {
                owner: "MKW-PRODUCT-001/Task5",
                directory: "task5-attendance",
                user: "mkw_task5",
                databases: /^(?:postgres|mkw_attendance_[a-f0-9_]+)$/,
              }
            : alias === "task7-persistence"
              ? {
                  owner: "MKW-PRODUCT-001/Task7",
                  directory: "task7-persistence",
                  user: "mkw_task7",
                  databases: /^(?:postgres|mkw_persistence_[a-f0-9_]+)$/,
                }
              : alias === "task7-fix-r1"
                ? {
                    owner: "MKW-PRODUCT-001/Task7FixR1",
                    directory: "task7-fix-r1",
                    user: "mkw_task7_r1",
                    databases: /^(?:postgres|mkw_task7_r1_[a-f0-9_]+)$/,
                  }
                : alias === "task8-selection"
                  ? {
                      owner: "MKW-PRODUCT-001/Task8",
                      directory: "task8-selection",
                      user: "mkw_task8",
                      databases: /^(?:postgres|mkw_selection_[a-f0-9_]+)$/,
                    }
                  : alias === "task11-operations"
                    ? {
                        owner: "MKW-PRODUCT-001/Task11",
                        directory: "task11-operations",
                        user: "mkw_task11",
                        databases: /^(?:postgres|mkw_operations_[a-f0-9_]+)$/,
                      }
                    : undefined;
  if (!policy)
    throw new Error("Sandbox alias is outside the authorized allowlist");
  const runRoot = fileURLToPath(
    new URL(
      `../../.agent-runs/MKW-PRODUCT-001/${policy.directory}/`,
      import.meta.url,
    ),
  );
  if (
    target.owner !== policy.owner ||
    target.scope !== "fake-sandbox" ||
    target.alias !== alias ||
    target.host !== "127.0.0.1" ||
    target.user !== policy.user ||
    !Number.isInteger(target.port) ||
    !policy.databases.test(target.database) ||
    normalized(target.dataDirectory) !== normalized(resolve(runRoot, "pg-data"))
  )
    throw new Error("Sandbox target is outside the authorized allowlist");
  const connectionString = `postgresql://${target.user}@127.0.0.1:${target.port}/${target.database}`;
  check();
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 3000,
    // PostgreSQL startup parameter: a server-side statement cancellation bound.
    // pool.end()/a client timer cannot themselves cancel an executing query.
    ...(deadlineMs === undefined
      ? {}
      : {
          statement_timeout: Math.max(
            1,
            Math.ceil(deadlineMs - performance.now()),
          ),
        }),
  });
  let ending;
  const closeErrors = [];
  const end = () => {
    if (!ending)
      ending = Promise.resolve()
        .then(() => pool.end())
        .catch((error) => {
          closeErrors.push(error);
          ending = undefined;
          throw error;
        });
    return ending;
  };
  const abort = () => {
    end().catch(() => {});
  };
  try {
    onPool?.(pool, end);
    signal?.addEventListener("abort", abort, { once: true });
    check();
    const {
      rows: [actual],
    } =
      await pool.query(`SELECT current_database() AS database, current_user AS username,
      host(inet_server_addr()) AS host, inet_server_port() AS port, current_setting('data_directory') AS directory,
      current_setting('server_version') AS version`);
    check();
    if (
      actual.database !== target.database ||
      actual.username !== target.user ||
      actual.host !== target.host ||
      actual.port !== target.port ||
      normalized(actual.directory) !== normalized(target.dataDirectory) ||
      actual.version !== "17.11"
    )
      throw new Error("Sandbox database identity mismatch");
    return { target, pool, connectionString, end };
  } catch (error) {
    try {
      await end();
    } catch {
      // end retains each original close error, including an abort's earlier attempt.
    }
    if (closeErrors.length) {
      throw new AggregateError(
        [error, ...closeErrors],
        "Sandbox target acquisition and close failed",
        { cause: error },
      );
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
