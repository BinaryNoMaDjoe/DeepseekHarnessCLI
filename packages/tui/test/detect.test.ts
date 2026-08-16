import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { detectTerminalScheme, type DetectOptions } from "../src/theme.js";

function fakeIo() {
  const stdin = new EventEmitter() as EventEmitter &
    DetectOptions["stdin"] & { emitData(chunk: string): void };
  let raw = false;
  stdin.setRawMode = (mode: boolean) => {
    raw = mode;
  };
  stdin.resume = () => undefined;
  (stdin as EventEmitter).on = stdin.on.bind(stdin);
  const writes: string[] = [];
  const stdout = {
    isTTY: true,
    write: (text: string) => {
      writes.push(text);
    },
  };
  return {
    stdin,
    stdout,
    writes,
    respond(chunk: string) {
      (stdin as EventEmitter).emit("data", Buffer.from(chunk));
    },
    raw: () => raw,
  };
}

describe("detectTerminalScheme", () => {
  it("resolves dark from the OSC 997 report", async () => {
    const io = fakeIo();
    const probe = detectTerminalScheme({ stdin: io.stdin, stdout: io.stdout, timeoutMs: 1000 });
    io.respond("\u001b[?997;1n");
    await expect(probe).resolves.toBe("dark");
  });

  it("resolves light from the OSC 997 report", async () => {
    const io = fakeIo();
    const probe = detectTerminalScheme({ stdin: io.stdin, stdout: io.stdout, timeoutMs: 1000 });
    io.respond("\u001b[?997;2n");
    await expect(probe).resolves.toBe("light");
  });

  it("resolves from a split OSC 11 background response", async () => {
    const io = fakeIo();
    const probe = detectTerminalScheme({ stdin: io.stdin, stdout: io.stdout, timeoutMs: 1000 });
    io.respond("\u001b]11;rgb:f0");
    io.respond("f0/f0f0\u0007");
    await expect(probe).resolves.toBe("light");
  });

  it("returns null on timeout and swallows late responses", async () => {
    const io = fakeIo();
    const probe = detectTerminalScheme({ stdin: io.stdin, stdout: io.stdout, timeoutMs: 50 });
    await expect(probe).resolves.toBeNull();
    // Late response must not throw or mutate anything.
    expect(() => io.respond("\u001b]11;rgb:0000/0000/0000\u0007")).not.toThrow();
  });

  it("returns null without a TTY", async () => {
    const io = fakeIo();
    io.stdin.isTTY = false;
    await expect(
      detectTerminalScheme({ stdin: io.stdin, stdout: io.stdout, timeoutMs: 100 }),
    ).resolves.toBeNull();
  });
});
