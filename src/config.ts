import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface Config {
  apiKey?: string;
}

function getConfigPath(): string {
  return path.join(os.homedir(), ".paragraph", "config.json");
}

function readConfig(): Config {
  try {
    const data = fs.readFileSync(getConfigPath(), "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Resolves the API key from:
 * 1. PARAGRAPH_API_KEY env var (highest priority)
 * 2. ~/.paragraph/config.json (shared with CLI)
 */
export function resolveApiKey(): string | undefined {
  return process.env.PARAGRAPH_API_KEY || readConfig().apiKey;
}
