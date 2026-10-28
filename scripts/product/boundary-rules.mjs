import { isBuiltin } from "node:module";

// Paths are repository-relative POSIX paths, including in fixture workspaces.
const appOf = (path) => /^apps\/(web|api)\/src\//.exec(path)?.[1];
const featureOf = (path) =>
  /^apps\/(?:web|api)\/src\/(?:features|modules)\/([^/]+)/.exec(path)?.[1];

export function checkDependency(from, to, specifier) {
  const app = appOf(from);
  const rules = [];
  if (
    app === "web" &&
    /^(?:@prisma\/|prisma(?:\/|$)|@nestjs\/|@mkw\/api(?:\/|$)|pg(?:\/|$))/.test(
      specifier,
    )
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
