import { describe, expect, it } from "vitest";
import { runLocalShell } from "../src/local-shell.js";

describe("runLocalShell", () => {
  it("echoes the command line and captures combined output", async () => {
    const lines: string[] = [];
    await runLocalShell("echo dsht-shell-ok", (text) => lines.push(text));
    expect(lines[0]).toBe("$ echo dsht-shell-ok");
    expect(lines.join("\n")).toContain("dsht-shell-ok");
  });

  it("reports non-zero exits as [exit N]", async () => {
    const lines: string[] = [];
    await runLocalShell("exit 7", (text) => lines.push(text));
    expect(lines.some((line) => line.includes("[exit 7]"))).toBe(true);
  });
});
