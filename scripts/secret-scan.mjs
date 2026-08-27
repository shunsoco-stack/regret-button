import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXCLUDED_DIRECTORIES = new Set([
  ".git", ".next", ".vercel", ".tools", ".cache", ".npm-cache", ".pnpm-store",
  "node_modules", "coverage", "test-results", "playwright-report",
]);

const RULES = [
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g },
  { id: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{40,255})\b/g },
  { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "google-api-key", pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { id: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: "stripe-live-key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
  { id: "openai-style-key", pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/g },
  { id: "vercel-token", pattern: /\b(?:vercel|vcp)_[A-Za-z0-9_-]{24,}\b/g },
  { id: "database-credentials", pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?):\/\/[^\s:/]+:[^\s@/]+@/g },
  {
    id: "credential-assignment",
    pattern: /\b(?:[a-z0-9_]*(?:secret|token|password|api_key|access_key)[a-z0-9_]*|apiKey)\s*["']?\s*[:=]\s*["']?([A-Za-z0-9_+/=-]{16,})/gi,
    placeholder: true,
  },
];

function finding(file, line, rule) {
  return { file: file.replaceAll("\\", "/"), line, rule };
}

export function scanText(file, source) {
  const findings = [];
  for (const rule of RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of source.matchAll(pattern)) {
      if (rule.placeholder && /^(?:your_|example_|replace_|placeholder|changeme)/i.test(match[1] || "")) continue;
      findings.push(finding(file, source.slice(0, match.index).split("\n").length, rule.id));
    }
  }
  return findings;
}

export async function scanRepository(root) {
  const findings = [];
  let scanned = 0;
  let binary = 0;

  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      findings.push(finding(relative(root, directory) || ".", 1, "unreadable-directory"));
      return;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const path = join(directory, entry.name);
      const file = relative(root, path);
      if (entry.isSymbolicLink()) {
        findings.push(finding(file, 1, "symlink-not-scanned"));
        continue;
      }
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const name = basename(path);
      if (/^\.env(?:\.|$)/i.test(name) && !/^\.env(?:\.[a-z0-9_-]+)*\.example$/i.test(name)) {
        findings.push(finding(file, 1, "non-example-env-file"));
      }
      if (/\.(?:p12|pfx|key|pem|jks|keystore)$/i.test(name) || /^id_(?:rsa|dsa|ecdsa|ed25519)$/i.test(name)) {
        findings.push(finding(file, 1, "sensitive-key-file"));
      }
      let bytes;
      try {
        bytes = await readFile(path);
      } catch {
        findings.push(finding(file, 1, "unreadable-file"));
        continue;
      }
      if (bytes.includes(0)) {
        binary += 1;
        continue;
      }
      scanned += 1;
      findings.push(...scanText(file, bytes.toString("utf8")));
    }
  }

  await visit(root);
  const unique = [...new Map(findings.map((item) => [`${item.file}:${item.line}:${item.rule}`, item])).values()];
  return { findings: unique, scanned, binary };
}

async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = await scanRepository(root);
  for (const item of result.findings) {
    // Never print the matched line, token, or credential value.
    console.error(`[secret-scan] BLOCK ${item.file}:${item.line} (${item.rule})`);
  }
  if (result.findings.length) {
    console.error(`[secret-scan] Failed: ${result.findings.length} finding(s). No secret values were printed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`[secret-scan] Passed: ${result.scanned} text files checked; ${result.binary} binary files not inspected.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
