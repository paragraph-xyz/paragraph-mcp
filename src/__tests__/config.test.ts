import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "os";
import * as path from "path";

const mockReadFileSync = vi.fn();

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, readFileSync: mockReadFileSync };
});

describe("resolveApiKey", () => {
  const originalEnv = process.env.PARAGRAPH_API_KEY;

  beforeEach(() => {
    delete process.env.PARAGRAPH_API_KEY;
    mockReadFileSync.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PARAGRAPH_API_KEY = originalEnv;
    } else {
      delete process.env.PARAGRAPH_API_KEY;
    }
  });

  it("returns env var when set", async () => {
    process.env.PARAGRAPH_API_KEY = "env-key-123";

    const { resolveApiKey } = await import("../config.js");
    expect(resolveApiKey()).toBe("env-key-123");
  });

  it("returns config file key when env var is not set", async () => {
    const configPath = path.join(os.homedir(), ".paragraph", "config.json");
    mockReadFileSync.mockReturnValue(JSON.stringify({ apiKey: "file-key-456" }));

    const { resolveApiKey } = await import("../config.js");
    const key = resolveApiKey();

    expect(key).toBe("file-key-456");
    expect(mockReadFileSync).toHaveBeenCalledWith(configPath, "utf-8");
  });

  it("returns undefined when neither env nor config file exists", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { resolveApiKey } = await import("../config.js");
    expect(resolveApiKey()).toBeUndefined();
  });

  it("env var takes priority over config file", async () => {
    process.env.PARAGRAPH_API_KEY = "env-key";
    mockReadFileSync.mockReturnValue(JSON.stringify({ apiKey: "file-key" }));

    const { resolveApiKey } = await import("../config.js");
    expect(resolveApiKey()).toBe("env-key");
  });

  it("handles malformed config file gracefully", async () => {
    mockReadFileSync.mockReturnValue("not json{{{");

    const { resolveApiKey } = await import("../config.js");
    expect(resolveApiKey()).toBeUndefined();
  });
});
