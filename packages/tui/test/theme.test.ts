import { describe, expect, it, beforeAll } from "vitest";
import chalk from "chalk";
import { buildTheme, DEEPSEEK_DARK, DEEPSEEK_LIGHT, validateThemeSpec } from "../src/theme.js";

beforeAll(() => {
  // Force ANSI output: chalk auto-disables colors under vitest.
  chalk.level = 3;
});

describe("validateThemeSpec", () => {
  it("accepts the built-in themes", () => {
    expect(validateThemeSpec(DEEPSEEK_DARK)).not.toBeNull();
    expect(validateThemeSpec(DEEPSEEK_LIGHT)).not.toBeNull();
  });

  it("rejects invalid shapes", () => {
    expect(validateThemeSpec(null)).toBeNull();
    expect(validateThemeSpec({ name: "x", mode: "blue", background: null, colors: {} })).toBeNull();
    expect(
      validateThemeSpec({ name: "", mode: "dark", background: null, colors: DEEPSEEK_DARK.colors }),
    ).toBeNull();
    expect(
      validateThemeSpec({
        name: "x",
        mode: "dark",
        background: null,
        colors: { primary: "white" },
      }),
    ).toBeNull();
  });

  it("accepts hex colors and unknown extras are ignored", () => {
    const spec = validateThemeSpec({
      name: "custom",
      mode: "light",
      background: "#fafafa",
      colors: { ...DEEPSEEK_LIGHT.colors, primary: "#111111" },
      extra: "ignored",
    });
    expect(spec?.colors.primary).toBe("#111111");
    expect(spec?.background).toBe("#fafafa");
  });
});

describe("buildTheme", () => {
  it("styles with ansi sequences", () => {
    const theme = buildTheme(DEEPSEEK_DARK);
    expect(theme.user("hi")).toContain("hi");
    expect(theme.user("hi")).toContain("\u001b[");
    expect(theme.diffDel("x")).toContain("x");
  });

  it("inverts per mode: dark = black-on-white, light = white-on-black", () => {
    // ANSI SGR: 30=black fg, 37=white fg, 40=black bg, 47=white bg.
    expect(buildTheme(DEEPSEEK_DARK).inverted("x")).toContain("\u001b[30m\u001b[47m");
    expect(buildTheme(DEEPSEEK_LIGHT).inverted("x")).toContain("\u001b[37m\u001b[40m");
  });

  it("never crashes on unknown color names", () => {
    const spec = validateThemeSpec({
      name: "odd",
      mode: "dark",
      background: null,
      colors: { ...DEEPSEEK_DARK.colors, primary: "not-a-color" },
    });
    expect(spec).not.toBeNull();
    expect(() => buildTheme(spec!)).not.toThrow();
  });
});
