// The sole command catalog. Environment setup and acquisition belong to callers.
export function getCheckPlan(profile) {
  if (profile === "release-tooling")
    return [
      {
        id: "tooling-release",
        executable: "pnpm",
        args: ["run", "product:test:tooling:release"],
      },
    ];
  if (profile !== "quality")
    throw Object.assign(new Error("CHECK_PLAN_INVALID"), {
      code: "CHECK_PLAN_INVALID",
    });
  return [
    ["lint", ["run", "product:lint"]],
    ["format", ["run", "product:format:check"]],
    ["typecheck", ["run", "product:typecheck"]],
    ["build", ["run", "product:build"]],
    ["tooling-fast", ["run", "product:test:tooling:ci"]],
    ["sandbox", ["run", "product:test:sandbox"]],
    ["web", ["--filter", "@mkw/web", "test", "--run", "--maxWorkers=2"]],
    ["api", ["--filter", "@mkw/api", "test"]],
    ["contract", ["run", "product:contract:check"]],
    ["boundaries", ["run", "product:boundaries"]],
  ].map(([id, args]) => ({ id, executable: "pnpm", args }));
}
