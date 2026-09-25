// Loads KEY=value lines from .env into process.env for the local scripts.
// (Vercel reads variables from the dashboard instead; this file isn't deployed.)

import { readFileSync } from "node:fs";
import path from "node:path";

try {
  const lines = readFileSync(path.join(process.cwd(), ".env"), "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trim().startsWith("#")) continue;
    const [, key, raw] = match;
    const value = raw.replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // No .env file: rely on variables already set in the shell.
}
