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

  it("registers the short aliases for every session command", () => {
    const { deps } = makeDeps();
    const commands = buildCommands(deps);
    const expected: Array<[string, string]> = [
      ["sessions", "s"],
      ["resume", "r"],
      ["new", "n"],
      ["export", "e"],
      ["status", "st"],
      ["theme", "t"],
      ["model", "m"],
      ["plan", "p"],
      ["goal", "g"],
      ["compact", "c"],
      ["feedback", "f"],
    ];
    for (const [name, alias] of expected) {
      expect(find(commands, name)?.aliases, name).toContain(alias);
    }
  });

  it("/resume falls back to unique prefix matching", async () => {
    const adapter = createFakeAdapter();
    adapter.listSessions = vi.fn(async () => [
      { id: "session-abcdef", title: "old work" },
      { id: "session-zzzzzz", title: "other" },
    ]) as never;
    const client = createDshClient({ adapter });
    const resume = vi.spyOn(client, "resumeSession");
    resume.mockRejectedValueOnce(new Error("unknown session: session-a"));
    const { deps } = makeDeps({ adapter: adapter as unknown as CommandDeps["adapter"], client });
    const commands = buildCommands(deps);
    const emitted: string[] = [];
    const context = {
      agent: null,
      repl: null as never,
      emitLocal: (text: string) => emitted.push(text),
    };
    await find(commands, "resume")!.run(["session-a"], context);
    expect(resume).toHaveBeenCalledTimes(2);
    expect(resume).toHaveBeenNthCalledWith(2, "session-abcdef");
    expect(emitted.some((line) => line.includes("resumed session-abcdef"))).toBe(true);
  });

  it("/resume lists candidates when a prefix is ambiguous", async () => {
    const adapter = createFakeAdapter();
    adapter.listSessions = vi.fn(async () => [
      { id: "session-abcdef", title: "old work" },
      { id: "session-abcxyz", title: "other" },
    ]) as never;
    const client = createDshClient({ adapter });
    const resume = vi.spyOn(client, "resumeSession");
    resume.mockRejectedValue(new Error("unknown session: session-a"));
    const { deps } = makeDeps({ adapter: adapter as unknown as CommandDeps["adapter"], client });
    const commands = buildCommands(deps);
    const emitted: string[] = [];
    const context = {
      agent: null,
      repl: null as never,
      emitLocal: (text: string) => emitted.push(text),
    };
    await find(commands, "resume")!.run(["session-a"], context);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(emitted.some((line) => line.includes("multiple sessions match /resume session-a"))).toBe(
      true,
    );
    expect(emitted.some((line) => line.includes("session-abcdef"))).toBe(true);
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

  it("/new disposes the PREVIOUS handle, not the freshly created one (regression)", async () => {
    const adapter = createFakeAdapter();
    const origCreate = adapter.createSession.bind(adapter);
    const freshDispose = vi.fn(async () => undefined);
    adapter.createSession = (async (options) => {
      const handle = await origCreate(options);
      (handle as { dispose?: unknown }).dispose = freshDispose;
      return handle;
    }) as typeof adapter.createSession;
    const client = createDshClient({ adapter });
    const old = await client.createSession();
    const oldDispose = vi.fn(async () => undefined);
    (old as { dispose?: unknown }).dispose = oldDispose;
    const { deps } = makeDeps({
      adapter: adapter as unknown as CommandDeps["adapter"],
      client,
    });
    const commands = buildCommands(deps);
    const emitted: string[] = [];
    const context = {
      agent: null,
      repl: null as never,
      emitLocal: (text: string) => emitted.push(text),
    };
    await find(commands, "new")!.run([], context);
    expect(oldDispose).toHaveBeenCalledTimes(1);
    expect(freshDispose).not.toHaveBeenCalled();
    expect(client.current?.sessionId).not.toBe(old.sessionId);
    expect(emitted.some((line) => line.includes("new session:"))).toBe(true);
  });

  it("/sessions disposes the PREVIOUS handle after attaching the pick (regression)", async () => {
    const adapter = createFakeAdapter();
    adapter.listSessions = vi.fn(async () => [{ id: "session-abc", title: "old work" }]) as never;
    const origResume = adapter.resumeSession.bind(adapter);
    const freshDispose = vi.fn(async () => undefined);
    adapter.resumeSession = (async (id, options) => {
      const handle = await origResume(id, options);
      (handle as { dispose?: unknown }).dispose = freshDispose;
      return handle;
    }) as typeof adapter.resumeSession;
    const client = createDshClient({ adapter });
    const old = await client.createSession();
    const oldDispose = vi.fn(async () => undefined);
    (old as { dispose?: unknown }).dispose = oldDispose;
    const { deps, dialogs } = makeDeps({
      adapter: adapter as unknown as CommandDeps["adapter"],
      client,
    });
    const commands = buildCommands(deps);
    const emitted: string[] = [];
    const context = {
      agent: null,
      repl: null as never,
      emitLocal: (text: string) => emitted.push(text),
    };
    dialogs.results.push(["session-abc"]);
    await find(commands, "sessions")!.run([], context);
    expect(oldDispose).toHaveBeenCalledTimes(1);
    expect(freshDispose).not.toHaveBeenCalled();
    expect(client.current?.sessionId).toBe("session-abc");
    expect(emitted.some((line) => line.includes("resumed session-abc"))).toBe(true);
  });

  it("replays history through a BOUND handle method (regression: detached `this`)", async () => {
    const adapter = createFakeAdapter();
    const origCreate = adapter.createSession.bind(adapter);
    adapter.createSession = (async (options) => {
      const handle = await origCreate(options);
      // Mimic DshAgentHandle.replayHistory: it dereferences `this`, so a
      // detached call crashes with "Cannot read properties of undefined".
      (
        handle as unknown as {
          replayHistory(this: unknown, emit: (event: unknown) => void): void;
        }
      ).replayHistory = function (emit) {
        expect(this).toBe(handle);
        emit({ type: "surface/local", text: "replayed-history" });
      };
      return handle;
    }) as typeof adapter.createSession;
    const client = createDshClient({ adapter });
    await client.createSession();
    const replayed: string[] = [];
    client.events.subscribe((event) => {
      if (event.type === "surface/local") replayed.push(event.text);
    });
    const { deps } = makeDeps({
      adapter: adapter as unknown as CommandDeps["adapter"],
      client,
    });
    const commands = buildCommands(deps);
    const emitted: string[] = [];
    const context = {
      agent: null,
      repl: null as never,
      emitLocal: (text: string) => emitted.push(text),
    };
    await find(commands, "new")!.run([], context);
    expect(replayed).toContain("replayed-history");
    expect(emitted.some((line) => line.includes("new session:"))).toBe(true);
  });
});
