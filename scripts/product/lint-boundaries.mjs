import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDependency } from "./boundary-rules.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const normalize = (path) => relative(root, path).replaceAll("\\", "/");

// Immediate feedback for relative imports; the graph gate resolves all aliases,
// packages and symlinks. Reuse its ownership rule rather than guessing by name.
export const crossAppImports = {
  meta: {
    type: "problem",
    schema: [],
    messages: { crossApp: "Use the owning app's generated API contract." },
  },
  create(context) {
    const filename = context.filename;
    const inspect = (node) => {
      const specifier = node.source?.value;
      if (typeof specifier !== "string" || !specifier.startsWith(".")) return;
      const target = resolve(dirname(filename), specifier);
      if (
        checkDependency(
          normalize(filename),
          normalize(target),
          specifier,
        ).includes("cross-app")
      )
        context.report({ node, messageId: "crossApp" });
    };
    return {
      ImportDeclaration: inspect,
      ExportNamedDeclaration: inspect,
      ExportAllDeclaration: inspect,
    };
  },
};
