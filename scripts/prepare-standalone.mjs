import { access, cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const serverJs = path.join(standalone, "server.js");

try {
  await access(serverJs);
} catch {
  throw new Error("Missing .next/standalone/server.js. Build with output: 'standalone' before preparing the server.");
}

await cp(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
await mkdir(path.join(standalone, ".next"), { recursive: true });
await cp(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });

await access(path.join(standalone, "public", "sw.js"));
const staticEntries = await readdir(path.join(standalone, ".next", "static"));
if (staticEntries.length === 0) {
  throw new Error("The standalone server is missing .next/static assets.");
}

console.log("Prepared .next/standalone with public and static assets.");
