/** Node resolve hook: `@/*` → apps/web/*, and add `.ts` for extensionless relatives. */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const webRoot = path.resolve(import.meta.dirname, "..");

function withTsExt(specifier, parentURL) {
  if (!parentURL) return null;
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) return null;
  if (path.extname(specifier)) return null;
  const base = path.dirname(fileURLToPath(parentURL));
  for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
    const candidate = path.join(base, specifier + ext);
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    for (const ext of ["", ".ts", ".tsx", ".js"]) {
      const candidate = path.join(webRoot, rel + ext);
      if (existsSync(candidate) && !existsSync(path.join(candidate, "package.json"))) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  const extended = withTsExt(specifier, context.parentURL);
  if (extended) return nextResolve(extended, context);
  return nextResolve(specifier, context);
}
