import { execFileSync } from "node:child_process";
execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
console.log("Enabled repository Git hooks at .githooks");
