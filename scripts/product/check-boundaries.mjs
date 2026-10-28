import { cruise } from "dependency-cruiser";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { checkDependency } from "./boundary-rules.mjs";

export async function checkBoundaries(root, apps = ["web", "api"]) {
  const errors = [];
  for (const app of apps) {
    const source = `apps/${app}/src`;
    const configFile = resolve(root, `apps/${app}/tsconfig.json`);
    const config = ts.readConfigFile(configFile, ts.sys.readFile);
    if (config.error)
      throw new Error(
        ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
      );
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      resolve(root, `apps/${app}`),
    );
    const aliases = Object.fromEntries(
      Object.entries(parsed.options.paths ?? {}).map(([key, paths]) => {
        if (
          paths.length !== 1 ||
          !key.endsWith("/*") ||
          !paths[0].endsWith("/*")
        )
          throw new Error("Unsupported alias shape: " + key);
        return [
          key.slice(0, -2),
          resolve(parsed.options.baseUrl ?? root, paths[0].slice(0, -2)),
        ];
      }),
    );
    const result = await cruise(
      [source],
      {
        baseDir: root,
        validate: true,
        tsConfig: { fileName: configFile },
        tsPreCompilationDeps: true,
        // Keep dependency edges for ownership/package checks, stop only traversal.
        doNotFollow: { path: "(?:^|/)node_modules/" },
        enhancedResolveOptions: {
          alias: aliases,
          extensions: [".js", ".jsx", ".ts", ".tsx", ".d.ts", ".json"],
          extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
        },
        ruleSet: {
          forbidden: [
            {
              name: "cycle",
              severity: "error",
              from: {},
              to: { circular: true },
            },
          ],
        },
      },
      { bustTheCache: true },
    );
    if (typeof result.output === "string")
      throw new Error("Expected dependency graph");
    const normalize = (path) =>
      relative(root, resolve(root, path)).replaceAll("\\", "/");
    // The graph uses real paths for cycles/package identity. Also resolve with
    // symlinks preserved so a path through another app's dependencies retains
    // that app's ownership even when pnpm links it to a shared store.
    const ownershipOptions = { ...parsed.options, preserveSymlinks: true };
    const resolutionCache = ts.createModuleResolutionCache(
      root,
      (path) => path,
      ownershipOptions,
    );
    for (const module of result.output.modules) {
      const from = normalize(module.source);
      for (const dependency of module.dependencies) {
        const to = normalize(dependency.resolved);
        const specifier = dependency.module;
        const ownership = ts.resolveModuleName(
          specifier,
          resolve(root, module.source),
          ownershipOptions,
          ts.sys,
          resolutionCache,
        ).resolvedModule;
        const targets = new Set([to]);
        if (ownership) targets.add(normalize(ownership.resolvedFileName));
        for (const target of targets)
          for (const rule of checkDependency(from, target, specifier))
            errors.push(`${rule}: ${from} -> ${specifier}`);
        if (dependency.couldNotResolve)
          errors.push(`unresolved: ${from} -> ${specifier}`);
      }
    }
    for (const violation of result.output.summary.violations)
      errors.push(
        `${violation.rule.name}: ${violation.from} -> ${violation.to}`,
      );
  }
  return [...new Set(errors)];
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const value = (name) =>
    process.argv.includes(name)
      ? process.argv[process.argv.indexOf(name) + 1]
      : undefined;
  const root = resolve(value("--root") ?? ".");
  // dependency-cruiser resolves entry paths relative to cwd; isolate CLI invocation.
  process.chdir(root);
  const app = value("--app");
  if (app && !["web", "api"].includes(app)) throw new Error("Unknown app");
  const errors = await checkBoundaries(root, app ? [app] : undefined);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("Verified product import boundaries and cycles.");
}
