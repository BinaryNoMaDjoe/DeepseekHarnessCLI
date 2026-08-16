import { describe, expect, it, vi } from "vitest";
import { gitBadge } from "../src/git-badge.js";

describe("gitBadge", () => {
  it("returns the branch with a dirty marker", async () => {
    const exec = vi.fn(
      (cmd: string, args: string[], _opts: unknown, cb: (e: null, out: string) => void) => {
        if (args.includes("rev-parse")) cb(null, "main\n");
        else cb(null, "M file.ts\n");
      },
    ) as never;
    await expect(gitBadge("C:\\repo", { exec: exec as never })).resolves.toBe("git:main●");
  });

  it("returns null when not a repository", async () => {
    const exec = vi.fn(
      (_cmd: string, _args: string[], _opts: unknown, cb: (e: Error, out: string) => void) => {
        cb(new Error("not a repo"), "");
      },
    ) as never;
    await expect(gitBadge("C:\\not-repo", { exec: exec as never })).resolves.toBeNull();
  });

  it("returns null on a detached HEAD", async () => {
    const exec = vi.fn(
      (_cmd: string, _args: string[], _opts: unknown, cb: (e: null, out: string) => void) => {
        cb(null, "HEAD\n");
      },
    ) as never;
    await expect(gitBadge("C:\\repo", { exec: exec as never })).resolves.toBeNull();
  });
});
