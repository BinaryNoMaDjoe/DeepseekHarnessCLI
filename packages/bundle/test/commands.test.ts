import { describe, expect, it, vi } from "vitest";
import { createDshClient, createFakeAdapter } from "@deepseek-harness/sdk";
import type { DialogHost, DialogRequest } from "@deepseek-harness/tui";
import { buildCommands, type CommandDeps } from "../src/commands.js";

function makeDeps(overrides: Partial<CommandDeps> = {}) {
  const adapter = createFakeAdapter();
  const client = createDshClient({ adapter });
  const dialogs: { requests: DialogRequest[]; results: unknown[] } = { requests: [], results: [] };
  const host: DialogHost = {
    open: async (request) => {
      dialogs.requests.push(request);
      return dialogs.results.shift() as never;
    },
  };
  const deps: CommandDeps = {
    ctx: { get: () => undefined },
    client,
    adapter: adapter as unknown as CommandDeps["adapter"],
    currentModel: () => ({ provider: "deepseek-official", model: "deepseek-v4-flash" }),
    saveModel: vi.fn(async () => undefined),
    permissionMode: "workspace-write",
    themes: {
      current: () => "auto",
      available: () => [
        { name: "auto", displayName: "Auto (跟随终端)", builtin: true, mode: "auto" },
        { name: "deepseek-dark", displayName: "DeepSeek Dark", builtin: true, mode: "dark" },
      ],
      set: vi.fn(() => true),
    } as unknown as CommandDeps["themes"],
    dialogs: () => host,
    ...overrides,
  };
  return { deps, adapter, client, dialogs, host };
}

function find(commands: ReturnType<typeof buildCommands>, name: string) {
  return commands.find((command) => command.name === name);
}

describe("bundle commands", () => {
  it("/theme opens a list dialog and persists the pick", async () => {
    const { deps, dialogs } = makeDeps();
    const commands = buildCommands(deps);
    const emitted: string[] = [];
    const context = {
      agent: null,
      repl: null as never,
      emitLocal: (text: string) => emitted.push(text),
    };
    dialogs.results.push(["deepseek-dark"]);
    await find(commands, "theme")!.run([], context);
    expect(dialogs.requests[0]?.kind).toBe("list");
    expect(dialogs.requests[0]?.items.some((item) => item.id === "deepseek-dark")).toBe(true);
    expect(deps.themes.set).toHaveBeenCalledWith("deepseek-dark");
    expect(emitted.some((line) => line.includes("theme set to deepseek-dark"))).toBe(true);
  });

  it("/theme with an arg sets directly without a dialog", async () => {
    const { deps, dialogs } = makeDeps();
    const commands = buildCommands(deps);
    const emitted: string[] = [];
    const context = {
      agent: null,
      repl: null as never,
      emitLocal: (text: string) => emitted.push(text),
    };
    await find(commands, "theme")!.run(["deepseek-light"], context);
    expect(dialogs.requests.length).toBe(0);
    expect(deps.themes.set).toHaveBeenCalledWith("deepseek-light");
  });

  it("/model opens a fields dialog and saves the selection", async () => {
    const { deps, dialogs } = makeDeps();
    const commands = buildCommands(deps);
    const emitted: string[] = [];
    const context = {
      agent: null,
      repl: null as never,
      emitLocal: (text: string) => emitted.push(text),
    };
    dialogs.results.push({ provider: "deepseek-official", model: "deepseek-v4-pro" });
    await find(commands, "model")!.run([], context);
    expect(dialogs.requests[0]?.kind).toBe("fields");
    expect(deps.saveModel).toHaveBeenCalledWith({
      provider: "deepseek-official",
      model: "deepseek-v4-pro",
    });
  });

  it("/sessions opens a searchable list dialog and resumes the pick", async () => {
    const adapter = createFakeAdapter();
    const { deps, dialogs, client } = makeDeps({
      adapter: adapter as unknown as CommandDeps["adapter"],
    });
    adapter.listSessions = vi.fn(async () => [{ id: "session-abc", title: "old work" }]) as never;
    const resume = vi.spyOn(client, "resumeSession");
    const commands = buildCommands({ ...deps, client });
    const emitted: string[] = [];
    const context = {
      agent: null,
      repl: null as never,
      emitLocal: (text: string) => emitted.push(text),
    };
    dialogs.results.push(["session-abc"]);
    await find(commands, "sessions")!.run([], context);
    expect(dialogs.requests[0]?.kind).toBe("list");
    expect(dialogs.requests[0]?.searchable).toBe(true);
    expect(resume).toHaveBeenCalledWith("session-abc");
  });

  it("unknown slash arguments surface local errors", async () => {
    const { deps } = makeDeps({
      themes: {
        current: () => "auto",
        available: () => [],
        set: vi.fn(() => false),
      } as unknown as CommandDeps["themes"],
    });
    const commands = buildCommands(deps);
    const emitted: string[] = [];
    const context = {
      agent: null,
      repl: null as never,
      emitLocal: (text: string) => emitted.push(text),
    };
    await find(commands, "theme")!.run(["nope"], context);
    expect(emitted.some((line) => line.includes("unknown theme"))).toBe(true);
  });
});
