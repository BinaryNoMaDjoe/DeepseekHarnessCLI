import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ThemeManager } from "../src/theme-manager.js";

const HOME = join(process.cwd(), "test", ".tmp-theme-home");

afterEach(() => {
  delete process.env.DSH_TUI_THEME;
  rmSync(HOME, { recursive: true, force: true });
});

describe("ThemeManager", () => {
  it("exposes the built-in themes", () => {
    const manager = new ThemeManager(HOME);
    const names = manager.available().map((entry) => entry.name);
    expect(names).toContain("deepseek-dark");
    expect(names).toContain("deepseek-light");
    expect(manager.available().every((entry) => entry.builtin)).toBe(true);
  });

  it("loads custom themes from the themes directory", () => {
    const manager = new ThemeManager(HOME);
    const dir = join(HOME, "themes");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "mono.json"),
      JSON.stringify({
        name: "mono",
        mode: "light",
        background: "white",
        colors: {
          primary: "black",
          secondary: "gray",
          accent: "black",
          success: "black",
          error: "black",
          warning: "black",
          code: "black",
          heading: "black",
          diffAdd: "black",
          diffDel: "gray",
          diffContext: "gray",
        },
      }),
      "utf8",
    );
    const spec = manager.load("mono");
    expect(spec?.name).toBe("mono");
    expect(spec?.mode).toBe("light");
    expect(manager.available().some((entry) => entry.name === "mono" && !entry.builtin)).toBe(true);
  });

  it("rejects invalid custom themes", () => {
    const manager = new ThemeManager(HOME);
    mkdirSync(join(HOME, "themes"), { recursive: true });
    writeFileSync(join(HOME, "themes", "broken.json"), "{not json", "utf8");
    expect(manager.load("broken")).toBeNull();
    expect(manager.load("missing")).toBeNull();
  });

  it("persists and reads the selection", () => {
    const manager = new ThemeManager(HOME);
    expect(manager.current()).toBe("auto");
    expect(manager.set("deepseek-light")).toBe(true);
    expect(manager.current()).toBe("deepseek-light");
    expect(manager.set("auto")).toBe(true);
    expect(manager.current()).toBe("auto");
    expect(manager.set("nope")).toBe(false);
    expect(existsSync(join(HOME, "tui.json"))).toBe(true);
  });

  it("honors the DSH_TUI_THEME env override when loadable", () => {
    const manager = new ThemeManager(HOME);
    process.env.DSH_TUI_THEME = "deepseek-light";
    expect(manager.current()).toBe("deepseek-light");
    process.env.DSH_TUI_THEME = "auto";
    expect(manager.current()).toBe("auto");
    process.env.DSH_TUI_THEME = "missing";
    expect(manager.current()).toBe("auto");
  });
});
