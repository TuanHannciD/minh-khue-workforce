import { lstat, realpath, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, parse, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  runIdPattern,
  reportInvalid,
  validatePublicReport,
  projectPublicReport,
  safeReportSummary,
} from "./evidence.mjs";

// Check every component, including caller roots: a symlink must never turn a
// public-only read/write into a read of arbitrary private evidence.
async function noLinks(path) {
  const absolute = resolve(path),
    root = parse(absolute).root;
  let cursor = root;
  for (const part of relative(root, absolute).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    const info = await lstat(cursor);
    if (
      info.isSymbolicLink() ||
      resolve(await realpath(cursor)).toLowerCase() !== cursor.toLowerCase()
    )
      throw reportInvalid();
  }
}
export async function collectPublicReports({
  runId,
  evidenceRoot,
  outputRoot,
}) {
  if (typeof runId !== "string" || !runIdPattern.test(runId))
    throw reportInvalid();
  let report;
  try {
    const input = join(
      resolve(evidenceRoot),
      runId,
      "public",
      "check-report.json",
    );
    await noLinks(input);
    const info = await lstat(input);
    if (!info.isFile() || info.size > 65536) throw reportInvalid();
    report = validatePublicReport(JSON.parse(await readFile(input, "utf8")));
    if (
      report.runId !== runId ||
      report.result === "Not run" ||
      report.primary.code === "REPORT_INCOMPLETE" ||
      (report.result === "Passed" &&
        (report.innerReportUnavailable ||
          report.secondaryErrors.includes("REPORT_INCOMPLETE")))
    )
      throw reportInvalid();
  } catch {
    report = projectPublicReport({
      ...(report?.runId === runId ? report : {}),
      runId,
      result: "Failed",
      primary: {
        ...(report?.runId === runId ? report.primary : {}),
        code: "REPORT_INCOMPLETE",
      },
      innerReportUnavailable: true,
    });
  }
  const output = resolve(outputRoot);
  // Parent exists for runner.temp and fixtures. Never follow a linked destination.
  await noLinks(parse(output).root);
  const parent = resolve(output, "..");
  await noLinks(parent);
  await mkdir(output, { mode: 0o700 }); // no-clobber; stale public output is an error
  await noLinks(output);
  const destination = join(output, "check-report.json");
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  console.log(safeReportSummary(report));
  return { files: [destination], status: report.result };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [runId, evidenceRoot, outputRoot] = process.argv.slice(2);
  collectPublicReports({ runId, evidenceRoot, outputRoot })
    .then(({ status }) => {
      if (status !== "Passed") process.exitCode = 1;
    })
    .catch(() => {
      console.error("CHECK_REPORT code=REPORT_INCOMPLETE");
      process.exitCode = 1;
    });
}
