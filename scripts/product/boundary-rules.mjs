import { isBuiltin } from "node:module";
import { posix } from "node:path";

// Paths are repository-relative POSIX paths, including in fixture workspaces.
const appOf = (path) => /^apps\/(web|api)(?:\/|$)/.exec(path)?.[1];
const serverPackage =
  /^(?:@prisma\/|prisma(?:\/|$)|@nestjs\/|@mkw\/api(?:\/|$)|pg(?:\/|$))/;
const featureOf = (path) =>
  /^apps\/(?:web|api)\/src\/(?:features|modules)\/([^/]+)/.exec(path)?.[1];
const identity = (path) => {
  const normalized = posix.normalize(path.replaceAll("\\", "/"));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

export function checkDependency(from, to, specifier) {
  from = identity(from);
  to = identity(to);
  const app = appOf(from);
  const rules = [];
  if (
    app === "web" &&
    (serverPackage.test(specifier) ||
      to
        .split(/(?:^|\/)node_modules\//)
        .slice(1)
        .some((path) => serverPackage.test(path)))
  )
    rules.push("web-server-package");
  if (app === "web" && isBuiltin(specifier) && !/\.test\.[jt]sx?$/.test(from))
    rules.push("web-server-package");
  if (app && appOf(to) && app !== appOf(to)) rules.push("cross-app");
  if (
    /\/src\/(?:shared|infrastructure)\//.test(from) &&
    /\/src\/(?:app\/|features\/|modules\/|app\.)/.test(to)
  )
    rules.push("shared-upward");
  if (
    featureOf(to) &&
    featureOf(from) !== featureOf(to) &&
    !/\/(?:features|modules)\/[^/]+\/index\.[cm]?[jt]sx?$/.test(to)
  )
    rules.push("deep-feature");
  if (featureOf(from) && /\/src\/app(?:\/|\.)/.test(to))
    rules.push("feature-upward");
  return rules;
}
