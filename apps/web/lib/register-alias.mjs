import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const loader = pathToFileURL(path.join(import.meta.dirname, "alias-loader.mjs")).href;
register(loader);
