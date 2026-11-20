import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function isGnuTar(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return result.status === 0 && /^tar \(GNU tar\)/m.test(result.stdout);
}

function windowsGnuTar() {
  const candidates = [
    process.env.ProgramFiles &&
      `${process.env.ProgramFiles}\\Git\\usr\\bin\\tar.exe`,
    process.env["ProgramFiles(x86)"] &&
      `${process.env["ProgramFiles(x86)"]}\\Git\\usr\\bin\\tar.exe`,
  ].filter(Boolean);
  return candidates.find(
    (candidate) => existsSync(candidate) && isGnuTar(candidate),
  );
}

const explicit = process.env.MKW_SNAPSHOT_TEST_TAR;
const command =
  explicit ?? (process.platform === "win32" ? windowsGnuTar() : "tar");

if (!command) {
  throw new Error(
    "Windows snapshot extraction requires Git GNU tar 1.35+; install Git for Windows or set MKW_SNAPSHOT_TEST_TAR to a GNU tar executable",
  );
}

if (explicit && process.platform === "win32" && !isGnuTar(explicit)) {
  throw new Error(
    `MKW_SNAPSHOT_TEST_TAR must select GNU tar for Windows PAX/UTF-8 extraction: ${explicit}`,
  );
}

export const snapshotTar = {
  command,
  options: process.platform === "win32" ? ["--force-local"] : [],
};
